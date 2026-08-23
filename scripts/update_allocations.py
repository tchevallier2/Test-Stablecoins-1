"""
Attributes stablecoin supply to the venues holding it — exchanges, lending
markets, DEX pools — and reports how much could not be attributed at all.

    python scripts/update_allocations.py

Writes allocations.json.

What this measures
------------------
data.js answers "how much exists". This answers "where does it sit", which is
a different question needing a different source: balances of *labelled*
addresses. DefiLlama maintains those labels and exposes them free.

Three limits are structural, not bugs, and the output states them so the
dashboard can too:

1. Coverage is partial. Only labelled addresses are attributable, and most
   supply sits in ordinary wallets nobody has labelled. The unattributed
   residual is expected to be the largest single bucket — it is reported as
   a first-class number rather than hidden by rescaling the rest to 100%.

2. Venues overlap. A dollar deposited in a lending market can be borrowed and
   redeposited elsewhere, so venue totals can double count. Treat these as
   "value present at a venue", not a partition of supply.

3. Exchange figures come from publicly identified wallets. An exchange that
   does not publish proof-of-reserves is undercounted or missing, which makes
   the ones that do publish look larger by comparison.

Why not the one-call endpoint
-----------------------------
DefiLlama's /tokenProtocols/{symbol} does exactly this in a single request,
but it is gated behind the Pro tier. The free route is to pull the protocol
list and read each protocol's own token breakdown, which is what this does.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

OUTPUT_PATH = "allocations.json"

PROTOCOLS_URL = "https://api.llama.fi/protocols"
PROTOCOL_URL = "https://api.llama.fi/protocol/{slug}"
STABLECOINS_URL = "https://stablecoins.llama.fi/stablecoins"

# Scope is driven by data.js so this view can never drift out of sync with the
# rest of the dashboard: whatever coins the dashboard tracks are the coins
# attributed here.
DATA_JS_PATH = "data.js"

# Aliases are matched exactly, never by prefix. Bridged and wrapped variants of
# the same economic dollar fold in; look-alikes must not. USDtb, USDT0 and USDT
# are three different coins, and aEthUSDT / syrupUSDC / sUSDe are *claims* on a
# deposit that is already counted — folding those in would double count.
#
# Every coin implicitly matches its own uppercased ticker; these are the extra
# bridged spellings observed in the wild.
EXTRA_ALIASES = {
    "USDT": {"USDT.E", "USDTE", "AXLUSDT", "BSC-USD"},
    "USDC": {"USDC.E", "USDCE", "AXLUSDC", "USDBC", "AVALANCHEUSDC"},
    "DAI": {"DAI.E", "XDAI", "AXLDAI"},
    "FRAX": {"FRAX.E"},
    "PYUSD": {"PYUSD0"},
}

# Categories worth attributing. DefiLlama has many; these are the ones that
# actually custody stablecoins in size.
DEFI_CATEGORIES = {
    "Lending",
    "Dexes",
    "Dexs",
    "CDP",
    "Yield",
    "Yield Aggregator",
    "Liquid Staking",
    "Bridge",
    "Basis Trading",
    "RWA",
    "Derivatives",
    "Leveraged Farming",
}

CEX_CATEGORIES = {"CEX"}

# Bridge escrow is not DeFi usage: the locked dollar backs a representation
# that is itself counted on the destination chain. Bucketed separately so the
# composition chart does not imply it is deployed capital.
BRIDGE_CATEGORIES = {"Bridge"}

MAX_DEFI_PROTOCOLS = int(os.environ.get("MAX_DEFI_PROTOCOLS", "45"))
REQUEST_PAUSE_SECONDS = 0.35  # free tier is ~500 requests per 5 minutes



# ── Scope ─────────────────────────────────────────────────────────────────────


def load_target_tokens() -> dict[str, dict]:
    """
    Build the attribution scope from data.js.

    Using the dashboard's own coin list rather than a second hardcoded one
    means a coin added to the sheet automatically becomes attributable, and the
    allocation view can never list a coin that appears nowhere else.
    """
    with open(DATA_JS_PATH) as f:
        content = f.read()
    match = re.search(r"const\s+STABLECOIN_DATA\s*=\s*(\{.*?\});\s*\n", content, re.DOTALL)
    if not match:
        raise SystemExit(f"Could not parse {DATA_JS_PATH}")
    data = json.loads(match.group(1))

    tokens: dict[str, dict] = {}
    for issuer in data.get("issuers", []):
        for sc in issuer.get("stablecoins", []):
            ticker = (sc.get("ticker") or "").strip()
            if not ticker:
                continue
            canonical = ticker.upper()
            tokens[canonical] = {
                "ticker": ticker,
                "label": sc.get("name") or ticker,
                "peg": sc.get("peg"),
                "dashboardMarketCap": sc.get("marketCap"),
                "aliases": {canonical} | EXTRA_ALIASES.get(canonical, set()),
            }

    # An alias claimed by two coins would silently move balances between them.
    owner: dict[str, str] = {}
    for canonical, spec in tokens.items():
        for alias in spec["aliases"]:
            if alias in owner and owner[alias] != canonical:
                raise SystemExit(
                    f"Alias collision: {alias!r} claimed by both "
                    f"{owner[alias]!r} and {canonical!r}"
                )
            owner[alias] = canonical

    return tokens


# ── HTTP ──────────────────────────────────────────────────────────────────────


def http_get_json(url: str, retries: int = 3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "stablecoin-dashboard/1.0"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            # A protocol with no breakdown is normal; do not burn retries on it.
            if exc.code in (400, 404):
                return None
            if attempt == retries - 1:
                raise
        except Exception:
            if attempt == retries - 1:
                raise
        wait = 2**attempt
        print(f"    retry {attempt + 1} in {wait}s…")
        time.sleep(wait)
    return None


# ── Token matching ────────────────────────────────────────────────────────────


def normalise(symbol: str) -> str:
    return (symbol or "").strip().upper()


def build_alias_index(tokens: dict[str, dict]) -> dict[str, str]:
    """Flatten the scope into alias → canonical for O(1) exact lookups."""
    return {alias: canonical for canonical, spec in tokens.items() for alias in spec["aliases"]}


def match_token(symbol: str, alias_index: dict[str, str]) -> str | None:
    """Map a raw token symbol onto one of the target coins, or None."""
    return alias_index.get(normalise(symbol))


def latest_token_breakdown(payload: dict) -> dict[str, dict[str, float]]:
    """
    Most recent per-chain, per-token USD balances for one protocol.

    Returns {chain: {SYMBOL: usd}}. DefiLlama exposes this under
    chainTvls[chain].tokensInUsd as a time series of {date, tokens}. Keeping the
    chain dimension rather than summing it away is what lets the dashboard
    answer "which chain is this sitting on" as well as "which venue".

    Some protocols carry only a top-level tokensInUsd; that is handled too and
    attributed to a synthetic "all" chain, since no better breakdown exists.
    """
    by_chain: dict[str, dict[str, float]] = {}

    for chain, chain_data in (payload.get("chainTvls") or {}).items():
        # Aggregate keys restate balances counted under a real chain.
        if any(k in chain for k in ("-borrowed", "-staking", "-pool2", "-vesting")):
            continue
        series = (chain_data or {}).get("tokensInUsd")
        if not series:
            continue
        tokens = (series[-1] or {}).get("tokens") or {}
        if not tokens:
            # Creating the bucket anyway would leave a phantom chain in the
            # output and, worse, suppress the top-level fallback below.
            continue
        bucket = by_chain.setdefault(chain, {})
        for symbol, usd in tokens.items():
            if isinstance(usd, (int, float)):
                key = normalise(symbol)
                bucket[key] = bucket.get(key, 0.0) + usd

    if not by_chain:
        series = payload.get("tokensInUsd")
        if series:
            tokens = (series[-1] or {}).get("tokens") or {}
            bucket = by_chain.setdefault("all", {})
            for symbol, usd in tokens.items():
                if isinstance(usd, (int, float)):
                    key = normalise(symbol)
                    bucket[key] = bucket.get(key, 0.0) + usd

    return by_chain


# ── Supply denominators ───────────────────────────────────────────────────────


def fetch_circulating(tokens: dict[str, dict]) -> dict[str, dict]:
    """
    Circulating supply per scoped coin.

    DefiLlama is preferred so numerator and denominator share a methodology.
    Coins it does not list (tokenised funds, some newer issues) fall back to the
    dashboard's own market cap, and the source is recorded either way so the UI
    never implies more precision than the number has.
    """
    print("Fetching stablecoin circulating supply…")
    payload = http_get_json(STABLECOINS_URL)
    result: dict[str, dict] = {}

    rows = (payload or {}).get("peggedAssets") if isinstance(payload, dict) else payload
    for row in rows or []:
        symbol = normalise(row.get("symbol"))
        if symbol not in tokens:
            continue
        circulating = row.get("circulating") or {}
        total = sum(v for v in circulating.values() if isinstance(v, (int, float)))
        if total:
            result[symbol] = {"value": total, "source": "defillama"}

    fallbacks = 0
    for canonical, spec in tokens.items():
        if canonical in result:
            continue
        cap = spec.get("dashboardMarketCap")
        if cap:
            result[canonical] = {"value": cap, "source": "dashboard"}
            fallbacks += 1

    print(f"  supply for {len(result)}/{len(tokens)} coins ({fallbacks} from data.js)")
    return result


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    tokens = load_target_tokens()
    alias_index = build_alias_index(tokens)
    print(f"Scope from {DATA_JS_PATH}: {len(tokens)} coins — {', '.join(sorted(tokens))}\n")

    print("Fetching protocol list…")
    protocols = http_get_json(PROTOCOLS_URL)
    if not protocols:
        print("✗ Could not fetch the protocol list.")
        return 1
    print(f"  {len(protocols)} protocols returned.")

    cexes = [p for p in protocols if (p.get("category") or "") in CEX_CATEGORIES]
    defi = [
        p
        for p in protocols
        if (p.get("category") or "") in DEFI_CATEGORIES
        and isinstance(p.get("tvl"), (int, float))
        and p["tvl"] > 0
    ]
    defi.sort(key=lambda p: -p["tvl"])
    defi = defi[:MAX_DEFI_PROTOCOLS]

    def kind_of(protocol: dict) -> str:
        category = protocol.get("category") or ""
        if category in CEX_CATEGORIES:
            return "cex"
        if category in BRIDGE_CATEGORIES:
            return "bridge"
        return "defi"

    selected = [(p, "cex") for p in cexes] + [(p, kind_of(p)) for p in defi]
    print(f"  Selected {len(cexes)} CEX entries and {len(defi)} DeFi protocols.\n")

    venues: list[dict] = []
    chain_totals: dict[str, dict] = {}
    unmatched: dict[str, float] = {}
    failures = 0

    for index, (protocol, kind) in enumerate(selected, start=1):
        slug = protocol.get("slug") or protocol.get("name", "").lower().replace(" ", "-")
        name = protocol.get("name") or slug
        print(f"  [{index}/{len(selected)}] {name} ({kind})…")

        try:
            payload = http_get_json(PROTOCOL_URL.format(slug=slug))
        except Exception as exc:
            print(f"      failed: {exc}")
            failures += 1
            time.sleep(REQUEST_PAUSE_SECONDS)
            continue

        if not payload:
            failures += 1
            time.sleep(REQUEST_PAUSE_SECONDS)
            continue

        holdings: dict[str, float] = {}
        venue_chains: dict[str, float] = {}

        for chain, symbols in latest_token_breakdown(payload).items():
            for symbol, usd in symbols.items():
                canonical = match_token(symbol, alias_index)
                if canonical:
                    holdings[canonical] = holdings.get(canonical, 0.0) + usd
                    venue_chains[chain] = venue_chains.get(chain, 0.0) + usd
                    slot = chain_totals.setdefault(
                        chain, {"chain": chain, "total": 0.0, "cex": 0.0, "defi": 0.0, "bridge": 0.0}
                    )
                    slot["total"] += usd
                    slot[kind] += usd
                elif "USD" in symbol and usd > 25_000_000:
                    unmatched[symbol] = unmatched.get(symbol, 0.0) + usd

        total = sum(holdings.values())
        if total > 1_000_000:
            venues.append(
                {
                    "name": name,
                    "slug": slug,
                    "kind": kind,
                    "category": protocol.get("category"),
                    "holdings": {k: round(v) for k, v in sorted(holdings.items(), key=lambda kv: -kv[1])},
                    "chains": {
                        k: round(v)
                        for k, v in sorted(venue_chains.items(), key=lambda kv: -kv[1])
                        if v > 1_000_000
                    },
                    "total": round(total),
                }
            )
            print(f"      ${total:,.0f} across {len(holdings)} coin(s), {len(venue_chains)} chain(s)")

        time.sleep(REQUEST_PAUSE_SECONDS)

    venues.sort(key=lambda v: -v["total"])

    circulating = fetch_circulating(tokens)

    tokens_summary = {}
    for canonical, spec in tokens.items():
        attributed = sum(v["holdings"].get(canonical, 0) for v in venues)
        supply_row = circulating.get(canonical)
        supply = supply_row["value"] if supply_row else None
        # Attribution can exceed reported supply when a venue's labels overlap;
        # report it rather than clamping, so the discrepancy stays visible.
        tokens_summary[canonical] = {
            "label": spec["label"],
            "ticker": spec["ticker"],
            "circulating": round(supply) if supply else None,
            "circulatingSource": supply_row["source"] if supply_row else None,
            "attributed": round(attributed),
            "unattributed": round(supply - attributed) if supply else None,
            "attributedPct": round(attributed / supply * 100, 2) if supply else None,
            "venueCount": sum(1 for v in venues if v["holdings"].get(canonical)),
        }

    by_kind = {
        kind: round(sum(v["total"] for v in venues if v["kind"] == kind))
        for kind in ("cex", "defi", "bridge")
    }

    by_chain = sorted(
        (
            {k: (round(x) if isinstance(x, float) else x) for k, x in slot.items()}
            for slot in chain_totals.values()
            if slot["total"] > 1_000_000
        ),
        key=lambda c: -c["total"],
    )

    payload = {
        "meta": {
            "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "source": "DefiLlama (api.llama.fi, stablecoins.llama.fi)",
            "scope": sorted(tokens),
            "protocolsQueried": len(selected),
            "protocolsWithHoldings": len(venues),
            "requestFailures": failures,
            "caveats": [
                "Only labelled addresses are attributable; the unattributed "
                "residual is real supply nobody has tagged, not an error.",
                "Venue totals can double count — a dollar lent on one protocol "
                "can be borrowed and redeposited on another.",
                "Exchange balances come from publicly identified wallets, so "
                "exchanges without proof-of-reserves are undercounted.",
            ],
        },
        "tokens": tokens_summary,
        "byKind": by_kind,
        "byChain": by_chain,
        "venues": venues,
        "diagnostics": {
            "unmatchedStablecoinSymbols": dict(
                sorted(unmatched.items(), key=lambda kv: -kv[1])[:40]
            )
        },
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    attributed_total = sum(t["attributed"] for t in tokens_summary.values())
    supply_total = sum(t["circulating"] or 0 for t in tokens_summary.values())

    print(f"\nWrote {OUTPUT_PATH}")
    print(
        f"  {len(venues)} venues — CEX ${by_kind['cex']:,.0f}, "
        f"DeFi ${by_kind['defi']:,.0f}, bridges ${by_kind['bridge']:,.0f}"
    )
    if supply_total:
        print(
            f"  attributed ${attributed_total:,.0f} of ${supply_total:,.0f} "
            f"({attributed_total / supply_total * 100:.1f}%)"
        )

    print("\n  Per coin:")
    for canonical, t in sorted(tokens_summary.items(), key=lambda kv: -(kv[1]["attributed"])):
        if not t["attributed"]:
            continue
        pct = f"{t['attributedPct']}%" if t["attributedPct"] is not None else "n/a"
        print(
            f"    {canonical:8s} attributed ${t['attributed']:>15,.0f}  ({pct:>7s} of supply)"
            f"  in {t['venueCount']} venue(s)"
        )

    print("\n  Top 12 chains:")
    for c in by_chain[:12]:
        print(
            f"    {c['chain'][:20]:20s} ${c['total']:>15,.0f}  "
            f"(cex ${c['cex']:,.0f} · defi ${c['defi']:,.0f} · bridge ${c['bridge']:,.0f})"
        )

    if unmatched:
        print("\n  Large unmatched USD-ish symbols:")
        for symbol, usd in sorted(unmatched.items(), key=lambda kv: -kv[1])[:20]:
            print(f"    {symbol:22s} ${usd:,.0f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
