"""
Exports data.js into three CSV files ready for Google Sheets import:
  - issuers.csv
  - stablecoins.csv
  - news.csv

Usage:
  python scripts/export_to_csv.py

Output files are written to the project root.
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_JS = ROOT / "data.js"


def load_data_js(path: Path) -> dict:
    """Use Node.js vm to evaluate data.js and return the data as a Python dict."""
    import subprocess
    # Use forward slashes so Node doesn't choke on Windows backslashes
    fwd = str(path).replace("\\", "/")
    node_script = (
        "const fs = require('fs'), vm = require('vm');"
        f"let src = fs.readFileSync('{fwd}', 'utf8');"
        "src = src.replace(/const STABLECOIN_DATA\\s*=/, 'globalThis.STABLECOIN_DATA =');"
        "vm.runInThisContext(src);"
        "const d = globalThis.STABLECOIN_DATA;"
        "process.stdout.write(JSON.stringify({meta: d.meta, issuers: d.issuers}));"
    )
    result = subprocess.run(
        ["node", "-e", node_script],
        capture_output=True, text=True, encoding="utf-8"
    )
    if result.returncode != 0:
        sys.exit(f"Node.js error: {result.stderr}")
    return json.loads(result.stdout)


def write_issuers(issuers: list, out: Path) -> None:
    fields = [
        "ID", "Name", "Logo", "Logo Color", "Founded",
        "Headquarters", "Website", "Description", "Regulatory Status",
    ]
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for iss in issuers:
            w.writerow({
                "ID":                iss.get("id", ""),
                "Name":              iss.get("name", ""),
                "Logo":              iss.get("logo", ""),
                "Logo Color":        iss.get("logoColor", ""),
                "Founded":           iss.get("founded", ""),
                "Headquarters":      iss.get("headquarters", ""),
                "Website":           iss.get("website", ""),
                "Description":       iss.get("description", ""),
                "Regulatory Status": iss.get("regulatoryStatus", ""),
            })
    print(f"  Wrote {len(issuers)} rows -> {out.name}")


def write_stablecoins(issuers: list, out: Path) -> None:
    fields = [
        "Ticker", "Name", "Parent Issuer", "Legal Issuer",
        "Peg", "Type", "Market Cap (USD)", "Launched", "Status",
        "Reserves Description", "Asset Manager", "Custodian",
        "Blockchains", "Is New",
    ]
    rows = []
    for iss in issuers:
        for sc in iss.get("stablecoins", []):
            rows.append({
                "Ticker":               sc.get("ticker", ""),
                "Name":                 sc.get("name", ""),
                "Parent Issuer":        iss.get("name", ""),
                "Legal Issuer":         sc.get("issuer", ""),
                "Peg":                  sc.get("peg", ""),
                "Type":                 sc.get("type", ""),
                "Market Cap (USD)":     sc.get("marketCap", "") or "",
                "Launched":             sc.get("launched", "") or "",
                "Status":               sc.get("status", "active"),
                "Reserves Description": sc.get("reserves", "") or "",
                "Asset Manager":        sc.get("reserveManager", "") or "",
                "Custodian":            sc.get("custodian", "") or "",
                "Blockchains":          ", ".join(sc.get("blockchains", [])),
                "Is New":               "yes" if sc.get("isNew") else "",
            })
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  Wrote {len(rows)} rows -> {out.name}")


def write_news(issuers: list, out: Path) -> None:
    fields = ["Issuer", "Date", "Headline", "Summary", "Tags", "URL"]
    rows = []
    for iss in issuers:
        for item in iss.get("news", []):
            rows.append({
                "Issuer":   iss.get("name", ""),
                "Date":     item.get("date", ""),
                "Headline": item.get("headline", ""),
                "Summary":  item.get("summary", ""),
                "Tags":     ", ".join(item.get("tags", [])),
                "URL":      item.get("url", "") or "",
            })
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  Wrote {len(rows)} rows -> {out.name}")


def main():
    print(f"Reading {DATA_JS}…")
    data = load_data_js(DATA_JS)
    issuers = data.get("issuers", [])
    print(f"Found {len(issuers)} issuers.\n")

    write_issuers(issuers,     ROOT / "issuers.csv")
    write_stablecoins(issuers, ROOT / "stablecoins.csv")
    write_news(issuers,        ROOT / "news.csv")

    print("\nDone. Next steps:")
    print("  1. Create a new Google Sheet with 3 tabs: Issuers, Stablecoins, News")
    print("  2. In each tab: File -> Import -> Upload the matching CSV")
    print("     (choose 'Replace current sheet', comma separator)")
    print("  3. Publish the sheet: File -> Share -> Publish to web")
    print("  4. Add the Sheet ID to GitHub: Settings -> Variables -> Actions -> GOOGLE_SHEET_ID")


if __name__ == "__main__":
    main()
