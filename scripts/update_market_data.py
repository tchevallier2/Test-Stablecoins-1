"""
Generates data.js from two live sources:

  1. Google Sheets (metadata)  — issuer info, custodians, asset managers,
     blockchains, news, etc.  Set the spreadsheet ID in GitHub repo settings:
     Settings → Variables → Actions → New repository variable → GOOGLE_SHEET_ID

  2. CoinGecko free API (market data) — live market caps, prices and 24h
     change, always preferred over whatever is in the sheet.

Also appends a daily snapshot to history.json so the dashboard can chart
trends over time.  Seed that file once with scripts/backfill_history.py.

Fallback: if GOOGLE_SHEET_ID is not set the script falls back to patching the
marketCap fields in the existing data.js without touching anything else.

Peg deviation
-------------
A stablecoin is only "stable" relative to its own peg, so each coin is priced
in its peg unit rather than always in USD: USD-pegged coins use vs_currency
usd, EUR-pegged coins use eur, and gold-backed coins use xau (troy ounce).
A correctly pegged coin prices at ~1.0 in its own unit regardless of what the
unit is worth in dollars.

Google Sheet structure (3 tabs, same column headers as the ↓ Export CSV):
  • Stablecoins — one row per coin
  • Issuers     — one row per issuer
  • News        — one row per news item
"""

import csv
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# ── Config ────────────────────────────────────────────────────────────────────

GOOGLE_SHEET_ID = os.environ.get("GOOGLE_SHEET_ID", "").strip()

HISTORY_PATH = "history.json"
MAX_HISTORY_DAYS = 1095  # ~3 years

# Maps each ticker to its CoinGecko coin ID.
# Tickers not listed here keep whatever the sheet provides and are reported as
# unmapped at the end of the run.
TICKER_TO_CG_ID = {
    "USDT":   "tether",
    "XAUT":   "tether-gold",
    "USDC":   "usd-coin",
    "EURC":   "euro-coin",
    "USDS":   "usds",
    "DAI":    "dai",
    "USDe":   "ethena-usde",
    "USDtb":  "ethena-usdtb",
    "PYUSD":  "paypal-usd",
    "USDP":   "paxos-standard",
    "PAXG":   "pax-gold",
    "RLUSD":  "ripple-usd",
    "FDUSD":  "first-digital-usd",
    "frxUSD": "frax-usd",
    "FRAX":   "frax",
    "FPI":    "frax-price-index",
    "USDY":   "ondo-us-dollar-yield",
    "OUSG":   "ondo-short-term-us-government-bond-fund",
    "USDT0":  "usdt0",
    "USDL":   "lift-dollar",
}

# Which CoinGecko vs_currency each peg is measured against.  A coin pegged to
# gold should be ~1.0 XAU, not ~1.0 USD.
PEG_TO_VS_CURRENCY = {
    "USD": "usd",
    "EUR": "eur",
    "GOLD": "xau",
    "XAU": "xau",
}

VS_CURRENCIES = ["usd", "eur", "xau"]

# ── HTTP helper ───────────────────────────────────────────────────────────────


def http_get(url: str, retries: int = 3) -> bytes:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, headers={"User-Agent": "stablecoin-dashboard/1.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except Exception as exc:
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  Attempt {attempt + 1} failed ({exc}), retrying in {wait}s…")
            time.sleep(wait)


# ── CoinGecko ─────────────────────────────────────────────────────────────────


def fetch_market_data() -> dict[str, dict]:
    """
    Returns ticker → {marketCap, prices: {usd, eur, xau}, change24h}.

    Prices are fetched in every vs_currency we might need so that each coin can
    later be compared against its own peg unit.
    """
    ids = ",".join(sorted(set(TICKER_TO_CG_ID.values())))
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        f"?ids={ids}"
        f"&vs_currencies={','.join(VS_CURRENCIES)}"
        "&include_market_cap=true"
        "&include_24hr_change=true"
    )
    print("Fetching market data from CoinGecko…")
    raw = json.loads(http_get(url))

    cg_to_ticker = {v: k for k, v in TICKER_TO_CG_ID.items()}
    result: dict[str, dict] = {}

    for cg_id, payload in raw.items():
        ticker = cg_to_ticker.get(cg_id)
        if not ticker:
            continue

        prices = {c: payload.get(c) for c in VS_CURRENCIES if payload.get(c) is not None}
        result[ticker] = {
            "marketCap": int(payload["usd_market_cap"])
            if payload.get("usd_market_cap") is not None
            else None,
            "prices": prices,
            "change24h": payload.get("usd_24h_change"),
        }

    return result


