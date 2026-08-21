"""
Checks the contract between the JavaScript and index.html.

The app wires itself up almost entirely through getElementById and
querySelector, so a renamed or deleted element fails silently at runtime —
a null reference in one handler, and a whole view quietly stops rendering.
This script catches that at push time instead.

It verifies that:
  • every getElementById("…") in the JS has a matching id in index.html
  • every class the JS toggles or queries exists somewhere in the HTML or CSS
  • every view named in the VIEWS list has a matching "<name>-view" element
  • index.html loads every JS file the project ships

    python scripts/check_dom_contract.py
"""

import re
import sys
from pathlib import Path

HTML_PATH = Path("index.html")
CSS_PATH = Path("styles.css")
JS_FILES = [Path("app.js"), Path("charts.js")]

# IDs created at runtime rather than declared in the HTML.
RUNTIME_IDS = {
    "import-banner",
    "download-datajs-btn",
    "import-dismiss-btn",
    "modal-chart",
}

# Selectors on markup the JS builds itself, so they never appear in index.html.
RUNTIME_SELECTORS = {".type-tbody"}

errors: list[str] = []


def main() -> int:
    if not HTML_PATH.exists():
        print(f"✗ {HTML_PATH} not found")
        return 1

    html = HTML_PATH.read_text()
    css = CSS_PATH.read_text() if CSS_PATH.exists() else ""

    html_ids = set(re.findall(r'\bid="([^"]+)"', html))

    js_sources = {}
    for path in JS_FILES:
        if not path.exists():
            errors.append(f"{path} is missing but referenced by the project")
            continue
        js_sources[path] = path.read_text()

    # --- getElementById targets must exist ---
    for path, src in js_sources.items():
        for element_id in sorted(set(re.findall(r'getElementById\(\s*"([^"]+)"', src))):
            if element_id not in html_ids and element_id not in RUNTIME_IDS:
                errors.append(
                    f'{path}: getElementById("{element_id}") has no matching '
                    f"id in {HTML_PATH}"
                )

    # --- every declared view needs its panel ---
    views_match = re.search(r"const VIEWS = \[(.*?)\]", js_sources.get(Path("app.js"), ""), re.S)
    if views_match:
        views = re.findall(r'"([^"]+)"', views_match.group(1))
        if not views:
            errors.append("app.js: VIEWS list is empty")
        for view in views:
            if f"{view}-view" not in html_ids:
                errors.append(f'app.js: view "{view}" has no #{view}-view element')
            if f'data-view="{view}"' not in html:
                errors.append(f'app.js: view "{view}" has no tab button in {HTML_PATH}')
    else:
        errors.append("app.js: could not find the VIEWS list")

    # --- selectors used by the JS must be defined somewhere ---
    for path, src in js_sources.items():
        selectors = set(re.findall(r'querySelector(?:All)?\(\s*"([.#][\w-]+)', src))
        for selector in sorted(selectors - RUNTIME_SELECTORS):
            name = selector[1:]
            found = (
                f'id="{name}"' in html
                if selector.startswith("#")
                else (f"{selector}" in css or f'class="{name}' in html or f" {name}" in html)
            )
            if not found:
                errors.append(f"{path}: selector {selector} matches nothing in HTML or CSS")

    # --- the page must actually load the scripts ---
    for path in JS_FILES:
        if path.exists() and f'src="{path.name}"' not in html:
            errors.append(f"{HTML_PATH} does not load {path.name}")

    if errors:
        print(f"{len(errors)} problem(s):")
        for e in errors:
            print(f"  ✗ {e}")
        return 1

    print(
        f"DOM contract OK: {len(html_ids)} ids in {HTML_PATH}, "
        f"{len(js_sources)} script(s) checked."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
