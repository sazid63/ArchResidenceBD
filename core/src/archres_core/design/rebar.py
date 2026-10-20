"""Rebar design v0 (W2.4): the storey becomes steel, and the steel becomes a BBS.

The chain continues: the **floor design** (W2.3) says how big the members are; this package
says how much steel they need and writes the Bar Bending Schedule the BOQ will cost.

- **Measure, don't assert.** Steel is measured from geometry: a round bar's length is
  ``Shape.Volume / (pi/4 * d^2)`` (spike S5, interfaces §1). The BBS computes the same
  quantity from the design, so the engine's measurement and the schedule are two independent
  computations of the same steel.
- **Numbers with provenance.** Diameters, spacings and covers are **authored assumptions** (the
  rule pack has no detailing rules in v0); the member sizes and bar lengths are **derived** from
  the design; the assumptions are handed back for the spec.
- **The BBS is data, not a drawing.** Mark, shape, diameter, length, count, weight - the shape
  list and the title block come later (W3.4).

v0 scope: **round bars only** (straight mains and rectangular links built from straight
segments), because the ``pi/4 * d^2`` law is exact for them. FreeCAD-Reinforcement's richer
detailing (bent shapes, offsets, the face-selection rules of spike S5) is a later refinement;
the BBS model carries a shape field so it can hold it when it arrives.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from typing import Any

from .floor import FloorDesign
from .foundation import (
    PROVENANCE_ASSUMED,
    PROVENANCE_DERIVED,
    Assumption,
    DesignError,
    FoundationDesign,
    Value,
)

ASSUMED_COVER_MM = 40.0
ASSUMED_COLUMN_MAIN_DIAMETER_MM = 16.0
ASSUMED_COLUMN_MAIN_COUNT = 4
ASSUMED_LINK_DIAMETER_MM = 8.0
ASSUMED_LINK_SPACING_MM = 150.0
ASSUMED_BEAM_MAIN_DIAMETER_MM = 16.0
ASSUMED_BEAM_MAIN_COUNT = 2
ASSUMED_SLAB_MAIN_DIAMETER_MM = 10.0
ASSUMED_SLAB_MAIN_SPACING_MM = 150.0
ASSUMED_SLAB_DISTRIBUTION_DIAMETER_MM = 8.0
ASSUMED_SLAB_DISTRIBUTION_SPACING_MM = 200.0
ASSUMED_FOOTING_MESH_DIAMETER_MM = 12.0
ASSUMED_FOOTING_MESH_SPACING_MM = 150.0
ASSUMED_STARTER_DIAMETER_MM = 16.0
ASSUMED_STARTER_COUNT = 4
ASSUMED_STARTER_LENGTH_MM = 600.0

STEEL_DENSITY_KG_PER_M3 = 7850.0
BBS_SCHEMA_VERSION = "0.1.0"
SHAPES = ("straight", "link", "bent", "hook", "starter")


@dataclass(frozen=True)
class Bar:
    """One mark in the schedule (a group of identical bars)."""

    mark: str
    member: str
    role: str
    shape: str
    diameter_mm: float
    length_mm: float
    count: int
    #: (x, y, z, length, dx, dy, dz, group) per bar segment. Bars that share a group are
    #: welded into one bar (a link is four segments); the group index is what the macro
    #: fuses, so the geometry matches the schedule.
    placements: tuple[tuple[float, float, float, float, float, float, float, int], ...] = ()

    @property
    def area_m2(self) -> float:
        return math.pi / 4.0 * (self.diameter_mm / 1000.0) ** 2

    @property
    def weight_kg(self) -> float:
        return round(self.length_mm / 1000.0 * self.area_m2 * STEEL_DENSITY_KG_PER_M3 * self.count, 4)

    def as_dict(self) -> dict[str, Any]:
        return {
            "mark": self.mark,
            "member": self.member,
            "role": self.role,
            "shape": self.shape,
            "diameterMm": self.diameter_mm,
            "lengthMm": round(self.length_mm, 3),
            "count": self.count,
            "weightKg": self.weight_kg,
        }


@dataclass(frozen=True)
class RebarDesign:
    """The steel for one project, grouped into BBS marks."""

    project_id: str
    bars: tuple[Bar, ...]
    values: dict[str, Value] = field(default_factory=dict)
    assumptions: tuple[Assumption, ...] = ()

    def expected_objects(self) -> list[dict[str, Any]]:
        """What the engine may be expected to build (computed from the design)."""
        return [
            {
                "name": object_name(bar.mark),
                "volumeM3": round(bar.count * bar.length_mm / 1000.0 * bar.area_m2, 9),
            }
            for bar in self.bars
        ]

    def total_weight_kg(self) -> float:
        return round(sum(bar.weight_kg for bar in self.bars), 4)

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "bars": [bar.as_dict() for bar in self.bars],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
            "assumptions": [item.as_dict() for item in self.assumptions],
            "totals": {"weightKg": self.total_weight_kg()},
        }


def object_name(mark: str) -> str:
    """The object name FreeCAD will accept (document names are alphanumeric)."""
    return "Rebar_" + re.sub(r"[^A-Za-z0-9_]", "_", mark)


def _assumption(pointer: str, value: float, unit: str, reason: str) -> Assumption:
    return Assumption(pointer=pointer, value=value, unit=unit, reason=reason)


def _column_bars(column, base_z_mm: float, cover: float) -> list[Bar]:
    main_length = max(column.height_mm - 2 * cover, 1.0)
    offset = ASSUMED_COLUMN_MAIN_DIAMETER_MM / 2.0
    half = column.size_mm / 2.0 - cover - offset
    mains = Bar(
        mark=f"{column.id}-MAINS",
        member=column.id,
        role="mains",
        shape="straight",
        diameter_mm=ASSUMED_COLUMN_MAIN_DIAMETER_MM,
        length_mm=round(main_length, 3),
        count=ASSUMED_COLUMN_MAIN_COUNT,
        placements=tuple(
            (column.x_mm + dx, column.y_mm + dy, base_z_mm, main_length, 1.0, 0.0, 0.0, index)
            for index, (dx, dy) in enumerate(
                ((half, 0.0), (-half, 0.0), (0.0, half), (0.0, -half))
            )
        ),
    )
    clear = column.size_mm - 2 * cover
    link_count = max(1, int((column.height_mm - 2 * cover) // ASSUMED_LINK_SPACING_MM) + 1)
    half = clear / 2.0
    placements: list[tuple[float, float, float, float, float, float, float, int]] = []
    for index in range(link_count):
        z = base_z_mm + cover + index * ASSUMED_LINK_SPACING_MM
        group = index
        placements.extend(
            [
                (column.x_mm, column.y_mm - half, z, clear, 1.0, 0.0, 0.0, group),
                (column.x_mm, column.y_mm + half, z, clear, 1.0, 0.0, 0.0, group),
                (column.x_mm - half, column.y_mm, z, clear, 0.0, 1.0, 0.0, group),
                (column.x_mm + half, column.y_mm, z, clear, 0.0, 1.0, 0.0, group),
            ]
        )
    links = Bar(
        mark=f"{column.id}-LINK-1",
        member=column.id,
        role="links",
        shape="link",
        diameter_mm=ASSUMED_LINK_DIAMETER_MM,
        length_mm=round(4 * clear, 3),
        count=link_count,
        placements=tuple(placements),
    )
    return [mains, links]


def _beam_bars(beam, base_z_mm: float, cover: float) -> list[Bar]:
    main_length = max(beam.length_mm - 2 * cover, 1.0)
    top = base_z_mm + beam.depth_mm - cover
    bottom = base_z_mm + cover
    y_top = beam.y_mm - beam.width_mm / 2 + cover
    y_bottom = beam.y_mm + beam.width_mm / 2 - cover
    mains = Bar(
        mark=f"{beam.id}-MAINS",
        member=beam.id,
        role="mains",
        shape="straight",
        diameter_mm=ASSUMED_BEAM_MAIN_DIAMETER_MM,
        length_mm=round(main_length, 3),
        count=ASSUMED_BEAM_MAIN_COUNT * 2,
        placements=(
            (beam.x_mm, y_top, top, main_length, 1.0, 0.0, 0.0, 0),
            (beam.x_mm, y_top, bottom, main_length, 1.0, 0.0, 0.0, 1),
            (beam.x_mm, y_bottom, top, main_length, 1.0, 0.0, 0.0, 2),
            (beam.x_mm, y_bottom, bottom, main_length, 1.0, 0.0, 0.0, 3),
        ),
    )
    clear_x = beam.width_mm - 2 * cover
    clear_z = beam.depth_mm - 2 * cover
    link_count = max(1, int((beam.length_mm - 2 * cover) // ASSUMED_LINK_SPACING_MM) + 1)
    half_x = clear_x / 2.0
    half_z = clear_z / 2.0
    placements: list[tuple[float, float, float, float, float, float, float, int]] = []
    for index in range(link_count):
        x = beam.x_mm - beam.length_mm / 2 + cover + index * ASSUMED_LINK_SPACING_MM
        group = index
        placements.extend(
            [
                (x, beam.y_mm - half_x, base_z_mm + half_z, clear_x, 1.0, 0.0, 0.0, group),
                (x, beam.y_mm + half_x, base_z_mm + half_z, clear_x, 1.0, 0.0, 0.0, group),
                (x, beam.y_mm, base_z_mm, clear_z, 0.0, 0.0, 1.0, group),
                (x, beam.y_mm, base_z_mm + clear_z, clear_z, 0.0, 0.0, 1.0, group),
            ]
        )
    links = Bar(
        mark=f"{beam.id}-LINK-1",
        member=beam.id,
        role="links",
        shape="link",
        diameter_mm=ASSUMED_LINK_DIAMETER_MM,
        length_mm=round(2 * clear_x + 2 * clear_z, 3),
        count=link_count,
        placements=tuple(placements),
    )
    return [mains, links]


def _slab_bars(slab, base_z_mm: float, cover: float) -> list[Bar]:
    main_count = max(1, int((slab.size_y_mm - 2 * cover) // ASSUMED_SLAB_MAIN_SPACING_MM) + 1)
    main_length = max(slab.size_x_mm - 2 * cover, 1.0)
    placements = [
        (
            slab.origin_x_mm + cover,
            slab.origin_y_mm + cover + index * ASSUMED_SLAB_MAIN_SPACING_MM,
            base_z_mm,
            main_length,
            1.0,
            0.0,
            0.0,
            index,
        )
        for index in range(main_count)
    ]
    mains = Bar(
        mark="S1-MAINS",
        member="Slab_1",
        role="mains",
        shape="straight",
        diameter_mm=ASSUMED_SLAB_MAIN_DIAMETER_MM,
        length_mm=round(main_length, 3),
        count=main_count,
        placements=tuple(placements),
    )
    distribution_count = max(
        1, int((slab.size_x_mm - 2 * cover) // ASSUMED_SLAB_DISTRIBUTION_SPACING_MM) + 1
    )
    distribution_length = max(slab.size_y_mm - 2 * cover, 1.0)
    placements = [
        (
            slab.origin_x_mm + cover + index * ASSUMED_SLAB_DISTRIBUTION_SPACING_MM,
            slab.origin_y_mm + cover,
            base_z_mm,
            distribution_length,
            0.0,
            1.0,
            0.0,
            index,
        )
        for index in range(distribution_count)
    ]
    distribution = Bar(
        mark="S1-DIST",
        member="Slab_1",
        role="distribution",
        shape="straight",
        diameter_mm=ASSUMED_SLAB_DISTRIBUTION_DIAMETER_MM,
        length_mm=round(distribution_length, 3),
        count=distribution_count,
        placements=tuple(placements),
    )
    return [mains, distribution]


def _footing_bars(footing, cover: float) -> list[Bar]:
    clear = footing.size_x_mm - 2 * cover
    mesh_count = max(1, int(clear // ASSUMED_FOOTING_MESH_SPACING_MM) + 1)
    z = -footing.depth_mm + cover
    x_placements: list[tuple[float, float, float, float, float, float, float, int]] = []
    y_placements: list[tuple[float, float, float, float, float, float, float, int]] = []
    for index in range(mesh_count):
        offset = cover + index * ASSUMED_FOOTING_MESH_SPACING_MM
        x_placements.append(
            (footing.x_mm - clear / 2, footing.y_mm - clear / 2 + offset, z, clear, 1.0, 0.0, 0.0, index)
        )
        y_placements.append(
            (footing.x_mm - clear / 2 + offset, footing.y_mm - clear / 2, z, clear, 0.0, 1.0, 0.0, index)
        )
    mesh_x = Bar(
        mark=f"{footing.id}-MESH-X",
        member=footing.id,
        role="mesh",
        shape="straight",
        diameter_mm=ASSUMED_FOOTING_MESH_DIAMETER_MM,
        length_mm=round(clear, 3),
        count=mesh_count,
        placements=tuple(x_placements),
    )
    mesh_y = Bar(
        mark=f"{footing.id}-MESH-Y",
        member=footing.id,
        role="mesh",
        shape="straight",
        diameter_mm=ASSUMED_FOOTING_MESH_DIAMETER_MM,
        length_mm=round(clear, 3),
        count=mesh_count,
        placements=tuple(y_placements),
    )
    starters = Bar(
        mark=f"{footing.id}-START",
        member=footing.id,
        role="starters",
        shape="starter",
        diameter_mm=ASSUMED_STARTER_DIAMETER_MM,
        length_mm=ASSUMED_STARTER_LENGTH_MM,
        count=ASSUMED_STARTER_COUNT,
        placements=tuple(
            (
                footing.x_mm + dx,
                footing.y_mm + dy,
                -footing.depth_mm,
                ASSUMED_STARTER_LENGTH_MM,
                0.0,
                0.0,
                1.0,
                index,
            )
            for index, (dx, dy) in enumerate(
                ((120.0, 120.0), (120.0, -120.0), (-120.0, 120.0), (-120.0, -120.0))
            )
        ),
    )
    return [mesh_x, mesh_y, starters]


def design_rebar(
    spec: dict[str, Any],
    foundation: FoundationDesign,
    floor: FloorDesign,
) -> RebarDesign:
    """Design the steel for a storey (and the footings under it) - deterministic."""
    if not floor.columns:
        raise DesignError("the floor design carries no columns to reinforce")
    cover = ASSUMED_COVER_MM
    values: dict[str, Value] = {
        "rebar.coverMm": Value(
            cover, "mm", PROVENANCE_ASSUMED, "v0 default", "no detailing rule in the pack"
        ),
        "rebar.columnCount": Value(
            len(floor.columns), "1", PROVENANCE_DERIVED, "floor design", "one column set per column"
        ),
    }
    assumptions = [
        _assumption(
            "/phases/foundation/data/rebarCoverMm", cover, "mm",
            "the rule pack (v0) has no detailing rule; v0 assumes a 40 mm cover",
        ),
        _assumption(
            "/phases/foundation/data/columnMainDiameterMm", ASSUMED_COLUMN_MAIN_DIAMETER_MM, "mm",
            "the rule pack (v0) has no rebar detailing rule; v0 assumes 16 mm column mains",
        ),
        _assumption(
            "/phases/foundation/data/linkDiameterMm", ASSUMED_LINK_DIAMETER_MM, "mm",
            "the rule pack (v0) has no rebar detailing rule; v0 assumes 8 mm links",
        ),
        _assumption(
            "/phases/foundation/data/linkSpacingMm", ASSUMED_LINK_SPACING_MM, "mm",
            "the rule pack (v0) has no rebar detailing rule; v0 assumes 150 mm link spacing",
        ),
        _assumption(
            "/phases/foundation/data/footingMeshDiameterMm", ASSUMED_FOOTING_MESH_DIAMETER_MM, "mm",
            "the rule pack (v0) has no rebar detailing rule; v0 assumes 12 mm footing mesh",
        ),
    ]

    bars: list[Bar] = []
    for column in floor.columns:
        bars.extend(_column_bars(column, floor.base_z_mm, cover))
    for beam in floor.beams:
        bars.extend(_beam_bars(beam, floor.base_z_mm, cover))
    bars.extend(_slab_bars(floor.slab, floor.base_z_mm, cover))
    for footing in foundation.footings:
        bars.extend(_footing_bars(footing, cover))

    return RebarDesign(
        project_id=floor.project_id,
        bars=tuple(bars),
        values=values,
        assumptions=tuple(assumptions),
    )


def build_bbs(design: RebarDesign) -> dict[str, Any]:
    """The Bar Bending Schedule as data (the shape list and title block come later)."""
    items = [bar.as_dict() for bar in design.bars]
    by_diameter: dict[str, float] = {}
    bar_count = 0
    for item in items:
        key = str(int(round(item["diameterMm"])))
        by_diameter[key] = round(by_diameter.get(key, 0.0) + item["weightKg"], 4)
        bar_count += item["count"]
    return {
        "schemaVersion": BBS_SCHEMA_VERSION,
        "projectId": design.project_id,
        "items": items,
        "totals": {
            "barCount": bar_count,
            "weightKg": design.total_weight_kg(),
            "byDiameterKg": dict(sorted(by_diameter.items(), key=lambda pair: int(pair[0]))),
        },
        "densityKgPerM3": STEEL_DENSITY_KG_PER_M3,
        "assumptions": [item.as_dict() for item in design.assumptions],
    }


def render_rebar_macro(design: RebarDesign) -> str:
    """Render the steel as a deterministic FreeCAD macro (round bars only)."""
    payload = {
        "projectId": design.project_id,
        "bars": [
            {
                "mark": bar.mark,
                "diameterMm": bar.diameter_mm,
                "placements": [list(item) for item in bar.placements],
            }
            for bar in design.bars
        ],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True)
    return f'''"""Rebar macro - GENERATED by archres_core.design.rebar (W2.4).

