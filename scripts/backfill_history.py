"""
Reconstructs history.json from the repository's own git history.

The daily Action overwrites data.js in place, so every previous day's market
caps only survive as a git blob.  This script walks every revision of data.js,
parses the embedded JSON, and emits one snapshot per calendar day.

Run once to seed history.json; after that update_market_data.py appends to it
daily.  Re-running is safe — existing snapshots are preserved and only missing
days are filled in.

    python scripts/backfill_history.py
"""

import json
import os
import re
import subprocess
import sys

HISTORY_PATH = "history.json"

# data.js is `const STABLECOIN_DATA = { ... };` followed by a computed-stats
# block.  Grab the object literal between the first `{` and the `};` that ends
# the assignment.
ASSIGNMENT_RE = re.compile(
    r"const\s+STABLECOIN_DATA\s*=\s*(\{.*?\});\s*\n", re.DOTALL
)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], capture_output=True, text=True, check=True
    ).stdout


def parse_data_js(content: str) -> dict | None:
    """Extract the STABLECOIN_DATA object from a data.js revision."""
    match = ASSIGNMENT_RE.search(content)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def snapshot_from_data(data: dict) -> dict:
    """Reduce a full data.js payload to a compact daily snapshot."""
    coins = {}
    for issuer in data.get("issuers", []):
        for sc in issuer.get("stablecoins", []):
            ticker = sc.get("ticker")
            cap = sc.get("marketCap")
            if ticker and cap:
                coins[ticker] = int(cap)

    return {
        "date": data.get("meta", {}).get("lastUpdated"),
        "totalMarketCap": sum(coins.values()),
        "coins": coins,
    }


def collect_from_git() -> dict[str, dict]:
    """Walk every revision of data.js and build date → snapshot."""
    revs = git("log", "--format=%H", "--", "data.js").split()
    print(f"Scanning {len(revs)} revisions of data.js…")

    by_date: dict[str, dict] = {}
    skipped = 0

    for sha in revs:
        try:
            content = git("show", f"{sha}:data.js")
        except subprocess.CalledProcessError:
            skipped += 1
            continue

        data = parse_data_js(content)
        if not data:
            skipped += 1
            continue

        snap = snapshot_from_data(data)
        if not snap["date"] or not snap["coins"]:
            skipped += 1
            continue

        # git log is newest-first; the first snapshot seen for a date is the
        # last commit of that day, which is the one we want.
        by_date.setdefault(snap["date"], snap)

    if skipped:
        print(f"  Skipped {skipped} revisions that could not be parsed.")
    return by_date


def load_existing() -> dict[str, dict]:
    if not os.path.exists(HISTORY_PATH):
        return {}
    with open(HISTORY_PATH) as f:
        payload = json.load(f)
    return {s["date"]: s for s in payload.get("snapshots", [])}


def write_history(by_date: dict[str, dict]) -> None:
    snapshots = [by_date[d] for d in sorted(by_date)]
    payload = {
        "meta": {
            "description": "Daily stablecoin market cap snapshots.",
            "firstDate": snapshots[0]["date"] if snapshots else None,
            "lastDate": snapshots[-1]["date"] if snapshots else None,
            "snapshotCount": len(snapshots),
        },
        "snapshots": snapshots,
    }
    with open(HISTORY_PATH, "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")


def main() -> int:
    existing = load_existing()
    recovered = collect_from_git()

    added = [d for d in recovered if d not in existing]
    merged = {**recovered, **existing}  # existing wins — never clobber live data

    if not merged:
        print("No snapshots recovered. Is this a git repo with data.js history?")
        return 1

    write_history(merged)

    dates = sorted(merged)
    print(
        f"\nWrote {HISTORY_PATH}: {len(merged)} snapshots "
        f"({dates[0]} → {dates[-1]}), {len(added)} newly recovered from git."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