def peg_deviation_bps(peg: str, prices: dict) -> float | None:
    """
    How far the coin trades from its peg, in basis points (1 bp = 0.01%).

    Returns None when we have no price in the peg's own unit — better to show
    nothing than to compare a EUR-pegged coin against a dollar.
    """
    vs = PEG_TO_VS_CURRENCY.get((peg or "").strip().upper())
    if not vs:
        return None
    price = prices.get(vs)
    if not price:
        return None
    return round((price - 1.0) * 10_000, 2)


# ── Google Sheets ─────────────────────────────────────────────────────────────


def fetch_sheet(sheet_id: str, sheet_name: str) -> list[dict]:
    """Fetch one tab from a publicly-published Google Sheet as CSV rows."""
    encoded = urllib.parse.quote(sheet_name)
    url = (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}"
        f"/gviz/tq?tqx=out:csv&sheet={encoded}"
    )
    print(f"  Fetching sheet '{sheet_name}'…")
    data = http_get(url).decode("utf-8")
    return list(csv.DictReader(io.StringIO(data)))


def _str(val) -> str:
    return (val or "").strip()


def _int(val) -> int | None:
    v = _str(val)
    try:
        return int(v) if v else None
    except ValueError:
        return None


def build_from_sheets(sheet_id: str, market: dict[str, dict]) -> dict:
    """
    Fetches the three Google Sheets tabs and assembles the full data
    structure.  Market data from CoinGecko always overrides the sheet value.
    """
    print("Building data from Google Sheets…")
    issuers_rows = fetch_sheet(sheet_id, "Issuers")
    coins_rows = fetch_sheet(sheet_id, "Stablecoins")
    news_rows = fetch_sheet(sheet_id, "News")

    # ── Group coins by parent issuer ──────────────────────────────────────────
    coins_by_issuer: dict[str, list] = {}
    seen_tickers: dict[str, str] = {}  # ticker → parent issuer that claimed it
    seen_identities: dict[tuple, str] = {}  # (issuer, name, cap) → ticker
    duplicates: list[str] = []
    stale: list[str] = []

    for row in coins_rows:
        parent = _str(row.get("Parent Issuer"))
        if not parent:
            continue
        ticker = _str(row.get("Ticker"))
        if not ticker:
            continue

        # The sheet is hand-edited, so an accidental duplicate row would double
        # count that coin in every total.  Keep the first, report the rest.
        if ticker in seen_tickers:
            duplicates.append(f"{ticker} (also under {seen_tickers[ticker]})")
            continue
        seen_tickers[ticker] = parent

        # A copy-paste in the sheet can also produce the same coin under a
        # mangled ticker (e.g. OUSG duplicated as OUSG2223).  The ticker differs
        # so the check above misses it, but one issuer will not have two
        # distinct coins sharing a name and a market cap to the dollar.
        identity = (parent, _str(row.get("Name")), _str(row.get("Market Cap (USD)")))
        if identity[1] and identity[2] and identity in seen_identities:
            duplicates.append(
                f"{ticker} (identical to {seen_identities[identity]} — "
                f"same name and market cap under {parent})"
            )
            continue
        seen_identities[identity] = ticker

        live = market.get(ticker, {})
        peg = _str(row.get("Peg"))

        # Market cap: CoinGecko wins; fall back to sheet value
        mcap = live.get("marketCap")
        is_live = mcap is not None
        if not is_live:
            sheet_val = _str(row.get("Market Cap (USD)"))
            try:
                mcap = int(float(sheet_val)) if sheet_val else None
            except ValueError:
                mcap = None
            if ticker in TICKER_TO_CG_ID:
                # We expected live data for this one and did not get it, which
                # usually means the CoinGecko ID is wrong or the coin was
                # delisted.  Surface it instead of silently serving a stale
                # number that looks live.
                stale.append(ticker)

        blockchains = [
            b.strip() for b in _str(row.get("Blockchains")).split(",") if b.strip()
        ]

        sc: dict = {
            "ticker": ticker,
            "name": _str(row.get("Name")),
            "peg": peg,
            "marketCap": mcap,
            "type": _str(row.get("Type")),
            "launched": _str(row.get("Launched")) or None,
            "status": _str(row.get("Status")) or "active",
            "reserves": _str(row.get("Reserves Description")) or None,
            "reserveManager": _str(row.get("Asset Manager")) or None,
            "custodian": _str(row.get("Custodian")) or None,
            "blockchains": blockchains,
        }

        # Live market fields — only present when CoinGecko had the coin.
        prices = live.get("prices") or {}
        if prices:
            vs = PEG_TO_VS_CURRENCY.get(peg.upper())
            if vs and prices.get(vs) is not None:
                sc["price"] = prices[vs]
                sc["priceUnit"] = vs.upper()
            if prices.get("usd") is not None:
                sc["priceUsd"] = prices["usd"]

            dev = peg_deviation_bps(peg, prices)
            if dev is not None:
                sc["pegDeviationBps"] = dev

        if live.get("change24h") is not None:
            sc["change24h"] = round(live["change24h"], 4)

        sc["dataSource"] = "live" if is_live else "sheet"

        # Legal issuer override (e.g. USDtb → Anchorage Digital Bank)
        legal = _str(row.get("Legal Issuer"))
        if legal and legal != parent:
            sc["issuer"] = legal

        if _str(row.get("Is New")).lower() in ("yes", "true", "1"):
            sc["isNew"] = True

        coins_by_issuer.setdefault(parent, []).append(sc)

    if duplicates:
        print("\n  ⚠ Duplicate tickers in the sheet (kept first occurrence only):")
        for d in duplicates:
            print(f"      {d}")
    if stale:
        print("\n  ⚠ Expected live data but got none (check the CoinGecko ID):")
        for t in stale:
            print(f"      {t} → {TICKER_TO_CG_ID[t]}")

    # ── Group news by issuer ──────────────────────────────────────────────────
    news_by_issuer: dict[str, list] = {}
    for row in news_rows:
        issuer_name = _str(row.get("Issuer"))
        if not issuer_name:
            continue
        tags = [t.strip() for t in _str(row.get("Tags")).split(",") if t.strip()]
        item: dict = {
            "date": _str(row.get("Date")),
            "headline": _str(row.get("Headline")),
            "summary": _str(row.get("Summary")),
            "tags": tags,
        }
        url = _str(row.get("URL"))
        if url:
            item["url"] = url
        news_by_issuer.setdefault(issuer_name, []).append(item)

    # Newest news first, so the dashboard does not depend on sheet row order.
    for items in news_by_issuer.values():
        items.sort(key=lambda i: i.get("date") or "", reverse=True)

    # ── Build issuers list ────────────────────────────────────────────────────
    issuers = []
    for row in issuers_rows:
        name = _str(row.get("Name"))
        if not name:
            continue
        issuers.append(
            {
                "id": _str(row.get("ID")),
                "name": name,
                "logo": _str(row.get("Logo")) or "◈",
                "logoColor": _str(row.get("Logo Color")) or "#2775CA",
                "founded": _int(row.get("Founded")),
                "headquarters": _str(row.get("Headquarters")),
                "website": _str(row.get("Website")),
                "description": _str(row.get("Description")),
                "regulatoryStatus": _str(row.get("Regulatory Status")),
                "stablecoins": coins_by_issuer.get(name, []),
                "news": news_by_issuer.get(name, []),
            }
        )

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_cap = sum(
        sc.get("marketCap") or 0 for iss in issuers for sc in iss["stablecoins"]
    )

    return {
        "meta": {
            "lastUpdated": today,
            "totalMarketCap": total_cap,
            "liveCoins": sum(
                1
                for iss in issuers
                for sc in iss["stablecoins"]
                if sc.get("dataSource") == "live"
            ),
        },
        "issuers": issuers,
    }


