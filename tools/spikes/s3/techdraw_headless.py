"""S3 spike - TechDraw headless automation (freecadcmd, no GUI babysitting).

Pipeline proven here (all console-safe):
    model (Part, mm) -> TechDraw page + DrawViewPart views
    -> SVG fragments (TechDraw.viewPartAsSvg) + our own annotation layer
    -> composed A4 sheet SVG (template viewBox units = mm, y down)
    -> Qt (bundled with FreeCAD) -> vector PDF
    -> DXF (TechDraw.writeDXFPage)

WHY NOT native TechDraw dimensions: in console mode every DrawViewDimension fails with
"DVD::getDimValue - <name> - 2D references are corrupt (5)" - dimension resolution needs
the GUI edge map. So annotation values are computed from the model geometry and drawn by
this composer (that is the W2.5 plan anyway: scripts first, GUI last).

Sheet: ISO/A4_Landscape_ISO5457_advanced.svg (border + title block, viewBox "0 0 297 210"
= millimetres). The composer works directly in those units; title block fields are filled
from this script.

Outputs (gitignored): data/downloads/s3/ - page.svg, page.pdf, page.dxf,
preview_page.png (via QSvgRenderer), run.json. Exits non-zero if the page renders blank.

Run from the repo root:
    $env:QT_QPA_PLATFORM='offscreen'
    & "C:\\1_SAJID\\CE tools\\FreeCAD\\bin\\freecadcmd.exe" tools\\spikes\\s3\\techdraw_headless.py
"""

from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import FreeCAD as App  # noqa: E402
import Part  # noqa: E402
import TechDraw  # noqa: E402

T0 = time.perf_counter()
TIMES: dict[str, float] = {}


def mark(label: str, t_prev: float) -> float:
    t = time.perf_counter()
    TIMES[label] = round((t - t_prev) * 1000.0, 1)
    print(f"  {label:<18} {TIMES[label]:>8.1f} ms")
    return t


ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "data" / "downloads" / "s3"
OUT.mkdir(parents=True, exist_ok=True)

RES = Path(App.getResourceDir())
TEMPLATE = RES / "Mod" / "TechDraw" / "Templates" / "ISO" / "A4_Landscape_ISO5457_advanced.svg"
FONT = RES / "Mod" / "TechDraw" / "Resources" / "fonts" / "osifont-lgpl3fe.ttf"

PAGE_W_MM, PAGE_H_MM = 297.0, 210.0   # A4 landscape
SCALE = 1.0 / 30.0                    # 1:30
TEXT_MM = 3.2                         # annotation text height in mm
RASTER_DPI = 180                      # preview resolution


def mm(q) -> float:
    """View X/Y are PropertyDistance quantities - force plain mm floats."""
    return float(q.getValueAs("mm")) if hasattr(q, "getValueAs") else float(q)


print(f"FreeCAD {App.Version()[0]}.{App.Version()[1]}.{App.Version()[2]} - S3 headless TechDraw spike")
t = T0

# ---------------------------------------------------------------- model (mm, z up from 0)

def box(l: float, w: float, h: float, x: float, y: float, z: float):
    return Part.makeBox(l, w, h, App.Vector(x, y, z))


pad_a = box(1200, 1200, 300, -1700, -600, 0)     # footing pad, left
pad_b = box(1200, 1200, 300, 500, -600, 0)       # footing pad, right
col_a = box(300, 300, 2700, -1250, -150, 300)    # column on pad, left
col_b = box(300, 300, 2700, 950, -150, 300)      # column on pad, right
beam = box(2500, 300, 300, -1250, -150, 300)     # tie beam between the columns

doc = App.newDocument("S3_spike")
structure = doc.addObject("Part::Feature", "Structure")
structure.Shape = pad_a.fuse(pad_b).fuse(col_a).fuse(col_b).fuse(beam).removeSplitter()
doc.recompute()
t = mark("model", t)

