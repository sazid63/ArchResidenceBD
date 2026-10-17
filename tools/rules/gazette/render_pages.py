"""Render a range of gazette PDF pages to PNG for visual transcription.

Usage (from the repo root):
  uv run --directory core --with pymupdf python ../tools/rules/gazette/render_pages.py <startPdfPage> <endPdfPage> [zoom]

Output: data/downloads/sources/pages/p<NNN>.png  (gitignored).

See README.md in this folder - part of the RAJUK 2008 extraction recipe.
"""

import pathlib
import sys

import fitz

ROOT = pathlib.Path(__file__).resolve().parents[3]
PDF = ROOT / "data" / "downloads" / "sources" / "rajuk-bidhimala-2008-gazette.pdf"
OUT = ROOT / "data" / "downloads" / "sources" / "pages"

start = int(sys.argv[1]) if len(sys.argv) > 1 else 34
end = int(sys.argv[2]) if len(sys.argv) > 2 else 45
zoom = float(sys.argv[3]) if len(sys.argv) > 3 else 2.5

doc = fitz.open(PDF)
OUT.mkdir(parents=True, exist_ok=True)
for pno in range(start - 1, min(end, doc.page_count)):
    page = doc[pno]
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    out = OUT / f"p{pno + 1:03d}.png"
    pix.save(out)
    print(out.name, pix.width, pix.height, out.stat().st_size)
