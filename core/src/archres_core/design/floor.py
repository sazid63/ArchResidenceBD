"""Typical floor design v0 (W2.3): the storey above the foundation, measured.

The chain continues from W2.2: the **same** column grid the foundation was designed on carries
the storey, so the floor and the foundation agree by construction instead of by two independent
guesses.

- **Columns** rise from the footings: one column per footing (a real derivation from the
  foundation design), with the storey height taken from the spec
  (`building.storeys.typicalFloorHeightM` / `groundFloorHeightM`).
- **Beams** connect the columns along the grid line: the lengths are derived from the grid, the
  section is an authored assumption (the rule pack has no beam rule in v0).
- **The slab** is the floor plate over the grid, with its thickness taken from the spec's floor
  phase (`slabThicknessMm`) when the phase carries one.
- **Walls and openings are not built in v0.** The v0 spec carries no wall or opening data, so
  the design *declares* them absent with a reason instead of inventing walls. They are a later
  package (or an authored assumption the app records).

Every number carries its provenance, and the assumptions are handed back for the spec - the
same law as the foundation (ADR-0022).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .foundation import (
    spec_value,
    PROVENANCE_ASSUMED,
    PROVENANCE_DERIVED,
    PROVENANCE_SPEC,
    Assumption,
    DesignError,
    FoundationDesign,
    Value,
)

ASSUMED_COLUMN_SIZE_MM = 300.0


def _engine_token(storey_label: str) -> str:
    """The storey label as the engine's object names carry it.

    FreeCAD sanitises an object's name (a hyphen becomes an underscore), so the design has to
    expect the sanitised form - otherwise the design and the engine disagree about what the
    object is called, and the probe cannot check one against the other.
    """
    return storey_label.replace("-", "_")
ASSUMED_BEAM_WIDTH_MM = 300.0
ASSUMED_BEAM_DEPTH_MM = 450.0
ASSUMED_SLAB_OVERHANG_MM = 150.0


@dataclass(frozen=True)
class Column:
    """One column, standing on a footing."""

    id: str
    x_mm: float
    y_mm: float
    size_mm: float
    height_mm: float
    footing_id: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "sizeMm": self.size_mm,
            "heightMm": self.height_mm,
            "footingId": self.footing_id,
        }


@dataclass(frozen=True)
class Beam:
    """One beam between two columns."""

    id: str
    x_mm: float
    y_mm: float
    length_mm: float
    width_mm: float
    depth_mm: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "lengthMm": self.length_mm,
            "widthMm": self.width_mm,
            "depthMm": self.depth_mm,
        }


@dataclass(frozen=True)
class Slab:
    """The floor plate over the grid."""

    origin_x_mm: float
    origin_y_mm: float
    size_x_mm: float
    size_y_mm: float
    thickness_mm: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "originXMm": self.origin_x_mm,
            "originYMm": self.origin_y_mm,
            "sizeXMm": self.size_x_mm,
            "sizeYMm": self.size_y_mm,
            "thicknessMm": self.thickness_mm,
        }


@dataclass(frozen=True)
class FloorDesign:
    """One storey: columns, beams and the slab, on the foundation's grid."""

    project_id: str
    storey_index: int
    storey_label: str
    columns: tuple[Column, ...]
    beams: tuple[Beam, ...]
    slab: Slab
    base_z_mm: float = 0.0
    walls: tuple[()] = ()
    values: dict[str, Value] = field(default_factory=dict)
    assumptions: tuple[Assumption, ...] = ()
    declared_absent: tuple[str, ...] = ()

    def expected_objects(self) -> list[dict[str, Any]]:
        """What the engine may be expected to find (computed from the design)."""
        expected = []
        for column in self.columns:
            expected.append(
                {
                    "name": f"Column_{_engine_token(self.storey_label)}_{column.id}",
                    "volumeM3": round(
                        column.size_mm * column.size_mm * column.height_mm / 1_000_000_000.0, 6
                    ),
                    "bboxZMm": [self.base_z_mm, self.base_z_mm + column.height_mm],
                }
            )
        for beam in self.beams:
            expected.append(
                {
                    "name": f"Beam_{_engine_token(self.storey_label)}_{beam.id}",
                    "volumeM3": round(
                        beam.length_mm * beam.width_mm * beam.depth_mm / 1_000_000_000.0, 6
                    ),
                    "bboxZMm": [self.base_z_mm, self.base_z_mm + beam.depth_mm],
                }
            )
        expected.append(
            {
                "name": f"Slab_{_engine_token(self.storey_label)}",
                "volumeM3": round(
                    self.slab.size_x_mm * self.slab.size_y_mm * self.slab.thickness_mm
                    / 1_000_000_000.0,
                    6,
                ),
                "bboxZMm": [self.base_z_mm, self.base_z_mm + self.slab.thickness_mm],
            }
        )
        return expected

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "storeyIndex": self.storey_index,
            "storeyLabel": self.storey_label,
            "baseZMm": self.base_z_mm,
            "columns": [item.as_dict() for item in self.columns],
            "beams": [item.as_dict() for item in self.beams],
            "slab": self.slab.as_dict(),
            "declaredAbsent": list(self.declared_absent),
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
            "assumptions": [item.as_dict() for item in self.assumptions],
        }


