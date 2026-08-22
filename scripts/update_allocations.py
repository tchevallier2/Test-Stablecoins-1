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
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

OUTPUT_PATH = "allocations.json"

PROTOCOLS_URL = "https://api.llama.fi/protocols"
PROTOCOL_URL = "https://api.llama.fi/protocol/{slug}"
STABLECOINS_URL = "https://stablecoins.llama.fi/stablecoins"

# Phase 1 scope: the two coins that dominate supply.
#
# Aliases are matched exactly, never by prefix. Bridged and wrapped variants
# are the same economic dollar and fold in; look-alike tickers must not.
# USDTB (Ethena's USDtb) and USDT0 are distinct coins despite the prefix.
TARGET_TOKENS = {
    "USDT": {
        "label": "Tether USD",
        "aliases": {"USDT", "USDT.E", "USDTE", "AXLUSDT", "BSC-USD", "USDT_"},
    },
    "USDC": {
        "label": "USD Coin",
        "aliases": {"USDC", "USDC.E", "USDCE", "AXLUSDC", "USDBC", "USDC_"},
    },
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

MAX_DEFI_PROTOCOLS = int(os.environ.get("MAX_DEFI_PROTOCOLS", "45"))
REQUEST_PAUSE_SECONDS = 0.35  # free tier is ~500 requests per 5 minutes


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


def match_token(symbol: str) -> str | None:
    """Map a raw token symbol onto one of the target coins, or None."""
    s = normalise(symbol)
    for canonical, spec in TARGET_TOKENS.items():
        if s in spec["aliases"]:
            return canonical
    return None


def latest_token_breakdown(payload: dict) -> dict[str, float]:
    """
    Pull the most recent per-token USD balances out of a protocol payload.

    DefiLlama exposes this per chain under chainTvls[chain].tokensInUsd, each a
    time series of {date, tokens: {SYMBOL: usd}}. Some protocols carry a
    top-level tokensInUsd instead, so both shapes are handled and the per-chain
    one is preferred because it avoids the aggregate rows some entries add.
    """
    totals: dict[str, float] = {}

    chain_tvls = payload.get("chainTvls") or {}
    used_chain_level = False

    for chain, chain_data in chain_tvls.items():
        # These aggregate keys restate other chains and would double count.
        if any(k in chain for k in ("-borrowed", "-staking", "-pool2", "-vesting")):
            continue
        series = (chain_data or {}).get("tokensInUsd")
        if not series:
            continue
        tokens = (series[-1] or {}).get("tokens") or {}
        for symbol, usd in tokens.items():
            if isinstance(usd, (int, float)):
                totals[normalise(symbol)] = totals.get(normalise(symbol), 0.0) + usd
        used_chain_level = True

    if not used_chain_level:
        series = payload.get("tokensInUsd")
        if series:
            tokens = (series[-1] or {}).get("tokens") or {}
            for symbol, usd in tokens.items():
                if isinstance(usd, (int, float)):
                    totals[normalise(symbol)] = totals.get(normalise(symbol), 0.0) + usd

    return totals


# ── Supply denominators ───────────────────────────────────────────────────────


def fetch_circulating() -> dict[str, float]:
    """Total circulating supply per target coin, from DefiLlama."""
    print("Fetching stablecoin circulating supply…")
    payload = http_get_json(STABLECOINS_URL)
    result: dict[str, float] = {}
    if not payload:
        return result

    rows = payload.get("peggedAssets") if isinstance(payload, dict) else payload
    for row in rows or []:
        symbol = normalise(row.get("symbol"))
        if symbol not in TARGET_TOKENS:
            continue
        circulating = row.get("circulating") or {}
        # Keyed by peg type, e.g. {"peggedUSD": 1234}
        total = sum(v for v in circulating.values() if isinstance(v, (int, float)))
        if total:
            result[symbol] = total

    return result


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    print("Fetching protocol list…")
    protocols = http_get_json(PROTOCOLS_URL)
    if not protocols:
        print("✗ Could not fetch the protocol list.")
        return 1
    print(f"  {len(protocols)} protocols returned.")

    categories: dict[str, int] = {}
    for p in protocols:
        categories[p.get("category") or "?"] = categories.get(p.get("category") or "?", 0) + 1
    print("  Top categories: " + ", ".join(
        f"{c}={n}" for c, n in sorted(categories.items(), key=lambda kv: -kv[1])[:12]
    ))

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

    print(f"  Selected {len(cexes)} CEX entries and {len(defi)} DeFi protocols.")
    if not cexes:
        print("  ⚠ No protocols carried category 'CEX' — check the category name.")

    selected = [(p, "cex") for p in cexes] + [(p, "defi") for p in defi]

    venues: list[dict] = []
    unmatched_stable_symbols: dict[str, float] = {}
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

        breakdown = latest_token_breakdown(payload)
        holdings: dict[str, float] = {}

        for symbol, usd in breakdown.items():
            canonical = match_token(symbol)
            if canonical:
                holdings[canonical] = holdings.get(canonical, 0.0) + usd
            elif "USD" in symbol and usd > 25_000_000:
                # Surfaced so the alias lists can be widened deliberately
                # rather than by guessing.
                unmatched_stable_symbols[symbol] = (
                    unmatched_stable_symbols.get(symbol, 0.0) + usd
                )

        total = sum(holdings.values())
        if total > 1_000_000:
            venues.append(
                {
                    "name": name,
                    "slug": slug,
                    "kind": kind,
                    "category": protocol.get("category"),
                    "holdings": {k: round(v) for k, v in holdings.items()},
                    "total": round(total),
                }
            )
            print(f"      ${total:,.0f}")

        time.sleep(REQUEST_PAUSE_SECONDS)

    venues.sort(key=lambda v: -v["total"])

    circulating = fetch_circulating()
    attributed = {
        token: sum(v["holdings"].get(token, 0) for v in venues) for token in TARGET_TOKENS
    }

    tokens_summary = {}
    for token in TARGET_TOKENS:
        supply = circulating.get(token)
        attr = attributed.get(token, 0)
        tokens_summary[token] = {
            "label": TARGET_TOKENS[token]["label"],
            "circulating": round(supply) if supply else None,
            "attributed": round(attr),
            "unattributed": round(supply - attr) if supply else None,
            "attributedPct": round(attr / supply * 100, 2) if supply else None,
        }

    by_kind = {
        kind: round(sum(v["total"] for v in venues if v["kind"] == kind))
        for kind in ("cex", "defi")
    }

    payload = {
        "meta": {
            "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "source": "DefiLlama (api.llama.fi, stablecoins.llama.fi)",
            "scope": sorted(TARGET_TOKENS),
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
        "venues": venues,
        "diagnostics": {
            "unmatchedStablecoinSymbols": dict(
                sorted(unmatched_stable_symbols.items(), key=lambda kv: -kv[1])[:40]
            )
        },
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    print(f"\nWrote {OUTPUT_PATH}")
    print(f"  venues with holdings: {len(venues)} (CEX ${by_kind['cex']:,.0f}, DeFi ${by_kind['defi']:,.0f})")
    for token, summary in tokens_summary.items():
        if summary["circulating"]:
            print(
                f"  {token}: attributed ${summary['attributed']:,.0f} of "
                f"${summary['circulating']:,.0f} ({summary['attributedPct']}%)"
            )
        else:
            print(f"  {token}: attributed ${summary['attributed']:,.0f} (no supply figure)")

    print("\n  Top 15 venues:")
    for v in venues[:15]:
        print(f"    {v['kind']:4s} {v['name'][:34]:34s} ${v['total']:,.0f}")

    if unmatched_stable_symbols:
        print("\n  Large unmatched USD-ish symbols (candidates for the alias lists):")
        for symbol, usd in sorted(unmatched_stable_symbols.items(), key=lambda kv: -kv[1])[:20]:
            print(f"    {symbol:20s} ${usd:,.0f}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