Do not edit: regenerate it from the Building Spec instead. Round bars only (v0): a bar's
length is measured from its volume with the pi/4 * d^2 law (spike S5), so the engine's
measurement and the BBS are two independent computations of the same steel.
"""

import json
import math
import os
import pathlib

import FreeCAD as App
import Part

DESIGN = json.loads(r"""
{body}
""")


def _bar(x_mm, y_mm, z_mm, length_mm, direction, diameter_mm):
    radius = diameter_mm / 2.0
    origin = App.Vector(x_mm, y_mm, z_mm)
    return Part.makeCylinder(radius, length_mm, origin, direction)


def _object_name(mark):
    # FreeCAD document names are alphanumeric: dashes would be replaced silently.
    return "Rebar_" + "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in mark)


def build():
    document = App.ActiveDocument
    if document is None:
        raise RuntimeError("no active document: the launcher always creates one")
    for bar in DESIGN["bars"]:
        groups = {{}}
        for placement in bar["placements"]:
            x_mm, y_mm, z_mm, length_mm, dx, dy, dz, group = placement
            direction = App.Vector(dx, dy, dz)
            groups.setdefault(group, []).append(
                _bar(x_mm, y_mm, z_mm, length_mm, direction, bar["diameterMm"])
            )
        bars = []
        for group in sorted(groups):
            shapes = groups[group]
            if len(shapes) == 1:
                bars.append(shapes[0])
                continue
            welded = shapes[0]
            for shape in shapes[1:]:
                welded = welded.fuse(shape)
            bars.append(welded)
        if not bars:
            continue
        obj = document.addObject("Part::Feature", _object_name(bar["mark"]))
        obj.Shape = Part.makeCompound(bars)
        obj.Label = f"Rebar {{bar['mark']}}"
    document.recompute()

    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR")
    if out_dir:
        summary = {{
            "projectId": DESIGN["projectId"],
            "marks": len(DESIGN["bars"]),
        }}
        target = pathlib.Path(out_dir) / "rebar-design.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(summary, ensure_ascii=False, indent=1, sort_keys=True) + "\\n",
            encoding="utf-8",
        )


build()
'''