OVERALL_W_MM = 3400.0   # pad outer faces: -1700..1700
OVERALL_D_MM = 1200.0   # pad outer faces: -600..600
OVERALL_H_MM = 3000.0   # pad bottom 0 -> column top 3000

# ---------------------------------------------------------------- page + views

sheet_text = TEMPLATE.read_text(encoding="utf-8")
vb_match = re.search(r'viewBox="([^"]+)"', sheet_text)
vb = [float(v) for v in vb_match.group(1).replace(",", " ").split()] if vb_match else []
assert vb == [0.0, 0.0, PAGE_W_MM, PAGE_H_MM], f"unexpected template viewBox: {vb}"

page = doc.addObject("TechDraw::DrawPage", "Page")
tmpl = doc.addObject("TechDraw::DrawSVGTemplate", "Template")
tmpl.Template = str(TEMPLATE)
page.Template = tmpl

FRONT_XY = (85.0, 125.0)    # page mm, y-up origin at bottom-left
TOP_XY = (215.0, 145.0)


def add_view(name: str, direction: tuple, x_mm: float, y_mm: float):
    v = doc.addObject("TechDraw::DrawViewPart", name)
    v.Source = [structure]
    v.Direction = App.Vector(*direction)
    v.ScaleType = "Custom"
    v.Scale = SCALE
    page.addView(v)
    v.X = x_mm
    v.Y = y_mm
    return v


top = add_view("Top", (0, 0, 1), *TOP_XY)
front = add_view("Front", (0, -1, 0), *FRONT_XY)
doc.recompute()
t = mark("page+views", t)

frag_top = TechDraw.viewPartAsSvg(top)
frag_front = TechDraw.viewPartAsSvg(front)


def svg_bbox(frag: str):
    xs, ys = [], []
    for d in re.findall(r'd="([^"]+)"', frag):
        for m in re.finditer(r"(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)", d):
            xs.append(float(m.group(1)))
            ys.append(float(m.group(2)))
    return (round(min(xs), 2), round(min(ys), 2), round(max(xs), 2), round(max(ys), 2)) if xs else None


print(f"  fragments           top={len(frag_top)} front={len(frag_front)} chars")
print(f"  fragment bbox       top={svg_bbox(frag_top)} front={svg_bbox(frag_front)}")
t = mark("fragments", t)

# ---------------------------------------------------------------- DXF (TechDraw native)

dxf_path = OUT / "page.dxf"
TechDraw.writeDXFPage(page, str(dxf_path))
t = mark("dxf", t)
dxf_text = dxf_path.read_text(encoding="utf-8", errors="replace")
dxf_lines = len(dxf_text.splitlines())

# ---------------------------------------------------------------- composer (SVG, mm units)

FIELDS = {
    "<tspan>ISO 7200 titleblock</tspan>": "<tspan>ArchResidenceBD - S3 TechDraw spike</tspan>",
    "<tspan>ST1</tspan>": "<tspan>Foundation: pads + columns + tie beam</tspan>",
    "<tspan>ST2</tspan>": "<tspan>Spike evidence - not for construction</tspan>",
    "<tspan>DN</tspan>": "<tspan>ARRB-S3-001</tspan>",
    "<tspan>AAA</tspan>": "<tspan>v0</tspan>",
    "<tspan>YYYY-MM-DD</tspan>": "<tspan>2026-10-17</tspan>",
    "<tspan>X / Y</tspan>": "<tspan>1 / 1</tspan>",
    "<tspan>1 : 1</tspan>": "<tspan>1 : 30</tspan>",
    "<tspan>A. Nemesis</tspan>": "<tspan>FreeCAD headless toolchain</tspan>",
    "<tspan>Component Drawing</tspan>": "<tspan>Spike drawing</tspan>",
    "<tspan>In preparation</tspan>": "<tspan>Spike evidence</tspan>",
    "<tspan>Stainless steel Mat.No. 1.4301</tspan>": "<tspan>RC pad + RC columns (spike)</tspan>",
}
sheet = sheet_text
for old, new in FIELDS.items():
    assert sheet.count(old) == 1, f"template field not found exactly once: {old}"
    sheet = sheet.replace(old, new)