def _phase_data(spec: dict[str, Any], phase_id: str) -> dict[str, Any]:
    for phase in spec.get("phases") or []:
        if phase.get("id") == phase_id:
            return phase.get("data") or {}
    return {}


def _storey_height_m(spec: dict[str, Any], storey_index: int) -> tuple[float, str]:
    """The storey's floor-to-floor height: from the spec, never invented."""
    storeys = (spec.get("building") or {}).get("storeys") or {}
    if storey_index == 0:
        height = storeys.get("groundFloorHeightM")
        if isinstance(height, (int, float)) and height > 0:
            return float(height), "/building/storeys/groundFloorHeightM"
    height = storeys.get("typicalFloorHeightM")
    if isinstance(height, (int, float)) and height > 0:
        return float(height), "/building/storeys/typicalFloorHeightM"
    raise DesignError("the spec carries no storey height for this storey")


def storey_base_z_m(spec: dict[str, Any], storey_index: int) -> float:
    """The elevation of a storey's floor level: the storeys below it, added up.

    The storeys must **stack**: a first floor built at z = 0 would sit inside the ground
    floor. The elevation is derived from the spec's own storey heights - the ground storey
    starts at 0 and every storey above starts where the one below ends.
    """
    storeys = (spec.get("building") or {}).get("storeys") or {}
    base = 0.0
    for index in range(storey_index):
        if index == 0:
            height = storeys.get("groundFloorHeightM")
        else:
            height = storeys.get("typicalFloorHeightM")
        if not isinstance(height, (int, float)) or height <= 0:
            raise DesignError(f"the spec carries no height for the storey below {storey_index}")
        base += float(height)
    return round(base, 4)


