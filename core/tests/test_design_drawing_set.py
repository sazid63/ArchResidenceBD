"""The drawing set (W3.3): the sheets an engineer actually sends."""

from __future__ import annotations

import json
import pathlib

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.drawing_set import design_drawing_set, floor_boxes, foundation_boxes

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
SET_DIR = ROOT / "data" / "cad" / "generated" / "drawing-set"


def _set():
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floors = (
        design_typical_floor(spec, foundation, storey_index=0),
        design_typical_floor(spec, foundation, storey_index=1),
    )
    return design_drawing_set(spec, foundation, floors)


def test_the_set_has_a_plan_per_storey_and_the_elevations() -> None:
    design = _set()
    assert len(design.sheets) == 3
    assert [sheet.sheet_title for sheet in design.sheets] == [
        "Floor 0 plan and elevation",
        "Floor 1 plan and elevation",
        "Elevations",
    ]
    assert [len(sheet.views) for sheet in design.sheets] == [2, 2, 2]
    assert [view["id"] for view in design.sheets[2].views] == ["front", "side"]


def test_every_sheet_states_its_model_and_its_dimensions() -> None:
    design = _set()
    for sheet in design.sheets:
        assert sheet.model, "a sheet says what it shows"
        assert sheet.dimensions, "a sheet carries its measured dimensions"
        for dimension in sheet.dimensions:
            assert dimension.view in {view["id"] for view in sheet.views}


def test_the_dimension_values_come_from_the_model() -> None:
    design = _set()
    sheet = design.sheets[0]
    boxes = sheet.model
    width = max(box["xMm"] for box in boxes) - min(box["xMm"] for box in boxes) + max(
        box["lMm"] for box in boxes
    )
    horizontal = [d for d in sheet.dimensions if d.axis == "h" and d.view == "top"][0]
    assert abs(horizontal.value_mm - width) < 0.01


def test_the_boxes_carry_the_grade_beams_the_sheet_shows() -> None:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    kinds = {box["kind"] for box in foundation_boxes(foundation)}
    assert kinds == {"footing", "grade-beam"}
    floor = design_typical_floor(spec, foundation, storey_index=1)
    kinds = {box["kind"] for box in floor_boxes(floor)}
    assert kinds == {"column", "slab"}


def test_the_committed_set_carries_three_sheets_and_no_engine_name() -> None:
    manifest = json.loads((SET_DIR / "set-manifest.json").read_text(encoding="utf-8"))
    assert manifest["total"] == 3
    assert [sheet["index"] for sheet in manifest["sheets"]] == [1, 2, 3]
    for index in (1, 2, 3):
        svg = (SET_DIR / f"page-{index}.svg").read_text(encoding="utf-8")
        assert "freecad" not in svg.lower(), f"sheet {index} names the engine"
        assert "not for construction" in svg.lower(), f"sheet {index} has no candidate status"
        assert f"{index} / 3" in svg, f"sheet {index} has no sheet number"
    pdf = (SET_DIR / "drawing-set.pdf").read_bytes()
    assert pdf.startswith(b"%PDF") and b"%%EOF" in pdf