def to_svg_y(y_mm: float) -> float:
    """page mm (y up) -> template viewBox mm (y down)."""
    return PAGE_H_MM - y_mm


def view_group(frag: str, x_mm: float, y_mm: float) -> str:
    # fragments are already screen-space (y down) and centred on the view - translate only.
    # (verified by tools/spikes/s3/check_view_orientation.py; a scale(1,-1) here renders
    # the drawing upside down)
    return f"<g transform='translate({x_mm:.3f},{to_svg_y(y_mm):.3f})'>{frag}</g>"


def dim_h(x1_mm: float, x2_mm: float, y_mm: float, label_text: str):
    tick = 1.2
    lines = (
        f"<path d='M {x1_mm:.2f} {y_mm:.2f} L {x2_mm:.2f} {y_mm:.2f}' />"
        f"<path d='M {x1_mm + tick:.2f} {y_mm - tick:.2f} L {x1_mm - tick:.2f} {y_mm + tick:.2f}' />"
        f"<path d='M {x2_mm + tick:.2f} {y_mm - tick:.2f} L {x2_mm - tick:.2f} {y_mm + tick:.2f}' />"
    )
    text = (
        f"<text x='{(x1_mm + x2_mm) / 2.0:.2f}' y='{to_svg_y(y_mm) - 0.8:.2f}' "
        f"font-size='{TEXT_MM}' font-family='osifont, sans-serif' text-anchor='middle'>{label_text}</text>"
    )
    return lines, text


def dim_v(y1_mm: float, y2_mm: float, x_mm: float, label_text: str):
    tick = 1.2
    lines = (
        f"<path d='M {x_mm:.2f} {y1_mm:.2f} L {x_mm:.2f} {y2_mm:.2f}' />"
        f"<path d='M {x_mm - tick:.2f} {y1_mm + tick:.2f} L {x_mm + tick:.2f} {y1_mm - tick:.2f}' />"
        f"<path d='M {x_mm - tick:.2f} {y2_mm + tick:.2f} L {x_mm + tick:.2f} {y2_mm - tick:.2f}' />"
    )
    text = (
        f"<text x='{x_mm + 1.0:.2f}' y='{to_svg_y((y1_mm + y2_mm) / 2.0) + 1.1:.2f}' "
        f"font-size='{TEXT_MM}' font-family='osifont, sans-serif' text-anchor='start'>{label_text}</text>"
    )
    return lines, text


def label(x_mm: float, y_mm: float, text: str) -> str:
    return (
        f"<text x='{x_mm:.2f}' y='{to_svg_y(y_mm):.2f}' font-size='{TEXT_MM}' "
        f"font-family='osifont, sans-serif' text-anchor='middle'>{text}</text>"
    )


half_w = OVERALL_W_MM * SCALE / 2.0   # 56.67
half_h = OVERALL_H_MM * SCALE / 2.0   # 50.0
half_d = OVERALL_D_MM * SCALE / 2.0   # 20.0
fx, fy = mm(front.X), mm(front.Y)
tx, ty = mm(top.X), mm(top.Y)

parts = [
    dim_h(fx - half_w, fx + half_w, fy - half_h - 6.0, "3.40 m"),
    dim_v(fy - half_h, fy + half_h, fx + half_w + 5.0, "3.00 m"),
    dim_h(tx - half_w, tx + half_w, ty - half_d - 6.0, "3.40 m"),
    dim_v(ty - half_d, ty + half_d, tx + half_w + 5.0, "1.20 m"),
]
dim_lines = "".join(l for l, _ in parts)
dim_texts = "".join(s for _, s in parts)
dim_texts += label(fx, fy + half_h + 6.0, "FRONT  -  1:30")
dim_texts += label(tx, ty + half_d + 6.0, "TOP  -  1:30")

