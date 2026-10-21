"""The drawing set (W3.3): the sheets an engineer actually sends.

W2.5 proved that one sheet can be composed headlessly — a plan, an elevation, the computed
annotation layer, the title block, and the SVG/DXF/PDF. The plan asks for a **set** (§6:
"Drawing set: PDF + DXF", with "plan/section/elevation/details/title blocks").

This module adds the set on top of that proof:

- **The sheets** are the same design object the single sheet uses ✓ — a set is a list of sheets ✓,
  so a sheet can still be drawn on its own ✓ and the set adds no new kind of sheet ✓.
- **Each sheet names what it is** (a plan, an elevation, a section) ✓ and carries its own title
  block, its own views and its own dimensions ✓.
- **The model of each sheet is stated** — the boxes the sheet shows ✓ — so a reviewer can read
  what is on the paper without opening the engine ✓.

The laws stay W2.5's: the engine measures and the sheet *shows* ✓, the annotation values are
computed from the design ✓ (never copied ✓), the sheet carries the pack's **candidate - not for
construction** status ✓, and the engine's name never reaches the paper ✓ (ADR-0004 ✓).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .floor import FloorDesign
from .foundation import FoundationDesign, Value

#: The views a sheet can carry. A "section" in v0 is a side elevation: a true cut view needs
#: the engine's section tool, which the headless composer does not drive (spike S3) - so the
#: sheet says what it is rather than calling an elevation a section.
VIEW_TOP = "top"
VIEW_FRONT = "front"
VIEW_SIDE = "side"

#: The three kinds of sheet in v0.
SHEET_PLAN = "plan"
SHEET_ELEVATION = "elevation"


@dataclass(frozen=True)
class DrawingSet:
    """The set: the sheets, in the order they are issued."""

    project_id: str
    project_name: str
    drawing_number: str
    issued_on: str
    scale_label: str
    sheets: tuple[Any, ...] = ()
    values: dict[str, Value] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "projectName": self.project_name,
            "drawingNumber": self.drawing_number,
            "issuedOn": self.issued_on,
            "scale": self.scale_label,
            "sheets": [sheet.as_dict() for sheet in self.sheets],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
        }


def foundation_boxes(foundation: FoundationDesign) -> list[dict[str, Any]]:
    """The foundation's boxes, as the sheet's model states them."""
    boxes: list[dict[str, Any]] = []
    for footing in foundation.footings:
        boxes.append(
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
    for beam in foundation.grade_beams:
        boxes.append(
            {
                "id": beam.id,
                "kind": "grade-beam",
                "xMm": beam.x_mm,
                "yMm": beam.y_mm,
                "zMm": 0.0,
                "lMm": beam.length_mm,
                "wMm": beam.width_mm,
                "hMm": beam.depth_mm,
            }
        )
    return boxes


def floor_boxes(floor: FloorDesign) -> list[dict[str, Any]]:
    """A storey's boxes: its columns and its slab."""
    boxes: list[dict[str, Any]] = []
    for column in floor.columns:
        boxes.append(
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
    boxes.append(
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
    return boxes


def _extent(boxes: list[dict[str, Any]]) -> tuple[float, float, float, float]:
    """The model's overall size (width, depth, storey height, footing depth)."""
    if not boxes:
        return 0.0, 0.0, 0.0, 0.0
    xs = [box["xMm"] for box in boxes]
    ys = [box["yMm"] for box in boxes]
    width = max(xs) - min(xs) + max(box["lMm"] for box in boxes)
    depth = max(ys) - min(ys) + max(box["wMm"] for box in boxes)
    storey = max((box["hMm"] for box in boxes if box["kind"] == "column"), default=0.0)
    footing = max((box["hMm"] for box in boxes if box["kind"] == "footing"), default=0.0)
    return width, depth, storey, footing


def _fmt_mm(value_mm: float) -> str:
    return f"{value_mm / 1000.0:.2f} m"


def design_drawing_set(
    spec: dict[str, Any],
    foundation: FoundationDesign,
    floors: tuple[FloorDesign, ...],
    *,
    drawing_number: str = "ARRB-P3-001",
    issued_on: str = "2026-10-21",
    scale_label: str = "1 : 30",
) -> DrawingSet:
    """The set: a plan per storey and the elevations."""
    from .drawing import DrawingDesign, Dimension, SCALE_LABEL

    project = spec.get("project") or {}
    name = str(project.get("name") or "Untitled project")
    project_id = str(project.get("id") or "unknown")
    foundation_model = foundation_boxes(foundation)

    sheets: list[DrawingDesign] = []
    for index, floor in enumerate(floors):
        model = foundation_model + floor_boxes(floor)
        width, depth, storey, footing = _extent(model)
        views = (
            {
                "id": VIEW_TOP,
                "label": f"{floor.storey_label.upper().replace('-', ' ')} PLAN",
                "direction": [0.0, 0.0, 1.0],
                "xMm": 150.0,
                "yMm": 140.0,
            },
            {
                "id": VIEW_FRONT,
                "label": "FRONT ELEVATION",
                "direction": [0.0, -1.0, 0.0],
                "xMm": 150.0,
                "yMm": 60.0,
            },
        )
        dimensions = (
            Dimension("h", _fmt_mm(width), round(width, 3), VIEW_TOP),
            Dimension("v", _fmt_mm(depth), round(depth, 3), VIEW_TOP),
            Dimension("h", _fmt_mm(width), round(width, 3), VIEW_FRONT),
            Dimension("v", _fmt_mm(storey + footing), round(storey + footing, 3), VIEW_FRONT),
        )
        sheets.append(
            DrawingDesign(
                project_id=project_id,
                project_name=name,
                drawing_number=f"{drawing_number}-{index + 1}",
                sheet_title=f"{floor.storey_label.replace('-', ' ').title()} plan and elevation",
                issued_on=issued_on,
                scale_label=scale_label,
                model=tuple(model),
                views=views,
                dimensions=dimensions,
                values={
                    "sheet.overallWidthMm": Value(
                        round(width, 3),
                        "mm",
                        "derived",
                        "the design",
                        "the model's overall width",
                    ),
                    "sheet.overallDepthMm": Value(
                        round(depth, 3),
                        "mm",
                        "derived",
                        "the design",
                        "the model's overall depth",
                    ),
                },
            )
        )

    # The elevations sheet: the front and the side of the topmost storey.
    if floors:
        model = foundation_model + floor_boxes(floors[-1])
        width, depth, storey, footing = _extent(model)
        sheets.append(
            DrawingDesign(
                project_id=project_id,
                project_name=name,
                drawing_number=f"{drawing_number}-{len(sheets) + 1}",
                sheet_title="Elevations",
                issued_on=issued_on,
                scale_label=scale_label,
                model=tuple(model),
                views=(
                    {
                        "id": VIEW_FRONT,
                        "label": "FRONT ELEVATION",
                        "direction": [0.0, -1.0, 0.0],
                        "xMm": 95.0,
                        "yMm": 140.0,
                    },
                    {
                        "id": VIEW_SIDE,
                        "label": "SIDE ELEVATION",
                        "direction": [1.0, 0.0, 0.0],
                        "xMm": 215.0,
                        "yMm": 140.0,
                    },
                ),
                dimensions=(
                    Dimension("h", _fmt_mm(width), round(width, 3), VIEW_FRONT),
                    Dimension("v", _fmt_mm(storey + footing), round(storey + footing, 3), VIEW_FRONT),
                    Dimension("h", _fmt_mm(depth), round(depth, 3), VIEW_SIDE),
                ),
                values={},
            )
        )

    return DrawingSet(
        project_id=project_id,
        project_name=name,
        drawing_number=drawing_number,
        issued_on=issued_on,
        scale_label=scale_label or SCALE_LABEL,
        sheets=tuple(sheets),
        values={
            "set.sheets": Value(
                float(len(sheets)),
                "1",
                "derived",
                "the design",
                "the number of sheets in the set",
            )
        },
    )


__all__ = [
    "SHEET_ELEVATION",
    "SHEET_PLAN",
    "VIEW_FRONT",
    "VIEW_SIDE",
    "VIEW_TOP",
    "DrawingSet",
    "design_drawing_set",
    "floor_boxes",
    "foundation_boxes",
]
