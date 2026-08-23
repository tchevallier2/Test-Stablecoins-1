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
| **Where It Sits** | Which exchanges and protocols actually hold the supply |

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

## Where the supply sits

`data.js` answers *how much exists*. `allocations.json` answers *where it sits*,
which needs a different kind of source: balances of **labelled** addresses.
`.github/workflows/update-allocations.yml` runs weekly and drives
`scripts/update_allocations.py` against DefiLlama's free API.

Three limits are structural and are surfaced in the view itself, not buried:

- **Coverage is partial.** Only labelled addresses can be attributed —
  currently 37.7% of tracked supply. The rest sits at addresses nobody has
  tagged, and that residual is charted as its own band rather than rescaled
  away: a chart that hid it would imply the market is far better understood
  than it is.
- **Venues overlap.** A dollar lent on one protocol can be borrowed and
  redeposited on another, so venue totals are "value present at a venue", not
  a partition of supply.
- **Exchanges without proof-of-reserves are undercounted**, which makes the
  ones that publish look larger by comparison. Coinbase, for instance, does not
  appear in the source's exchange set at all.

Bridge escrow is bucketed separately from DeFi: a dollar locked in a bridge
backs a representation that is counted again on the destination chain, so
folding it into DeFi would overstate deployed capital.

### What is deliberately excluded

Widening scope from 2 coins to 21 surfaced several ways to count the same
dollar twice. Each is now excluded, and `validate_data.py` fails the build if a
coin attributes more than 1.25x its own supply — the symptom all of them shared:

- **The coin's own issuing protocol.** DefiLlama lists stablecoins as protocols
  in their own right, so "Ethena USDe" and "Tether Gold" were attributing each
  asset's entire backing to itself. Detected by symbol, falling back to the
  protocol name — Ethena carries its governance token as `symbol`, so symbol
  alone missed it and USDe attributed 191% of supply.
- **Roll-up TVL keys.** `chainTvls` carries `borrowed`, `staking` and friends
  both bare and chain-prefixed. Skipping only the prefixed form double counted
  every lending market.
- **Same-ticker namesakes.** Several listed assets share a ticker; taking the
  last match read USDe's supply off a $49k namesake. The largest wins.
- **Negative balances.** Some lending entries report net of borrowing and go
  below zero, silently offsetting real balances in the same total.

### Token matching

Aliases are matched **exactly, never by prefix**. Bridged variants
(`USDC.e`, `axlUSDC`, `AvalancheUSDC`) are the same economic dollar and fold in.
Look-alikes must not: `USDtb` and `USDT0` are separate coins, and receipt or
wrapper tokens (`aEthUSDT`, `syrupUSDC`, `sUSDe`, `PT-sUSDe-*`) represent a
*claim* on a deposit that is already counted, so including them would double
count billions. Any large unrecognised USD-ish ticker is reported under
`diagnostics.unmatchedStablecoinSymbols` so the alias lists grow from evidence.

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
| `allocations.json` | Generated — venue attribution for USDT and USDC |
| `scripts/` | Data pipeline and checks |