ann = (
    f"<g transform='matrix(1,0,0,-1,0,{PAGE_H_MM})' fill='none' stroke='#000000' stroke-width='0.25'>"
    f"{dim_lines}</g>{dim_texts}"
)

composed = sheet.replace(
    "</svg>",
    view_group(frag_top, tx, ty) + view_group(frag_front, fx, fy) + ann + "</svg>",
)
svg_path = OUT / "page.svg"
svg_path.write_text(composed, encoding="utf-8", newline="\n")
t = mark("compose", t)

# ---------------------------------------------------------------- Qt: preview + PDF

from PySide6 import QtCore, QtGui, QtSvg  # noqa: E402

qapp = QtGui.QGuiApplication.instance() or QtGui.QGuiApplication([])
if FONT.is_file():
    fid = QtGui.QFontDatabase.addApplicationFont(str(FONT))
    families = QtGui.QFontDatabase.applicationFontFamilies(fid) if fid != -1 else []
    print(f"  font                osifont: {families or 'registration failed'}")
else:
    print("  font                osifont not found - falling back to sans-serif")

renderer = QtSvg.QSvgRenderer(QtCore.QByteArray(composed.encode("utf-8")))
print(f"  svg valid           {renderer.isValid()} {renderer.defaultSize()}")
assert renderer.isValid(), "composed SVG failed to parse"

preview_size = QtCore.QSize(
    round(PAGE_W_MM * RASTER_DPI / 25.4), round(PAGE_H_MM * RASTER_DPI / 25.4)
)
image = QtGui.QImage(preview_size, QtGui.QImage.Format.Format_ARGB32)
image.fill(QtCore.Qt.GlobalColor.white)
p = QtGui.QPainter()
assert p.begin(image), "QPainter could not start on the preview image"
renderer.render(p)
p.end()
image.save(str(OUT / "preview_page.png"))
ink = sum(
    1
    for y in range(0, preview_size.height(), 8)
    for x in range(0, preview_size.width(), 8)
    if image.pixelColor(x, y).value() < 224
)
t = mark("preview png", t)
assert ink > 100, f"page rendered blank (ink={ink})"

writer = QtGui.QPdfWriter(str(OUT / "page.pdf"))
writer.setResolution(300)
layout = QtGui.QPageLayout()
layout.setPageSize(QtGui.QPageSize(QtGui.QPageSize.A4))
layout.setOrientation(QtGui.QPageLayout.Orientation.Landscape)
writer.setPageLayout(layout)
p = QtGui.QPainter()
assert p.begin(writer), "QPainter could not start on the PDF writer"
renderer.render(p, QtCore.QRectF(0, 0, writer.width(), writer.height()))
p.end()
t = mark("pdf", t)
pdf_bytes = (OUT / "page.pdf").read_bytes()
print(f"  pdf                 {len(pdf_bytes)} bytes")
assert pdf_bytes[:5] == b"%PDF-" and b"%%EOF" in pdf_bytes[-2048:], "PDF output failed sanity check"

# ---------------------------------------------------------------- summary

TIMES["total"] = round((time.perf_counter() - T0) * 1000.0, 1)
run = {
    "freecad": ".".join(App.Version()[:3]),
    "template": TEMPLATE.name,
    "scale": "1:30",
    "raster_dpi": RASTER_DPI,
    "mm": {"w": OVERALL_W_MM, "d": OVERALL_D_MM, "h": OVERALL_H_MM},
    "fields_filled": len(FIELDS),
    "fragments_chars": {"top": len(frag_top), "front": len(frag_front)},
    "ink_samples": ink,
    "dxf_bytes": dxf_path.stat().st_size,
    "dxf_lines": dxf_lines,
    "svg_bytes": svg_path.stat().st_size,
    "pdf_bytes": len(pdf_bytes),
    "times_ms": TIMES,
}
(OUT / "run.json").write_text(json.dumps(run, indent=2, sort_keys=True), encoding="utf-8")
print(f"  ink samples         {ink}")
print(f"  TOTAL in-process    {TIMES['total']} ms")
print("S3_SPIKE_OK")