def design_typical_floor(
    spec: dict[str, Any], foundation: FoundationDesign, *, storey_index: int = 1
) -> FloorDesign:
    """Design one storey on the foundation's grid (deterministic, provenance-carrying)."""
    project = spec.get("project") or {}
    project_id = str(project.get("id") or "unknown")
    height_m, height_source = _storey_height_m(spec, storey_index)
    height_mm = height_m * 1000.0
    base_z_m = storey_base_z_m(spec, storey_index)
    base_z_mm = base_z_m * 1000.0

    values: dict[str, Value] = {
        "storey.heightM": Value(height_m, "m", PROVENANCE_SPEC, height_source),
        "storey.baseElevationM": Value(
            base_z_m,
            "m",
            PROVENANCE_DERIVED,
            "building.storeys",
            "the storeys below, added up",
        ),
        "column.count": Value(
            len(foundation.footings),
            "1",
            PROVENANCE_DERIVED,
            "foundation design",
            "one column per footing, on the foundation grid",
        ),
    }
    # The floor phase's own data - the storey's overrides. The assumptions the design hands
    # back point at exactly these keys, so the app writes where the design reads.
    floor_phase_id = f"floor-{storey_index}"
    floor_data = _phase_data(spec, floor_phase_id)
    column_size, column_value, column_assumption = spec_value(
        floor_data,
        floor_phase_id,
        "columnSizeMm",
        ASSUMED_COLUMN_SIZE_MM,
        "mm",
        "the rule pack (v0) has no column-sizing rule; v0 assumes a 300 mm square column",
    )
    beam_width, width_value, width_assumption = spec_value(
        floor_data,
        floor_phase_id,
        "beamWidthMm",
        ASSUMED_BEAM_WIDTH_MM,
        "mm",
        "the rule pack (v0) has no beam-sizing rule; v0 assumes 300 x 450 mm",
    )
    beam_depth, depth_value, depth_assumption = spec_value(
        floor_data,
        floor_phase_id,
        "beamDepthMm",
        ASSUMED_BEAM_DEPTH_MM,
        "mm",
        "the rule pack (v0) has no beam-sizing rule; v0 assumes 300 x 450 mm",
    )
    assumptions: list[Assumption] = [
        item
        for item in (column_assumption, width_assumption, depth_assumption)
        if item is not None
    ]
    values["column.sizeMm"] = column_value
    values["beam.widthMm"] = width_value
    values["beam.depthMm"] = depth_value

    columns = tuple(
        Column(
            id=f"C{index + 1}",
            x_mm=footing.x_mm,
            y_mm=footing.y_mm,
            size_mm=column_size,
            height_mm=round(height_mm, 3),
            footing_id=footing.id,
        )
        for index, footing in enumerate(foundation.footings)
    )

    beams = []
    for index in range(len(columns) - 1):
        left = columns[index]
        right = columns[index + 1]
        beams.append(
            Beam(
                id=f"B{index + 1}",
                x_mm=round((left.x_mm + right.x_mm) / 2.0, 3),
                y_mm=round(left.y_mm, 3),
                length_mm=round(right.x_mm - left.x_mm, 3),
                width_mm=beam_width,
                depth_mm=beam_depth,
            )
        )

    floor_phase = _phase_data(spec, f"floor-{storey_index}")
    slab_thickness = floor_phase.get("slabThicknessMm")
    if isinstance(slab_thickness, (int, float)) and slab_thickness > 0:
        values["slab.thicknessMm"] = Value(
            float(slab_thickness),
            "mm",
            PROVENANCE_SPEC,
            f"/phases/floor-{storey_index}/data/slabThicknessMm",
        )
    else:
        slab_thickness = 125.0
        values["slab.thicknessMm"] = Value(
            slab_thickness, "mm", PROVENANCE_ASSUMED, "v0 default", "the phase carries no thickness"
        )
        assumptions.append(
            Assumption(
                f"/phases/floor-{storey_index}/data/slabThicknessMm",
                slab_thickness,
                "mm",
                "the floor phase carries no slab thickness; v0 assumes 125 mm",
            )
        )

    xs = [footing.x_mm for footing in foundation.footings]
    ys = [footing.y_mm for footing in foundation.footings]
    overhang, overhang_value, overhang_assumption = spec_value(
        floor_data,
        floor_phase_id,
        "slabOverhangMm",
        ASSUMED_SLAB_OVERHANG_MM,
        "mm",
        "a 150 mm slab overhang past the grid",
    )
    values["slab.overhangMm"] = overhang_value
    if overhang_assumption is not None:
        assumptions.append(overhang_assumption)
    slab = Slab(
        origin_x_mm=round(min(xs) - overhang, 3),
        origin_y_mm=round(min(ys) - overhang, 3),
        size_x_mm=round(max(xs) - min(xs) + 2 * overhang, 3),
        size_y_mm=round(max(ys) - min(ys) + 2 * overhang, 3),
        thickness_mm=round(float(slab_thickness), 3),
    )

    declared_absent = ()
    if not any(
        (phase.get("data") or {}).get("walls")
        for phase in spec.get("phases") or []
        if str(phase.get("id", "")).startswith("floor")
    ):
        declared_absent = (
            "walls: the v0 spec carries no wall data, so no wall is built (an invented wall "
            "would be a fabricated fact)",
            "openings: the v0 spec carries no opening data, so no opening is cut",
        )

    return FloorDesign(
        project_id=project_id,
        storey_index=storey_index,
        storey_label=f"floor-{storey_index}",
        columns=columns,
        beams=tuple(beams),
        slab=slab,
        base_z_mm=round(base_z_mm, 3),
        values=values,
        assumptions=tuple(assumptions),
        declared_absent=declared_absent,
    )


