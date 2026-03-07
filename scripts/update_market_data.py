"""
Fetches live stablecoin market caps from CoinGecko's free API
and updates the marketCap fields in data.js.

Runs as part of the GitHub Actions workflow (.github/workflows/update-market-data.yml).
"""

import json
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

# Maps each ticker in data.js to its CoinGecko coin ID.
# If a coin isn't on CoinGecko (e.g. too new or institutional-only),
# it's simply skipped and its existing value is preserved.
TICKER_TO_COINGECKO_ID = {
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

COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price"


def fetch_market_caps(coingecko_ids: list[str]) -> dict[str, int]:
    """Returns a dict of coingecko_id -> market_cap_usd (integer)."""
    ids_param = ",".join(coingecko_ids)
    url = (
        f"{COINGECKO_API}"
        f"?ids={ids_param}"
        f"&vs_currencies=usd"
        f"&include_market_cap=true"
    )

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "stablecoin-dashboard/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = json.loads(resp.read())
            break
        except Exception as exc:
            if attempt == 2:
                print(f"ERROR: CoinGecko request failed after 3 attempts: {exc}", file=sys.stderr)
                sys.exit(1)
            wait = 2 ** attempt
            print(f"Attempt {attempt + 1} failed ({exc}), retrying in {wait}s…")
            time.sleep(wait)

    result = {}
    for cg_id, prices in raw.items():
        cap = prices.get("usd_market_cap")
        if cap is not None:
            result[cg_id] = int(cap)
    return result


def update_data_js(market_caps_by_ticker: dict[str, int]) -> None:
    """Reads data.js, patches marketCap values, writes it back."""
    with open("data.js", "r") as f:
        content = f.read()

    updated = []
    skipped = []

    for ticker, cap in market_caps_by_ticker.items():
        # Match the ticker field followed (non-greedily) by its marketCap field
        # within the same stablecoin object.  Works because ticker always
        # appears before marketCap in every stablecoin block.
        pattern = rf'(ticker: "{re.escape(ticker)}",[\s\S]*?marketCap: )(\d+|null)'
        new_content = re.sub(pattern, rf"\g<1>{cap}", content)
        if new_content != content:
            updated.append(f"  {ticker}: {cap:,}")
            content = new_content
        else:
            skipped.append(ticker)

    # Update meta fields
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    content = re.sub(r'lastUpdated: "[^"]*"', f'lastUpdated: "{today}"', content)

    total = sum(market_caps_by_ticker.values())
    content = re.sub(r"totalMarketCap: \d+", f"totalMarketCap: {total}", content)

    with open("data.js", "w") as f:
        f.write(content)

    print(f"Updated {len(updated)} coins:")
    for line in updated:
        print(line)
    if skipped:
        print(f"Skipped (no regex match — check ticker spelling): {skipped}")
    print(f"lastUpdated → {today}")
    print(f"totalMarketCap → {total:,}")


def main():
    coingecko_ids = list(TICKER_TO_COINGECKO_ID.values())
    print(f"Fetching market caps for {len(coingecko_ids)} coins from CoinGecko…")
    raw_caps = fetch_market_caps(coingecko_ids)

    # Translate CoinGecko IDs back to tickers
    cg_id_to_ticker = {v: k for k, v in TICKER_TO_COINGECKO_ID.items()}
    market_caps_by_ticker = {
        cg_id_to_ticker[cg_id]: cap
        for cg_id, cap in raw_caps.items()
        if cg_id in cg_id_to_ticker
    }

    not_found = [t for t, cg_id in TICKER_TO_COINGECKO_ID.items() if cg_id not in raw_caps]
    if not_found:
        print(f"No CoinGecko data for: {not_found} (existing values kept)")

    update_data_js(market_caps_by_ticker)


if __name__ == "__main__":
    main()
