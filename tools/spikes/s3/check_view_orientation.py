"""S3 orientation check - which transform puts TechDraw SVG fragments upright?

TechDraw.viewPartAsSvg() returns each view's edges as an SVG <g> fragment, but its
coordinate convention (y up or y down) is undocumented. This script renders an
asymmetric test model in all four variants (front/top x flip/noflip) so the correct
convention is read off the picture. Re-run after a FreeCAD/Qt upgrade before trusting
the composer in techdraw_headless.py.

Expected reading of data/downloads/s3/orientation_check.png:
  - front-NOFLIP : columns rise from the pads; tall column on the left   <- used by the composer
  - front-FLIP   : columns hang below the pads (wrong)
  - top-NOFLIP   : right pad's column sits toward the bottom edge (the -Y side)
  - top-FLIP     : right pad's column at the opposite edge

Run from the repo root:
    $env:QT_QPA_PLATFORM='offscreen'
    & "C:\\1_SAJID\\CE tools\\FreeCAD\\bin\\freecadcmd.exe" tools\\spikes\\s3\\check_view_orientation.py
"""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import FreeCAD as App  # noqa: E402
import Part  # noqa: E402
import TechDraw  # noqa: E402
from PySide6 import QtCore, QtGui, QtSvg  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "downloads" / "s3"
OUT.mkdir(parents=True, exist_ok=True)
FONT = Path(App.getResourceDir()) / "Mod" / "TechDraw" / "Resources" / "fonts" / "osifont-lgpl3fe.ttf"

doc = App.newDocument("orientation_check")
pad_l = Part.makeBox(1200, 1200, 300, App.Vector(-1700, -600, 0))    # deep pad, left
pad_r = Part.makeBox(800, 800, 300, App.Vector(900, -400, 0))        # shallow pad, right
col_l = Part.makeBox(300, 300, 2700, App.Vector(-1250, -150, 300))   # tall column
col_r = Part.makeBox(300, 300, 1200, App.Vector(1150, -400, 300))    # short, offset to -Y

structure = doc.addObject("Part::Feature", "Structure")
structure.Shape = pad_l.fuse(pad_r).fuse(col_l).fuse(col_r).removeSplitter()

page = doc.addObject("TechDraw::DrawPage", "Page")
tmpl = doc.addObject("TechDraw::DrawSVGTemplate", "Template")
tmpl.Template = str(
    Path(App.getResourceDir()) / "Mod" / "TechDraw" / "Templates" / "ISO" / "A4_Landscape_ISO5457_advanced.svg"
)
page.Template = tmpl


def add_view(name: str, direction: tuple):
    v = doc.addObject("TechDraw::DrawViewPart", name)
    v.Source = [structure]
    v.Direction = App.Vector(*direction)
    v.ScaleType = "Custom"
    v.Scale = 1.0 / 20.0
    page.addView(v)
    return v


front = add_view("Front", (0, -1, 0))
top = add_view("Top", (0, 0, 1))
doc.recompute()
frag = {"front": TechDraw.viewPartAsSvg(front), "top": TechDraw.viewPartAsSvg(top)}

W, H = 420.0, 300.0
cells = [
    ("front", True, 105.0, 85.0, 170.0),
    ("front", False, 315.0, 85.0, 170.0),
    ("top", True, 105.0, 215.0, 275.0),
    ("top", False, 315.0, 215.0, 275.0),
]
groups, texts = [], []
for name, flip, cx, cy, label_y in cells:
    transform = f"translate({cx},{cy})" + (" scale(1,-1)" if flip else "")
    groups.append(f"<g transform='{transform}'>{frag[name]}</g>")
    texts.append(
        f"<text x='{cx}' y='{label_y}' font-size='9' font-family='osifont, sans-serif' "
        f"text-anchor='middle'>{name} {'FLIP' if flip else 'NOFLIP'}</text>"
    )

svg = (
    f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' width='{W}mm' height='{H}mm'>"
    f"<rect x='0' y='0' width='{W}' height='{H}' fill='white'/>"
    f"<g fill='none' stroke='#000000' stroke-width='0.5'>{''.join(groups)}</g>"
    f"{''.join(texts)}</svg>"
)

qapp = QtGui.QGuiApplication.instance() or QtGui.QGuiApplication([])
if FONT.is_file():
    QtGui.QFontDatabase.addApplicationFont(str(FONT))

renderer = QtSvg.QSvgRenderer(QtCore.QByteArray(svg.encode("utf-8")))
assert renderer.isValid(), "orientation SVG failed to parse"
image = QtGui.QImage(1680, 1200, QtGui.QImage.Format.Format_ARGB32)
image.fill(QtCore.Qt.GlobalColor.white)
p = QtGui.QPainter()
assert p.begin(image), "QPainter could not start"
renderer.render(p)
p.end()
out = OUT / "orientation_check.png"
image.save(str(out))
print(f"ORIENTATION_CHECK_OK {out} ({out.stat().st_size} bytes)")
