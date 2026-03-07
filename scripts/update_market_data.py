"""
Generates data.js from two live sources:

  1. Google Sheets (metadata)  — issuer info, custodians, asset managers,
     blockchains, news, etc.  Set the spreadsheet ID in GitHub repo settings:
     Settings → Variables → Actions → New repository variable → GOOGLE_SHEET_ID

  2. CoinGecko free API (market data) — live market caps, always preferred
     over whatever is in the sheet.

Fallback: if GOOGLE_SHEET_ID is not set the script falls back to the
original behaviour — it just patches the marketCap fields in the existing
data.js without touching anything else.

Google Sheet structure (3 tabs, same column headers as the ↓ Export Excel):
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

# Maps each ticker to its CoinGecko coin ID.
# Tickers not listed here are skipped (CoinGecko value kept as-is).
TICKER_TO_CG_ID = {
    "USDT":   "tether",
    "XAUT":   "tether-gold",
    "USDC":   "usd-coin",
    "EURC":   "euro-coin",
    "USDS":   "usds",
    "DAI":    "dai",
    "USDe":   "ethena-usde",
    "USDtb":  "ethena-usdb",
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
}

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

def fetch_market_caps() -> dict[str, int]:
    """Returns ticker → market_cap_usd (int) for every mapped coin."""
    ids = ",".join(TICKER_TO_CG_ID.values())
    url = (
        "https://api.coingecko.com/api/v3/simple/price"
        f"?ids={ids}&vs_currencies=usd&include_market_cap=true"
    )
    print("Fetching market caps from CoinGecko…")
    raw = json.loads(http_get(url))

    cg_to_ticker = {v: k for k, v in TICKER_TO_CG_ID.items()}
    result = {}
    for cg_id, prices in raw.items():
        cap = prices.get("usd_market_cap")
        if cap is not None and cg_id in cg_to_ticker:
            result[cg_to_ticker[cg_id]] = int(cap)
    return result

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


def build_from_sheets(sheet_id: str, mcap_by_ticker: dict[str, int]) -> dict:
    """
    Fetches the three Google Sheets tabs and assembles the full data
    structure.  Market caps from CoinGecko always override the sheet value.
    """
    print("Building data from Google Sheets…")
    issuers_rows = fetch_sheet(sheet_id, "Issuers")
    coins_rows   = fetch_sheet(sheet_id, "Stablecoins")
    news_rows    = fetch_sheet(sheet_id, "News")

    # ── Group coins by parent issuer ──────────────────────────────────────────
    coins_by_issuer: dict[str, list] = {}
    for row in coins_rows:
        parent = _str(row.get("Parent Issuer"))
        if not parent:
            continue
        ticker = _str(row.get("Ticker"))

        # Market cap: CoinGecko wins; fall back to sheet value
        mcap = mcap_by_ticker.get(ticker)
        if mcap is None:
            sheet_val = _str(row.get("Market Cap (USD)"))
            try:
                mcap = int(float(sheet_val)) if sheet_val else None
            except ValueError:
                mcap = None

        blockchains = [
            b.strip()
            for b in _str(row.get("Blockchains")).split(",")
            if b.strip()
        ]

        sc: dict = {
            "ticker":          ticker,
            "name":            _str(row.get("Name")),
            "peg":             _str(row.get("Peg")),
            "marketCap":       mcap,
            "type":            _str(row.get("Type")),
            "launched":        _str(row.get("Launched")) or None,
            "status":          _str(row.get("Status")) or "active",
            "reserves":        _str(row.get("Reserves Description")) or None,
            "reserveManager":  _str(row.get("Asset Manager")) or None,
            "custodian":       _str(row.get("Custodian")) or None,
            "blockchains":     blockchains,
        }

        # Legal issuer override (e.g. USDtb → Anchorage Digital Bank)
        legal = _str(row.get("Legal Issuer"))
        if legal and legal != parent:
            sc["issuer"] = legal

        if _str(row.get("Is New")).lower() in ("yes", "true", "1"):
            sc["isNew"] = True

        coins_by_issuer.setdefault(parent, []).append(sc)

    # ── Group news by issuer ──────────────────────────────────────────────────
    news_by_issuer: dict[str, list] = {}
    for row in news_rows:
        issuer_name = _str(row.get("Issuer"))
        if not issuer_name:
            continue
        tags = [t.strip() for t in _str(row.get("Tags")).split(",") if t.strip()]
        item: dict = {
            "date":     _str(row.get("Date")),
            "headline": _str(row.get("Headline")),
            "summary":  _str(row.get("Summary")),
            "tags":     tags,
        }
        url = _str(row.get("URL"))
        if url:
            item["url"] = url
        news_by_issuer.setdefault(issuer_name, []).append(item)

    # ── Build issuers list ────────────────────────────────────────────────────
    issuers = []
    for row in issuers_rows:
        name = _str(row.get("Name"))
        if not name:
            continue
        issuers.append({
            "id":               _str(row.get("ID")),
            "name":             name,
            "logo":             _str(row.get("Logo")) or "◈",
            "logoColor":        _str(row.get("Logo Color")) or "#2775CA",
            "founded":          _int(row.get("Founded")),
            "headquarters":     _str(row.get("Headquarters")),
            "website":          _str(row.get("Website")),
            "description":      _str(row.get("Description")),
            "regulatoryStatus": _str(row.get("Regulatory Status")),
            "stablecoins":      coins_by_issuer.get(name, []),
            "news":             news_by_issuer.get(name, []),
        })

    today     = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    total_cap = sum(
        sc.get("marketCap") or 0
        for iss in issuers
        for sc in iss["stablecoins"]
    )

    return {"meta": {"lastUpdated": today, "totalMarketCap": total_cap}, "issuers": issuers}


def write_data_js(data: dict) -> None:
    base_json = json.dumps(
        {"meta": data["meta"], "issuers": data["issuers"]}, indent=2
    )
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

# ── Fallback: patch-only mode ─────────────────────────────────────────────────

def patch_market_caps_only(mcap_by_ticker: dict[str, int]) -> None:
    """
    Original behaviour: read existing data.js, patch only the marketCap
    fields using regex, leave everything else untouched.
    Used when GOOGLE_SHEET_ID is not configured.
    """
    print("GOOGLE_SHEET_ID not set — patching market caps in existing data.js only.")
    with open("data.js") as f:
        content = f.read()

    updated = []
    for ticker, cap in mcap_by_ticker.items():
        pattern = rf'(ticker: "{re.escape(ticker)}",[\s\S]*?marketCap: )(\d+|null)'
        new_content = re.sub(pattern, rf"\g<1>{cap}", content)
        if new_content != content:
            updated.append(f"  {ticker}: {cap:,}")
            content = new_content

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    content = re.sub(r'lastUpdated: "[^"]*"', f'lastUpdated: "{today}"', content)

    total = sum(mcap_by_ticker.values())
    content = re.sub(r"totalMarketCap: \d+", f"totalMarketCap: {total}", content)

    with open("data.js", "w") as f:
        f.write(content)

    print(f"Patched {len(updated)} market caps:")
    for line in updated:
        print(line)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    mcap_by_ticker = fetch_market_caps()
    print(f"Got market caps for: {', '.join(sorted(mcap_by_ticker))}\n")

    if GOOGLE_SHEET_ID:
        data = build_from_sheets(GOOGLE_SHEET_ID, mcap_by_ticker)
        write_data_js(data)
        total = data["meta"]["totalMarketCap"]
        n_coins = sum(len(iss["stablecoins"]) for iss in data["issuers"])
        print(
            f"\nDone. Wrote {len(data['issuers'])} issuers, {n_coins} coins. "
            f"Total market cap: ${total:,.0f}"
        )
    else:
        patch_market_caps_only(mcap_by_ticker)
        print("\nDone. To enable full Google Sheets sync, set GOOGLE_SHEET_ID "
              "as a GitHub repository variable (Settings → Variables → Actions).")


if __name__ == "__main__":
    main()
