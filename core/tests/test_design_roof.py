"""The roof and boundary design (W2.13): a simple roof slab and site boundary walls."""

from __future__ import annotations

import json
import pathlib

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.roof import design_roof_boundary

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _design():
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    return spec, design_roof_boundary(spec, foundation, (floor,))


def test_the_roof_sits_above_the_top_floor() -> None:
    _spec, design = _design()
    assert design.roof_slab.z_mm > 0
    assert design.roof_slab.thickness_mm == 125.0  # default


def test_the_boundary_walls_follow_the_plot() -> None:
    _spec, design = _design()
    assert len(design.boundary_walls) == 4
    ids = {wall.id for wall in design.boundary_walls}
    assert ids == {"front", "rear", "left", "right"}


def test_the_roof_overhang_is_written_as_assumption() -> None:
    spec, design = _design()
    pointers = [a.pointer for a in design.assumptions]
    assert "/phases/roof-boundary/data/roofOverhangMm" in pointers


def test_the_boundary_wall_height_is_written_as_assumption() -> None:
    spec, design = _design()
    pointers = [a.pointer for a in design.assumptions]
    assert "/phases/roof-boundary/data/boundaryWallHeightMm" in pointers


def test_a_spec_with_roof_data_uses_it_instead_of_assumptions() -> None:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    for phase in spec["phases"]:
        if phase.get("id") == "roof-boundary":
            phase["data"] = {
                "roofThicknessMm": 150.0,
                "roofOverhangMm": 800.0,
                "boundaryWallHeightMm": 2400.0,
                "boundaryWallThicknessMm": 150.0,
            }
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    design = design_roof_boundary(spec, foundation, (floor,))
    assert design.values["roof.thicknessMm"].value == 150.0
    assert design.values["roof.overhangMm"].value == 800.0
    assert design.values["boundary.wallHeightMm"].value == 2400.0
    assert design.values["boundary.wallThicknessMm"].value == 150.0
    assert len(design.assumptions) == 0


def test_the_roof_volume_is_computed() -> None:
    _spec, design = _design()
    assert design.roof_volume_m3 > 0
    # roof size is frontage + 2*overhang, depth + 2*overhang
    plot = _spec["site"]["plot"]
    frontage = plot["frontageM"]
    depth = plot["areaSqm"] / frontage
    overhang = design.values["roof.overhangMm"].value
    expected_size_x = frontage * 1000 + 2 * overhang
    expected_size_y = depth * 1000 + 2 * overhang
    expected_volume = expected_size_x * expected_size_y * design.values["roof.thicknessMm"].value / 1_000_000_000
    assert abs(design.roof_volume_m3 - round(expected_volume, 6)) < 0.001