def write_data_js(data: dict) -> None:
    base_json = json.dumps({"meta": data["meta"], "issuers": data["issuers"]}, indent=2)
    content = (
        f"const STABLECOIN_DATA = {base_json};\n\n"
        "// Computed stats\n"
        "STABLECOIN_DATA.stats = {\n"
        "  totalIssuers: STABLECOIN_DATA.issuers.length,\n"
        "  totalStablecoins: STABLECOIN_DATA.issuers.reduce(\n"
        "    (sum, i) => sum + i.stablecoins.length,\n"
        "    0\n"
        "  ),\n"
        "  totalMarketCap: STABLECOIN_DATA.issuers.reduce(\n"
        "    (sum, i) =>\n"
        "      sum +\n"
        "      i.stablecoins.reduce((s, sc) => s + (sc.marketCap || 0), 0),\n"
        "    0\n"
        "  ),\n"
        "  uniqueBlockchains: [\n"
        "    ...new Set(\n"
        "      STABLECOIN_DATA.issuers.flatMap((i) =>\n"
        "        i.stablecoins.flatMap((sc) => sc.blockchains)\n"
        "      )\n"
        "    ),\n"
        "  ],\n"
        "};\n"
    )
    with open("data.js", "w") as f:
        f.write(content)


# ── History ───────────────────────────────────────────────────────────────────