def render_floor_macro(design: FloorDesign) -> str:
    """Render the storey as a deterministic FreeCAD macro."""
    payload = {
        "projectId": design.project_id,
        "storeyIndex": design.storey_index,
        "storeyLabel": design.storey_label,
        "baseZMm": design.base_z_mm,
        "columns": [item.as_dict() for item in design.columns],
        "beams": [item.as_dict() for item in design.beams],
        "slab": design.slab.as_dict(),
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True)
    return f'''"""Typical floor macro - GENERATED by archres_core.design.floor (W2.3).

Do not edit: regenerate it from the Building Spec instead. The macro only *builds*; the
harness measures what it built (volume, bounding box, solids, validity).
"""

import json
import os
import pathlib

import FreeCAD as App
import Part

DESIGN = json.loads(r"""
{body}
""")


def _box(x_mm, y_mm, z_bottom_mm, size_x, size_y, size_z):
    """A box whose *bottom* sits at z_bottom_mm (the storey's own level)."""
    return Part.makeBox(
        size_x,
        size_y,
        size_z,
        App.Vector(x_mm - size_x / 2.0, y_mm - size_y / 2.0, z_bottom_mm),
    )


def build():
    document = App.ActiveDocument
    if document is None:
        raise RuntimeError("no active document: the launcher always creates one")
    base_z = DESIGN["baseZMm"]
    storey = DESIGN["storeyLabel"].replace("-", "_")
    for column in DESIGN["columns"]:
        shape = _box(
            column["xMm"],
            column["yMm"],
            base_z,
            column["sizeMm"],
            column["sizeMm"],
            column["heightMm"],
        )
        obj = document.addObject("Part::Feature", f"Column_{{storey}}_{{column['id']}}")
        obj.Shape = shape
        obj.Label = f"Column {{DESIGN['storeyLabel']}} {{column['id']}}"
    for beam in DESIGN["beams"]:
        shape = _box(
            beam["xMm"],
            beam["yMm"],
            base_z,
            beam["lengthMm"],
            beam["widthMm"],
            beam["depthMm"],
        )
        obj = document.addObject("Part::Feature", f"Beam_{{storey}}_{{beam['id']}}")
        obj.Shape = shape
        obj.Label = f"Beam {{DESIGN['storeyLabel']}} {{beam['id']}}"
    slab = DESIGN["slab"]
    shape = Part.makeBox(
        slab["sizeXMm"],
        slab["sizeYMm"],
        slab["thicknessMm"],
        App.Vector(slab["originXMm"], slab["originYMm"], base_z),
    )
    obj = document.addObject("Part::Feature", f"Slab_{{storey}}")
    obj.Shape = shape
    obj.Label = f"Slab {{DESIGN['storeyLabel']}}"
    document.recompute()

    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR")
    if out_dir:
        summary = {{
            "projectId": DESIGN["projectId"],
            "storeyIndex": DESIGN["storeyIndex"],
            "columns": len(DESIGN["columns"]),
            "beams": len(DESIGN["beams"]),
        }}
        target = pathlib.Path(out_dir) / "floor-design.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(summary, ensure_ascii=False, indent=1, sort_keys=True) + "\\n",
            encoding="utf-8",
        )


build()
'''
