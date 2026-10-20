"""Drawing sheet v0 (W2.5): the design becomes a sheet a human can read.

Spike S3 proved the whole pipeline headless: TechDraw views project without a GUI, the SVG
fragments and the DXF are byte-stable, and the PDF comes from Qt rendering our own composed SVG.
It also found the trap that shapes this module: **native TechDraw dimensions are unusable
headless** (every 2D reference is corrupt), so the annotation values are computed here, from the
design, and drawn by our composer. That is the repo's law anyway - scripts first, GUI last.

The sheet is therefore a *design* like every other artefact in this package: the model, the
views, the annotation values, the title block and the scale are computed from the Building Spec
through the W2.2/W2.3 designs, each with its provenance, and the macro is a mechanical
rendering of it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .floor import FloorDesign
from .foundation import PROVENANCE_ASSUMED, PROVENANCE_DERIVED, FoundationDesign, Value

#: A4 landscape, in millimetres - the template's viewBox units.
PAGE_W_MM = 297.0
PAGE_H_MM = 210.0

#: The drawing scale. v0 states it (1:30); a scale that cannot be shown is not a scale.
SCALE = 1.0 / 30.0
SCALE_LABEL = "1 : 30"

#: The sheet carries the pack's *status*: the pack is a candidate, so the sheet is too.
SHEET_STATUS = "Candidate - not for construction"

VIEW_TOP = "top"
VIEW_FRONT = "front"


@dataclass(frozen=True)
class Dimension:
    """One measured dimension on the sheet (computed, never copied)."""

    axis: str  # "h" or "v"
    label: str
    value_mm: float
    view: str

    def as_dict(self) -> dict[str, Any]:
        return {"axis": self.axis, "label": self.label, "valueMm": self.value_mm, "view": self.view}


@dataclass(frozen=True)
class DrawingDesign:
    """The sheet: the model, the views, the annotation layer, the title block, the scale."""

    project_id: str
    project_name: str
    drawing_number: str
    sheet_title: str
    issued_on: str
    scale_label: str
    model: tuple[dict[str, Any], ...]
    views: tuple[dict[str, Any], ...]
    dimensions: tuple[Dimension, ...]
    values: dict[str, Value] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "projectName": self.project_name,
            "drawingNumber": self.drawing_number,
            "sheetTitle": self.sheet_title,
            "issuedOn": self.issued_on,
            "scale": self.scale_label,
            "model": [dict(box) for box in self.model],
            "views": [dict(view) for view in self.views],
            "dimensions": [item.as_dict() for item in self.dimensions],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
        }


def _fmt_mm(value_mm: float) -> str:
    return f"{value_mm / 1000.0:.2f} m"


def design_sheet(
    spec: dict[str, Any],
    foundation: FoundationDesign,
    floor: FloorDesign,
    *,
    drawing_number: str = "ARRB-P2-001",
    issued_on: str = "2026-10-21",
) -> DrawingDesign:
    """Design the sheet from the Building Spec through the foundation and floor designs."""
    project = spec.get("project") or {}
    name = str(project.get("name") or "Untitled project")

    # The model the sheet shows: the footings, the columns and the slab (millimetres).
    model: list[dict[str, Any]] = []
    for footing in foundation.footings:
        model.append(
            {
                "id": footing.id,
                "kind": "footing",
                "xMm": footing.x_mm - footing.size_x_mm / 2.0,
                "yMm": footing.y_mm - footing.size_y_mm / 2.0,
                "zMm": -footing.depth_mm,
                "lMm": footing.size_x_mm,
                "wMm": footing.size_y_mm,
                "hMm": footing.depth_mm,
            }
        )
    for column in floor.columns:
        model.append(
            {
                "id": column.id,
                "kind": "column",
                "xMm": column.x_mm - column.size_mm / 2.0,
                "yMm": column.y_mm - column.size_mm / 2.0,
                "zMm": floor.base_z_mm,
                "lMm": column.size_mm,
                "wMm": column.size_mm,
                "hMm": column.height_mm,
            }
        )
    model.append(
        {
            "id": "Slab_1",
            "kind": "slab",
            "xMm": floor.slab.origin_x_mm,
            "yMm": floor.slab.origin_y_mm,
            "zMm": floor.base_z_mm,
            "lMm": floor.slab.size_x_mm,
            "wMm": floor.slab.size_y_mm,
            "hMm": floor.slab.thickness_mm,
        }
    )

    xs = [box["xMm"] for box in model]
    ys = [box["yMm"] for box in model]
    overall_w = max(xs) - min(xs) + max(box["lMm"] for box in model)
    overall_d = max(ys) - min(ys) + max(box["wMm"] for box in model)
    storey_h = max((box["hMm"] for box in model if box["kind"] == "column"), default=0.0)
    footing_d = max((box["hMm"] for box in model if box["kind"] == "footing"), default=0.0)
    grid = sorted({round(box["xMm"], 1) for box in model if box["kind"] == "column"})
    spacing = round(grid[1] - grid[0], 3) if len(grid) > 1 else 0.0

    values: dict[str, Value] = {
        "sheet.scale": Value(
            30.0,
            "1",
            PROVENANCE_ASSUMED,
            "v0 default",
            "the sheet states 1:30 and the views are drawn to that scale",
        ),
        "sheet.overallWidthMm": Value(
            round(overall_w, 3),
            "mm",
            PROVENANCE_DERIVED,
            "foundation + floor designs",
            "the model's overall width",
        ),
        "sheet.overallDepthMm": Value(
            round(overall_d, 3),
            "mm",
            PROVENANCE_DERIVED,
            "foundation + floor designs",
            "the model's overall depth",
        ),
        "sheet.gridSpacingMm": Value(
            spacing, "mm", PROVENANCE_DERIVED, "floor design", "the column grid spacing"
        ),
    }

    views = (
        {
            "id": VIEW_FRONT,
            "label": "FRONT ELEVATION",
            "direction": [0.0, -1.0, 0.0],
            "xMm": 85.0,
            "yMm": 125.0,
        },
        {
            "id": VIEW_TOP,
            "label": "GROUND FLOOR PLAN",
            "direction": [0.0, 0.0, 1.0],
            "xMm": 215.0,
            "yMm": 145.0,
        },
    )

    dimensions = (
        Dimension("h", _fmt_mm(overall_w), round(overall_w, 3), VIEW_FRONT),
        Dimension("v", _fmt_mm(storey_h + footing_d), round(storey_h + footing_d, 3), VIEW_FRONT),
        Dimension("h", _fmt_mm(overall_w), round(overall_w, 3), VIEW_TOP),
        Dimension("v", _fmt_mm(overall_d), round(overall_d, 3), VIEW_TOP),
    )

    return DrawingDesign(
        project_id=str(project.get("id") or "unknown"),
        project_name=name,
        drawing_number=drawing_number,
        sheet_title="Foundation + ground floor",
        issued_on=issued_on,
        scale_label=SCALE_LABEL,
        model=tuple(model),
        views=views,
        dimensions=dimensions,
        values=values,
    )


def render_sheet_macro(design: DrawingDesign) -> str:
    """Render the sheet as a deterministic FreeCAD macro (S3's pipeline, fed by the design)."""
    payload = {
        "projectName": design.project_name,
        "projectId": design.project_id,
        "drawingNumber": design.drawing_number,
        "sheetTitle": design.sheet_title,
        "issuedOn": design.issued_on,
        "scaleLabel": design.scale_label,
        "status": SHEET_STATUS,
        "pageWMm": PAGE_W_MM,
        "pageHMm": PAGE_H_MM,
        "scale": SCALE,
        "views": [dict(view) for view in design.views],
        "dimensions": [item.as_dict() for item in design.dimensions],
        "model": [dict(box) for box in design.model],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True)
    return _SHEET_MACRO.replace("__DESIGN__", body)


_SHEET_MACRO = '''"""Sheet macro - GENERATED by archres_core.design.drawing (W2.5).

Do not edit: regenerate it from the Building Spec instead. The macro only *draws*; the
annotation values come from the design (native TechDraw dimensions are unusable headless -
spike S3), and the harness checks what came out.

Outputs (into ARCHRES_JOB_OUTDIR): page.svg, page.dxf, page.pdf, sheet-design.json.
"""

import json
import os
import pathlib
import re

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import FreeCAD as App  # noqa: E402
import Part  # noqa: E402
import TechDraw  # noqa: E402

DESIGN = json.loads(r"""
__DESIGN__
""")

PAGE_W_MM = DESIGN["pageWMm"]
PAGE_H_MM = DESIGN["pageHMm"]
SCALE = DESIGN["scale"]
TEXT_MM = 3.2

RES = pathlib.Path(App.getResourceDir())
TEMPLATE = RES / "Mod" / "TechDraw" / "Templates" / "ISO" / "A4_Landscape_ISO5457_advanced.svg"
FONT = RES / "Mod" / "TechDraw" / "Resources" / "fonts" / "osifont-lgpl3fe.ttf"

OUT = pathlib.Path(os.environ.get("ARCHRES_JOB_OUTDIR", "."))
OUT.mkdir(parents=True, exist_ok=True)


def build_model():
    doc = App.newDocument("sheet")
    shapes = []
    for box in DESIGN["model"]:
        shapes.append(
            Part.makeBox(
                box["lMm"],
                box["wMm"],
                box["hMm"],
                App.Vector(box["xMm"], box["yMm"], box["zMm"]),
            )
        )
    if not shapes:
        raise RuntimeError("the design carries no geometry to draw")
    fused = shapes[0]
    for shape in shapes[1:]:
        fused = fused.fuse(shape)
    obj = doc.addObject("Part::Feature", "Structure")
    obj.Shape = fused.removeSplitter()
    doc.recompute()
    return doc, obj


def to_svg_y(y_mm):
    return PAGE_H_MM - y_mm


def view_group(frag, x_mm, y_mm):
    return f"<g transform='translate({x_mm:.3f},{to_svg_y(y_mm):.3f})'>{frag}</g>"


def dim_lines_and_texts(dim, x_mm, y_mm, half_w, half_h):
    tick = 1.2
    if dim["axis"] == "h":
        x1, x2 = x_mm - half_w, x_mm + half_w
        y1 = y2 = y_mm
        lines = (
            f"<path d='M {x1:.2f} {y1:.2f} L {x2:.2f} {y2:.2f}' />"
            f"<path d='M {x1 + tick:.2f} {y1 - tick:.2f} L {x1 - tick:.2f} {y1 + tick:.2f}' />"
            f"<path d='M {x2 + tick:.2f} {y2 - tick:.2f} L {x2 - tick:.2f} {y2 + tick:.2f}' />"
        )
        text = (
            f"<text x='{(x1 + x2) / 2.0:.2f}' y='{to_svg_y(y1) - 0.8:.2f}' font-size='{TEXT_MM}' "
            f"font-family='osifont, sans-serif' text-anchor='middle'>{dim['label']}</text>"
        )
    else:
        y1, y2 = y_mm - half_h, y_mm + half_h
        x1 = x2 = x_mm
        lines = (
            f"<path d='M {x1:.2f} {y1:.2f} L {x2:.2f} {y2:.2f}' />"
            f"<path d='M {x1 - tick:.2f} {y1 + tick:.2f} L {x1 + tick:.2f} {y1 - tick:.2f}' />"
            f"<path d='M {x1 - tick:.2f} {y2 + tick:.2f} L {x1 + tick:.2f} {y2 - tick:.2f}' />"
        )
        text = (
            f"<text x='{x1 + 1.0:.2f}' y='{to_svg_y((y1 + y2) / 2.0) + 1.1:.2f}' font-size='{TEXT_MM}' "
            f"font-family='osifont, sans-serif' text-anchor='start'>{dim['label']}</text>"
        )
    return lines, text


def label(x_mm, y_mm, text):
    return (
        f"<text x='{x_mm:.2f}' y='{to_svg_y(y_mm):.2f}' font-size='{TEXT_MM}' "
        f"font-family='osifont, sans-serif' text-anchor='middle'>{text}</text>"
    )


def main():
    doc, structure = build_model()

    page = doc.addObject("TechDraw::DrawPage", "Page")
    template = doc.addObject("TechDraw::DrawSVGTemplate", "Template")
    template.Template = str(TEMPLATE)
    page.Template = template

    views = {}
    for view in DESIGN["views"]:
        part = doc.addObject("TechDraw::DrawViewPart", "View_" + view["id"])
        part.Source = [structure]
        part.Direction = App.Vector(*view["direction"])
        part.ScaleType = "Custom"
        part.Scale = SCALE
        page.addView(part)
        part.X = view["xMm"]
        part.Y = view["yMm"]
        views[view["id"]] = part
    doc.recompute()

    fragments = {key: TechDraw.viewPartAsSvg(view) for key, view in views.items()}

    sheet = TEMPLATE.read_text(encoding="utf-8")
    fields = {
        "<tspan>ISO 7200 titleblock</tspan>": "<tspan>ArchResidenceBD</tspan>",
        "<tspan>ST1</tspan>": "<tspan>" + DESIGN["sheetTitle"] + "</tspan>",
        "<tspan>ST2</tspan>": "<tspan>" + DESIGN["status"] + "</tspan>",
        "<tspan>DN</tspan>": "<tspan>" + DESIGN["drawingNumber"] + "</tspan>",
        "<tspan>AAA</tspan>": "<tspan>v0</tspan>",
        "<tspan>YYYY-MM-DD</tspan>": "<tspan>" + DESIGN["issuedOn"] + "</tspan>",
        "<tspan>X / Y</tspan>": "<tspan>1 / 1</tspan>",
        "<tspan>1 : 1</tspan>": "<tspan>" + DESIGN["scaleLabel"] + "</tspan>",
        "<tspan>A. Nemesis</tspan>": "<tspan>NativeCAD (ArchResidenceBD)</tspan>",
        "<tspan>Component Drawing</tspan>": "<tspan>Design drawing</tspan>",
        "<tspan>In preparation</tspan>": "<tspan>" + DESIGN["status"] + "</tspan>",
        "<tspan>Stainless steel Mat.No. 1.4301</tspan>": "<tspan>RC footing + RC columns + slab</tspan>",
    }
    for old, new in fields.items():
        if sheet.count(old) != 1:
            raise RuntimeError("template field not found exactly once: " + old)
        sheet = sheet.replace(old, new)

    # the brand guard (ADR-0004): the template's engine plumbing is invisible but must not ship
    sheet = re.sub(r'\\s+xmlns:freecad="[^"]*"', "", sheet)
    sheet = re.sub(r'\\sfreecad:[A-Za-z_]+="[^"]*"', "", sheet)

    bounds = {}
    for view in DESIGN["views"]:
        frag = fragments[view["id"]]
        xs, ys = [], []
        for path in re.findall(r'd="([^"]+)"', frag):
            for match in re.finditer(r"(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)", path):
                xs.append(float(match.group(1)))
                ys.append(float(match.group(2)))
        if not xs:
            raise RuntimeError("the view fragment is empty: " + view["id"])
        bounds[view["id"]] = (
            min(xs),
            min(ys),
            max(xs) - min(xs),
            max(ys) - min(ys),
        )

    dim_texts = ""
    for dim in DESIGN["dimensions"]:
        view = next(item for item in DESIGN["views"] if item["id"] == dim["view"])
        min_x, min_y, width, height = bounds[dim["view"]]
        lines, text = dim_lines_and_texts(dim, view["xMm"], view["yMm"], width / 2.0, height / 2.0)
        dim_texts += lines + text
    for view in DESIGN["views"]:
        min_x, min_y, width, height = bounds[view["id"]]
        dim_texts += label(view["xMm"], view["yMm"] + height / 2.0 + 6.0, view["label"] + "  -  " + DESIGN["scaleLabel"])

    annotation = (
        "<g transform='matrix(1,0,0,-1,0," + str(PAGE_H_MM) + ")' fill='none' stroke='#000000' "
        "stroke-width='0.25'>" + dim_texts + "</g>"
    )

    groups = "".join(
        view_group(fragments[view["id"]], view["xMm"], view["yMm"]) for view in DESIGN["views"]
    )
    composed = sheet.replace("</svg>", groups + annotation + "</svg>")
    if "freecad" in composed.lower():
        raise RuntimeError("the engine name leaked into the composed sheet")
    (OUT / "page.svg").write_text(composed, encoding="utf-8", newline="\\n")

    TechDraw.writeDXFPage(page, str(OUT / "page.dxf"))

    from PySide6 import QtCore, QtGui, QtSvg

    app = QtGui.QGuiApplication.instance() or QtGui.QGuiApplication([])
    if FONT.is_file():
        QtGui.QFontDatabase.addApplicationFont(str(FONT))
    renderer = QtSvg.QSvgRenderer(QtCore.QByteArray(composed.encode("utf-8")))
    if not renderer.isValid():
        raise RuntimeError("the composed sheet does not parse as SVG")
    writer = QtGui.QPdfWriter(str(OUT / "page.pdf"))
    writer.setResolution(300)
    layout = QtGui.QPageLayout()
    layout.setPageSize(QtGui.QPageSize(QtGui.QPageSize.A4))
    layout.setOrientation(QtGui.QPageLayout.Orientation.Landscape)
    writer.setPageLayout(layout)
    for setter, value in (
        ("setTitle", "ArchResidenceBD - " + DESIGN["drawingNumber"]),
        ("setCreator", "NativeCAD (ArchResidenceBD)"),
        ("setProducer", "NativeCAD (ArchResidenceBD)"),
    ):
        method = getattr(writer, setter, None)
        if method is not None:
            method(value)
    painter = QtGui.QPainter()
    if not painter.begin(writer):
        raise RuntimeError("the PDF writer refused a painter")
    renderer.render(painter)
    painter.end()

    (OUT / "sheet-design.json").write_text(
        json.dumps(DESIGN, ensure_ascii=False, indent=1, sort_keys=True) + "\\n",
        encoding="utf-8",
    )


main()
'''
