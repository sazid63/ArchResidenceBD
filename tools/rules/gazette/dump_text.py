"""Dump the gazette PDF text layer to a .txt file (page-marked).

Usage (from the repo root):
  uv run --directory core --with pymupdf python ../tools/rules/gazette/dump_text.py

Output: data/downloads/sources/rajuk-2008-text.txt  (gitignored).
Remember: digits and Latin are reliable; Bangla letters are legacy-font mangled -
see README.md before trusting any letter from this dump.
"""

import pathlib

import fitz

ROOT = pathlib.Path(__file__).resolve().parents[3]
PDF = ROOT / "data" / "downloads" / "sources" / "rajuk-bidhimala-2008-gazette.pdf"
OUT = ROOT / "data" / "downloads" / "sources" / "rajuk-2008-text.txt"

doc = fitz.open(PDF)
with OUT.open("w", encoding="utf-8", newline="\n") as fh:
    for i, page in enumerate(doc, start=1):
        fh.write(f"\n===== PDF page {i} (gazette {i + 2997}) =====\n")
        fh.write(page.get_text())
print("wrote", OUT, OUT.stat().st_size, "bytes,", doc.page_count, "pages")
