"""
Validates data.js and history.json.

Runs in CI on every push and in the daily data workflow before anything is
committed, so a malformed hand edit to the Google Sheet cannot quietly ship a
broken dashboard.

Exits non-zero if any error is found.  Warnings are reported but do not fail
the build.

    python scripts/validate_data.py
"""

import json
import os
import re
import sys
from datetime import date, datetime, timedelta

DATA_PATH = "data.js"
HISTORY_PATH = "history.json"

REQUIRED_ISSUER_FIELDS = ("id", "name", "stablecoins")
REQUIRED_COIN_FIELDS = ("ticker", "name", "peg", "type")

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load_data_js(path: str = DATA_PATH) -> dict | None:
    if not os.path.exists(path):
        err(f"{path} does not exist")
        return None
    with open(path) as f:
        content = f.read()
    match = re.search(r"const\s+STABLECOIN_DATA\s*=\s*(\{.*?\});\s*\n", content, re.DOTALL)
    if not match:
        err(f"{path}: could not find the STABLECOIN_DATA assignment")
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        err(f"{path}: embedded JSON is invalid — {exc}")
        return None


def validate_data(data: dict) -> None:
    meta = data.get("meta") or {}
    if not meta.get("lastUpdated"):
        err("meta.lastUpdated is missing")
    else:
        try:
            updated = date.fromisoformat(meta["lastUpdated"])
            if updated > date.today() + timedelta(days=1):
                err(f"meta.lastUpdated is in the future: {meta['lastUpdated']}")
        except ValueError:
            err(f"meta.lastUpdated is not an ISO date: {meta['lastUpdated']!r}")

    issuers = data.get("issuers")
    if not isinstance(issuers, list) or not issuers:
        err("issuers must be a non-empty list")
        return

    seen_ids: set[str] = set()
    seen_tickers: dict[str, str] = {}
    seen_identities: dict[tuple, str] = {}
    running_total = 0
    coin_count = 0

    for iss in issuers:
        label = iss.get("name") or iss.get("id") or "<unnamed>"

        for field in REQUIRED_ISSUER_FIELDS:
            if not iss.get(field):
                err(f"issuer {label!r}: missing required field {field!r}")

        iid = iss.get("id")
        if iid:
            if iid in seen_ids:
                err(f"duplicate issuer id {iid!r}")
            seen_ids.add(iid)

        for sc in iss.get("stablecoins") or []:
            coin_count += 1
            ticker = sc.get("ticker") or "<no ticker>"

            for field in REQUIRED_COIN_FIELDS:
                if not sc.get(field):
                    err(f"{ticker}: missing required field {field!r}")

            # A duplicate ticker double counts that coin in every total.
            if ticker in seen_tickers:
                err(
                    f"duplicate ticker {ticker!r} "
                    f"(under {seen_tickers[ticker]!r} and {label!r}) — "
                    f"this double counts its market cap"
                )
            else:
                seen_tickers[ticker] = label

            cap = sc.get("marketCap")

            # Catches a copy-pasted sheet row that kept the coin's identity but
            # picked up a mangled ticker, which the check above cannot see.
            if cap and sc.get("name"):
                identity = (label, sc["name"], cap)
                if identity in seen_identities:
                    err(
                        f"{ticker!r} is identical to {seen_identities[identity]!r} "
                        f"(same issuer, name and market cap) — "
                        f"one of them is a duplicate row inflating the total"
                    )
                else:
                    seen_identities[identity] = ticker

            if cap is not None:
                if not isinstance(cap, (int, float)):
                    err(f"{ticker}: marketCap must be a number, got {type(cap).__name__}")
                elif cap < 0:
                    err(f"{ticker}: negative marketCap ({cap})")
                else:
                    running_total += cap

            if not isinstance(sc.get("blockchains", []), list):
                err(f"{ticker}: blockchains must be a list")

            dev = sc.get("pegDeviationBps")
            if dev is not None and abs(dev) > 500:
                warn(f"{ticker}: trading {dev:+.0f} bps from its {sc.get('peg')} peg")

            if sc.get("dataSource") == "sheet" and cap:
                warn(f"{ticker}: market cap came from the sheet, not live market data")

    stated = meta.get("totalMarketCap")
    if stated is not None and stated != running_total:
        err(
            f"meta.totalMarketCap ({stated:,}) does not match the sum of "
            f"coin market caps ({running_total:,})"
        )

    print(
        f"{DATA_PATH}: {len(issuers)} issuers, {coin_count} coins, "
        f"${running_total:,} total market cap"
    )


def validate_history() -> None:
    if not os.path.exists(HISTORY_PATH):
        warn(f"{HISTORY_PATH} not found — run scripts/backfill_history.py to seed it")
        return

    try:
        with open(HISTORY_PATH) as f:
            payload = json.load(f)
    except json.JSONDecodeError as exc:
        err(f"{HISTORY_PATH}: invalid JSON — {exc}")
        return

    snapshots = payload.get("snapshots")
    if not isinstance(snapshots, list) or not snapshots:
        err(f"{HISTORY_PATH}: snapshots must be a non-empty list")
        return

    seen: set[str] = set()
    previous: date | None = None
    tomorrow = date.today() + timedelta(days=1)

    for snap in snapshots:
        raw = snap.get("date")
        try:
            current = date.fromisoformat(raw)
        except (TypeError, ValueError):
            err(f"{HISTORY_PATH}: bad snapshot date {raw!r}")
            continue

        if raw in seen:
            err(f"{HISTORY_PATH}: duplicate snapshot for {raw}")
        seen.add(raw)

        if previous and current < previous:
            err(f"{HISTORY_PATH}: snapshots out of order at {raw}")
        previous = current

        if current > tomorrow:
            err(f"{HISTORY_PATH}: snapshot dated in the future: {raw}")

        coins = snap.get("coins")
        if not isinstance(coins, dict) or not coins:
            err(f"{HISTORY_PATH}: snapshot {raw} has no coin data")
            continue

        total = snap.get("totalMarketCap")
        summed = sum(v for v in coins.values() if isinstance(v, (int, float)))
        if total is not None and total != summed:
            err(
                f"{HISTORY_PATH}: snapshot {raw} total ({total:,}) "
                f"!= sum of coins ({summed:,})"
            )

    # Flag implausible day-over-day jumps, which usually mean a bad upstream row.
    for prev, curr in zip(snapshots, snapshots[1:]):
        a, b = prev.get("totalMarketCap"), curr.get("totalMarketCap")
        if a and b and abs(b - a) / a > 0.25:
            warn(
                f"{HISTORY_PATH}: total market cap moved "
                f"{(b / a - 1) * 100:+.1f}% on {curr.get('date')}"
            )

    gaps = 0
    dates = sorted(date.fromisoformat(s["date"]) for s in snapshots if s.get("date"))
    for prev, curr in zip(dates, dates[1:]):
        if (curr - prev).days > 1:
            gaps += 1

    print(
        f"{HISTORY_PATH}: {len(snapshots)} snapshots "
        f"({dates[0]} → {dates[-1]}), {gaps} gap(s)"
    )


def main() -> int:
    data = load_data_js()
    if data:
        validate_data(data)
    validate_history()

    if warnings:
        print(f"\n{len(warnings)} warning(s):")
        for w in warnings:
            print(f"  ⚠ {w}")

    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print(f"  ✗ {e}")
        return 1

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
