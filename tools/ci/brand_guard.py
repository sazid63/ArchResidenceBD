"""Brand guard - user-facing surfaces never name the bundled engine.

Plan §5.3: everything user-facing is NativeCAD (or ArchResidenceBD); the engine name is
confined to About/licences attribution and internal engineering docs. This scans the
shipped UI source for the engine token and fails CI on any occurrence.

Scope:
- `app/` - the shipped UI (this check).
- Generated documents - guarded in-generator: `tools/spikes/s3/techdraw_headless.py`
  strips the sheet template's engine XML plumbing and asserts the composed sheet is
  token-free; W2.5's drawing generator must carry the same guard.
- About/licences attribution is intentionally out of scope (it is required).

Run from the repo root:  python tools/ci/brand_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCOPE = [ROOT / "app", ROOT / "installer"]  # installer/ will appear later
TOKEN = re.compile(r"freecad", re.IGNORECASE)
TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".htm",
    ".css", ".md", ".txt", ".svg", ".yml", ".yaml", ".xml", ".iss",
}
SKIP_DIRS = {"node_modules", "dist", "build", ".vite", "coverage", ".turbo"}


def main() -> int:
    hits: list[str] = []
    scanned = 0
    for base in SCOPE:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            scanned += 1
            text = path.read_text(encoding="utf-8", errors="replace")
            for n, line in enumerate(text.splitlines(), 1):
                if TOKEN.search(line):
                    hits.append(f"{path.relative_to(ROOT)}:{n}: {line.strip()[:120]}")
    if hits:
        print("brand guard FAILED - engine name found in user-facing sources:")
        for hit in hits:
            print("  " + hit)
        return 1
    print(f"brand guard clean - {scanned} files scanned, 0 engine-name hits")
    return 0


if __name__ == "__main__":
    sys.exit(main())