def append_history(data: dict) -> None:
    """
    Record today's snapshot in history.json, replacing any existing entry for
    the same date so re-runs stay idempotent.
    """
    coins: dict[str, int] = {}
    prices: dict[str, float] = {}
    for iss in data["issuers"]:
        for sc in iss["stablecoins"]:
            if sc.get("marketCap"):
                coins[sc["ticker"]] = int(sc["marketCap"])
            if sc.get("price") is not None:
                prices[sc["ticker"]] = sc["price"]

    if not coins:
        print("No market caps to record — skipping history update.")
        return

    snapshot = {
        "date": data["meta"]["lastUpdated"],
        "totalMarketCap": sum(coins.values()),
        "coins": coins,
    }
    if prices:
        snapshot["prices"] = prices

    payload = {"meta": {}, "snapshots": []}
    if os.path.exists(HISTORY_PATH):
        try:
            with open(HISTORY_PATH) as f:
                payload = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            print(f"  ⚠ Could not read {HISTORY_PATH} ({exc}) — starting fresh.")

    by_date = {s["date"]: s for s in payload.get("snapshots", [])}
    by_date[snapshot["date"]] = snapshot

    snapshots = [by_date[d] for d in sorted(by_date)][-MAX_HISTORY_DAYS:]

    payload = {
        "meta": {
            "description": "Daily stablecoin market cap snapshots.",
            "firstDate": snapshots[0]["date"],
            "lastDate": snapshots[-1]["date"],
            "snapshotCount": len(snapshots),
        },
        "snapshots": snapshots,
    }

    with open(HISTORY_PATH, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")

    print(f"History: {len(snapshots)} snapshots ({snapshots[0]['date']} → {snapshots[-1]['date']}).")


# ── Fallback: patch-only mode ─────────────────────────────────────────────────


def patch_market_caps_only(market: dict[str, dict]) -> None:
    """
    Read the existing data.js and patch only the marketCap fields, leaving
    everything else untouched.  Used when GOOGLE_SHEET_ID is not configured.

    data.js is written as JSON (`"ticker": "USDT"`), so the patterns below match
    quoted keys.  Unquoted keys from the original hand-written file are also
    accepted so an older checkout still updates.
    """
    print("GOOGLE_SHEET_ID not set — patching market caps in existing data.js only.")
    with open("data.js") as f:
        content = f.read()

    updated = []
    for ticker, live in market.items():
        cap = live.get("marketCap")
        if cap is None:
            continue
        pattern = (
            rf'("?ticker"?\s*:\s*"{re.escape(ticker)}",[\s\S]*?"?marketCap"?\s*:\s*)'
            r"(\d+|null)"
        )
        new_content, n = re.subn(pattern, rf"\g<1>{cap}", content, count=1)
        if n:
            updated.append(f"  {ticker}: {cap:,}")
            content = new_content

    if not updated:
        print(
            "  ⚠ No market caps matched — data.js format may have changed. "
            "Leaving the file untouched."
        )
        return

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    content = re.sub(r'("?lastUpdated"?\s*:\s*)"[^"]*"', rf'\g<1>"{today}"', content)

    # Recompute the total from the file itself so unmapped coins still count.
    caps = [int(m) for m in re.findall(r'"?marketCap"?\s*:\s*(\d+)', content)]
    content = re.sub(
        r'("?totalMarketCap"?\s*:\s*)\d+', rf"\g<1>{sum(caps)}", content
    )

    with open("data.js", "w") as f:
        f.write(content)

    print(f"Patched {len(updated)} market caps:")
    for line in updated:
        print(line)


def load_data_js() -> dict | None:
    """Parse the generated data.js back into a dict (used by patch-only mode)."""
    try:
        with open("data.js") as f:
            content = f.read()
    except OSError:
        return None
    match = re.search(r"const\s+STABLECOIN_DATA\s*=\s*(\{.*?\});\s*\n", content, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    market = fetch_market_data()
    print(f"Got market data for: {', '.join(sorted(market))}")

    missing = sorted(set(TICKER_TO_CG_ID) - set(market))
    if missing:
        print(f"⚠ No CoinGecko response for: {', '.join(missing)}")
    print()

    if GOOGLE_SHEET_ID:
        data = build_from_sheets(GOOGLE_SHEET_ID, market)
        write_data_js(data)
        append_history(data)

        total = data["meta"]["totalMarketCap"]
        n_coins = sum(len(iss["stablecoins"]) for iss in data["issuers"])
        print(
            f"\nDone. Wrote {len(data['issuers'])} issuers, {n_coins} coins "
            f"({data['meta']['liveCoins']} with live data). "
            f"Total market cap: ${total:,.0f}"
        )
    else:
        patch_market_caps_only(market)
        data = load_data_js()
        if data:
            append_history(data)
        print(
            "\nDone. To enable full Google Sheets sync, set GOOGLE_SHEET_ID "
            "as a GitHub repository variable (Settings → Variables → Actions)."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
