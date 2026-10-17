"""Crop one region of a gazette PDF page to PNG for visual (page-image) verification.

Usage (from the repo root):
  uv run --directory core --with pymupdf python ../tools/rules/gazette/crop_page.py <pdfPage> <x0> <y0> <x1> <y1> <zoom>

Coordinates are fractions 0..1 of page width/height. Output:
data/downloads/sources/crops/f<page>_crop.png  (gitignored).

See README.md in this folder - part of the RAJUK 2008 extraction recipe.
"""

import pathlib
import sys

import fitz

ROOT = pathlib.Path(__file__).resolve().parents[3]
PDF = ROOT / "data" / "downloads" / "sources" / "rajuk-bidhimala-2008-gazette.pdf"
OUT = ROOT / "data" / "downloads" / "sources" / "crops"

page_no = int(sys.argv[1])
x0, y0, x1, y1 = (float(a) for a in sys.argv[2:6])
zoom = float(sys.argv[6])

doc = fitz.open(PDF)
page = doc[page_no - 1]
r = page.rect
clip = fitz.Rect(
    r.x0 + x0 * r.width,
    r.y0 + y0 * r.height,
    r.x0 + x1 * r.width,
    r.y0 + y1 * r.height,
)
pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)
OUT.mkdir(parents=True, exist_ok=True)
out = OUT / f"f{page_no:03d}_crop.png"
pix.save(out)
print("saved", out, pix.width, "x", pix.height)
