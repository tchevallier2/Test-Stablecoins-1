# Stablecoin Dashboard

A dependency-free dashboard tracking the stablecoin ecosystem: issuers, market
caps, reserve managers and custodians, daily market trends, peg stability and
market structure.

Live at **https://tchevallier2.github.io/Test-Stablecoins-1/**

## Views

| View | What it answers |
|---|---|
| **Issuer Dashboard** | Who issues what, with each issuer's coins, news and 30-day trend |
| **Stablecoin League Table** | Every coin ranked, sortable, with sparklines and 30-day change |
| **Stablecoins by Type** | Coins grouped by collateral model |
| **Trends** | Market cap over time, relative performance, growth leaders and laggards |
| **Market Structure** | Concentration, peg stability, chain deployment, collateral mix |

Views are deep-linkable — `#trends`, `#structure`, and so on.

## How the data flows

```
Google Sheet ──┐
               ├─> scripts/update_market_data.py ─> data.js ────> the page
CoinGecko API ─┘                                 └> history.json ┘
```

`.github/workflows/update-market-data.yml` runs daily at 06:00 UTC:

1. Fetches live market caps, prices and 24h change from CoinGecko.
2. Fetches issuer/coin/news metadata from a published Google Sheet
   (set `GOOGLE_SHEET_ID` under Settings → Variables → Actions).
3. Regenerates `data.js`, appends a dated snapshot to `history.json`.
4. Validates both files, then commits only if something changed.

Without `GOOGLE_SHEET_ID` the script falls back to patching market caps in the
existing `data.js` and still records history.

### Peg deviation

A stablecoin is only stable relative to *its own* peg, so each coin is priced in
its peg's unit rather than always in dollars — USD-pegged coins in `usd`,
`EURC` in `eur`, `PAXG`/`XAUT` in `xau` (troy ounce). A correctly pegged coin
prices at ~1.0 in its own unit whatever that unit is worth, so deviation in
basis points is comparable across every coin on the board.

### History

`history.json` holds one snapshot per day. The initial 50 days were
reconstructed from the repository's own git history — the daily job overwrites
`data.js` in place, so every earlier day survived only as a git blob:

```bash
python3 scripts/backfill_history.py   # idempotent; only fills missing days
```

## Local development

There is no build step, but the page fetches `history.json`, which browsers
block on `file://`. Serve the folder instead:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Checks

CI runs these on every push; the daily data job runs the validator before it
commits.

```bash
python3 scripts/validate_data.py       # data integrity + history continuity
python3 scripts/check_dom_contract.py  # every getElementById target exists
node --check app.js charts.js          # syntax
```

`validate_data.py` fails the build on duplicate tickers, totals that disagree
with the sum of their parts, out-of-order or future-dated snapshots, and
duplicate coins wearing a mangled ticker. It warns on coins serving stale sheet
values instead of live market data, and on any coin more than 500 bps off peg.

## Editing the data

Either edit the Google Sheet (the daily job picks it up), or use **Export CSV** /
**Import CSV** in the toolbar to round-trip through a spreadsheet. Import
updates existing coins by ticker and inserts unknown ones under their parent
issuer; the change is live in that browser session, and *Download updated
data.js* writes a file you can commit.

## Files

| File | Role |
|---|---|
| `index.html` | Page structure |
| `app.js` | State, views, analytics, import/export |
| `charts.js` | Dependency-free SVG chart primitives |
| `styles.css` | Styling, theming, chart palette |
| `data.js` | Generated — current issuers and coins |
| `history.json` | Generated — daily market cap snapshots |
| `scripts/` | Data pipeline and checks |
