"""Foundation design v0 (W2.2): the Building Spec becomes a measured foundation.

The W1.8 candidate macro (``tools/cad/candidates/geometry_build.py``) is a *scratch* generator:
its parameters are hard-coded and nothing reads the Building Spec. W2.2 replaces that with a
deterministic pipeline:

    Building Spec -> FoundationDesign -> FreeCAD macro -> measured geometry

Two laws shape it:

- **Scripts first, numbers with provenance.** Every dimension in the design says where it came
  from: ``spec`` (the user's answer), ``rule:<pack>`` (a rule pack value), ``derived`` (computed
  from other spec values) or ``assumed`` (an authored default). The pack has no footing-sizing
  rule in v0, so the footing size is an **assumption**, not an invented rule - and the design
  hands the assumptions back so the app can write them into the spec (the interview engine's
  existing authored-assumption path).
- **Measure, don't assert.** The macro is a *candidate*; the W1.8 harness (and the W2.1 pool)
  measure what it built. The case expectations are computed from the design, so the check is
  "the geometry matches the design", never "the geometry matches a number someone copied".

v0 scope, stated plainly: isolated footings in a single row along the frontage, connected by
grade beams. The excavation is a **declared prism** (depth, extents, volume) rather than a
solid - a trench solid would double-count against the footings in every takeoff, and the
site/terrain model is a later package.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

#: Authored defaults for everything the rule pack does not decide in v0. Every one of them is
#: returned as an assumption so the app can record it in the spec with its reason.
ASSUMED_FOOTING_SIZE_MM = 1200.0
ASSUMED_FOOTING_DEPTH_MM = 300.0
ASSUMED_GRADE_BEAM_WIDTH_MM = 300.0
ASSUMED_GRADE_BEAM_DEPTH_MM = 400.0
ASSUMED_EXCAVATION_MARGIN_MM = 600.0
ASSUMED_FOOTING_SPACING_MM = 3000.0

PROVENANCE_SPEC = "spec"
PROVENANCE_DERIVED = "derived"
PROVENANCE_ASSUMED = "assumed"


class DesignError(ValueError):
    """The spec cannot be turned into a foundation (missing or contradictory inputs)."""


@dataclass(frozen=True)
class Value:
    """One design number with its provenance."""

    value: float
    unit: str
    provenance: str
    source: str
    reason: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "value": self.value,
            "unit": self.unit,
            "provenance": self.provenance,
            "source": self.source,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class Assumption:
    """A value the app must write into the spec (with its reason) before it is a fact."""

    pointer: str
    value: float
    unit: str
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "pointer": self.pointer,
            "value": self.value,
            "unit": self.unit,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class Footing:
    """One isolated footing, centred on the grid, with the column point above it."""

    id: str
    x_mm: float
    y_mm: float
    size_x_mm: float
    size_y_mm: float
    depth_mm: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "sizeXMm": self.size_x_mm,
            "sizeYMm": self.size_y_mm,
            "depthMm": self.depth_mm,
        }


@dataclass(frozen=True)
class GradeBeam:
    """A grade beam between two footings."""

    id: str
    from_id: str
    to_id: str
    x_mm: float
    y_mm: float
    length_mm: float
    width_mm: float
    depth_mm: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "from": self.from_id,
            "to": self.to_id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "lengthMm": self.length_mm,
            "widthMm": self.width_mm,
            "depthMm": self.depth_mm,
        }


@dataclass(frozen=True)
class Excavation:
    """The declared excavation prism (v0: declared, not a solid)."""

    origin_x_mm: float
    origin_y_mm: float
    size_x_mm: float
    size_y_mm: float
    depth_mm: float

    @property
    def volume_m3(self) -> float:
        return (self.size_x_mm * self.size_y_mm * self.depth_mm) / 1_000_000_000.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "originXMm": self.origin_x_mm,
            "originYMm": self.origin_y_mm,
            "sizeXMm": self.size_x_mm,
            "sizeYMm": self.size_y_mm,
            "depthMm": self.depth_mm,
            "volumeM3": round(self.volume_m3, 6),
        }


@dataclass(frozen=True)
class FoundationDesign:
    """The foundation the app will build, with every number's provenance."""

    project_id: str
    footings: tuple[Footing, ...]
    grade_beams: tuple[GradeBeam, ...]
    excavation: Excavation
    values: dict[str, Value] = field(default_factory=dict)
    assumptions: tuple[Assumption, ...] = ()

    @property
    def footing_volume_m3(self) -> float:
        total = 0.0
        for footing in self.footings:
            total += footing.size_x_mm * footing.size_y_mm * footing.depth_mm
        for beam in self.grade_beams:
            total += beam.length_mm * beam.width_mm * beam.depth_mm
        return total / 1_000_000_000.0

    def expected_objects(self) -> list[dict[str, Any]]:
        """What the harness may expect to find in the document (computed, never copied)."""
        expected = []
        for footing in self.footings:
            expected.append(
                {
                    "name": f"Footing_{footing.id}",
                    "volumeM3": round(
                        footing.size_x_mm * footing.size_y_mm * footing.depth_mm / 1_000_000_000.0,
                        6,
                    ),
                }
            )
        for beam in self.grade_beams:
            expected.append(
                {
                    "name": f"GradeBeam_{beam.id}",
                    "volumeM3": round(
                        beam.length_mm * beam.width_mm * beam.depth_mm / 1_000_000_000.0, 6
                    ),
                }
            )
        return expected

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "footings": [item.as_dict() for item in self.footings],
            "gradeBeams": [item.as_dict() for item in self.grade_beams],
            "excavation": self.excavation.as_dict(),
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
            "assumptions": [item.as_dict() for item in self.assumptions],
            "totals": {
                "footingVolumeM3": round(self.footing_volume_m3, 6),
                "excavationVolumeM3": round(self.excavation.volume_m3, 6),
            },
        }


def _pointer(spec: dict[str, Any], path: str) -> Any:
    node: Any = spec
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def _phase_data(spec: dict[str, Any], phase_id: str) -> dict[str, Any]:
    for phase in spec.get("phases") or []:
        if phase.get("id") == phase_id:
            return phase.get("data") or {}
    return {}


def design_foundation(spec: dict[str, Any]) -> FoundationDesign:
    """Turn a Building Spec into a foundation design (deterministic, provenance-carrying)."""
    project = spec.get("project") or {}
    project_id = str(project.get("id") or "unknown")
    plot = _pointer(spec, "site.plot") or {}
    excavation_data = _phase_data(spec, "site-excavation")
    foundation_data = _phase_data(spec, "foundation")

    area_sqm = plot.get("areaSqm")
    frontage_m = plot.get("frontageM")
    if not isinstance(area_sqm, (int, float)) or area_sqm <= 0:
        raise DesignError("site.plot.areaSqm is missing or not positive")
    if not isinstance(frontage_m, (int, float)) or frontage_m <= 0:
        raise DesignError("site.plot.frontageM is missing or not positive")
    depth_m = area_sqm / float(frontage_m)
    if not 0 < depth_m <= 500:
        raise DesignError(f"the plot depth derived from the area and the frontage is {depth_m:g} m")

    values: dict[str, Value] = {
        "plot.areaSqm": Value(float(area_sqm), "m2", PROVENANCE_SPEC, "/site/plot/areaSqm"),
        "plot.frontageM": Value(float(frontage_m), "m", PROVENANCE_SPEC, "/site/plot/frontageM"),
        "plot.depthM": Value(
            round(depth_m, 4),
            "m",
            PROVENANCE_DERIVED,
            "/site/plot",
            "areaSqm / frontageM",
        ),
    }

    assumptions: list[Assumption] = []
    excavation_depth = excavation_data.get("excavationDepthM")
    if isinstance(excavation_depth, (int, float)) and excavation_depth > 0:
        values["excavation.depthM"] = Value(
            float(excavation_depth),
            "m",
            PROVENANCE_SPEC,
            "/phases/site-excavation/data/excavationDepthM",
        )
    else:
        excavation_depth = ASSUMED_FOOTING_DEPTH_MM / 1000.0 + 0.3
        values["excavation.depthM"] = Value(
            round(excavation_depth, 4),
            "m",
            PROVENANCE_ASSUMED,
            "v0 default",
            "the spec carries no excavation depth",
        )
        assumptions.append(
            Assumption(
                "/phases/site-excavation/data/excavationDepthM",
                round(excavation_depth, 4),
                "m",
                "the spec carries no excavation depth; v0 assumes footing depth + 300 mm",
            )
        )

    footing_size = ASSUMED_FOOTING_SIZE_MM
    values["footing.sizeMm"] = Value(
        footing_size, "mm", PROVENANCE_ASSUMED, "v0 default", "the rule pack has no footing size"
    )
    assumptions.append(
        Assumption(
            "/phases/foundation/data/footingSizeMm",
            footing_size,
            "mm",
            "the rule pack (v0) has no footing-sizing rule; v0 assumes a 1200 mm square footing",
        )
    )
    # The spec's own footing depth, when it carries one. The key is the spec's key - in
    # metres - and the assumption below points at the same key, so the app writes the
    # assumption where the design reads it (the loop closes).
    footing_depth_m = foundation_data.get("footingDepthM")
    if isinstance(footing_depth_m, (int, float)) and footing_depth_m > 0:
        footing_depth = round(float(footing_depth_m) * 1000.0, 3)
        values["footing.depthMm"] = Value(
            footing_depth,
            "mm",
            PROVENANCE_SPEC,
            "/phases/foundation/data/footingDepthM",
            "the spec's footing depth",
        )
    else:
        footing_depth = ASSUMED_FOOTING_DEPTH_MM
        values["footing.depthMm"] = Value(
            footing_depth,
            "mm",
            PROVENANCE_ASSUMED,
            "v0 default",
            "the rule pack has no footing depth",
        )
        assumptions.append(
            Assumption(
                "/phases/foundation/data/footingDepthM",
                round(footing_depth / 1000.0, 3),
                "m",
                "the rule pack (v0) has no footing-depth rule; v0 assumes a 300 mm footing",
            )
        )
    beam_width = ASSUMED_GRADE_BEAM_WIDTH_MM
    beam_depth = ASSUMED_GRADE_BEAM_DEPTH_MM
    values["gradeBeam.widthMm"] = Value(
        beam_width, "mm", PROVENANCE_ASSUMED, "v0 default", "the rule pack has no grade-beam size"
    )
    values["gradeBeam.depthMm"] = Value(
        beam_depth, "mm", PROVENANCE_ASSUMED, "v0 default", "the rule pack has no grade-beam size"
    )
    assumptions.append(
        Assumption(
            "/phases/foundation/data/gradeBeamMm",
            beam_width,
            "mm",
            "the rule pack (v0) has no grade-beam rule; v0 assumes 300 x 400 mm",
        )
    )

    spacing = ASSUMED_FOOTING_SPACING_MM
    values["footing.spacingMm"] = Value(
        spacing, "mm", PROVENANCE_ASSUMED, "v0 default", "v0 lays the footings on a 3 m grid"
    )
    assumptions.append(
        Assumption(
            "/phases/foundation/data/footingSpacingMm",
            spacing,
            "mm",
            "v0 lays the footings on a 3 m grid along the frontage",
        )
    )

    # The footing line: one isolated footing per structural grid line along the frontage.
    # v0 derives the count from the plot width and the grid spacing, never from the unit count
    # (the unit layout is a W2.3 decision).
    usable_x = float(frontage_m) * 1000.0
    count = max(2, int(usable_x // spacing) + 1)
    start_x = (usable_x - (count - 1) * spacing) / 2.0
    y = (depth_m * 1000.0) / 2.0

    footings = tuple(
        Footing(
            id=f"F{index + 1}",
            x_mm=round(start_x + index * spacing, 3),
            y_mm=round(y, 3),
            size_x_mm=footing_size,
            size_y_mm=footing_size,
            depth_mm=footing_depth,
        )
        for index in range(count)
    )
    values["footing.count"] = Value(
        count, "1", PROVENANCE_DERIVED, "v0", "frontage / grid spacing"
    )

    beams = []
    for index in range(len(footings) - 1):
        left = footings[index]
        right = footings[index + 1]
        length = right.x_mm - left.x_mm
        beams.append(
            GradeBeam(
                id=f"GB{index + 1}",
                from_id=left.id,
                to_id=right.id,
                x_mm=round((left.x_mm + right.x_mm) / 2.0, 3),
                y_mm=round(y, 3),
                length_mm=round(length, 3),
                width_mm=beam_width,
                depth_mm=beam_depth,
            )
        )

    margin = ASSUMED_EXCAVATION_MARGIN_MM
    excavation = Excavation(
        origin_x_mm=round(-margin, 3),
        origin_y_mm=round(-margin, 3),
        size_x_mm=round(usable_x + 2 * margin, 3),
        size_y_mm=round(depth_m * 1000.0 + 2 * margin, 3),
        depth_mm=round(float(excavation_depth) * 1000.0, 3),
    )
    values["excavation.marginMm"] = Value(
        margin, "mm", PROVENANCE_ASSUMED, "v0 default", "a 600 mm working margin around the plot"
    )

    return FoundationDesign(
        project_id=project_id,
        footings=footings,
        grade_beams=tuple(beams),
        excavation=excavation,
        values=values,
        assumptions=tuple(assumptions),
    )


def render_macro(design: FoundationDesign) -> str:
    """Render the design as a deterministic FreeCAD macro (the candidate the pool runs)."""
    payload = {
        "projectId": design.project_id,
        "footings": [item.as_dict() for item in design.footings],
        "gradeBeams": [item.as_dict() for item in design.grade_beams],
        "excavation": design.excavation.as_dict(),
    }
    body = json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True)
    return f'''"""Foundation macro - GENERATED by archres_core.design.foundation (W2.2).

Do not edit: regenerate it from the Building Spec instead. The macro only *builds*; the
harness measures what it built (volume, bounding box, solids, validity).

Job parameters: none in v0 - every dimension is baked into the design, and the design
records where each one came from.
"""

import json
import os
import pathlib

import FreeCAD as App
import Part

DESIGN = json.loads(r"""
{body}
""")


def _box(x_mm, y_mm, z_mm, size_x, size_y, size_z):
    return Part.makeBox(
        size_x,
        size_y,
        size_z,
        App.Vector(x_mm - size_x / 2.0, y_mm - size_y / 2.0, z_mm - size_z),
    )


def build():
    document = App.ActiveDocument
    if document is None:
        raise RuntimeError("no active document: the launcher always creates one")
    for footing in DESIGN["footings"]:
        shape = _box(
            footing["xMm"],
            footing["yMm"],
            0.0,
            footing["sizeXMm"],
            footing["sizeYMm"],
            footing["depthMm"],
        )
        obj = document.addObject("Part::Feature", f"Footing_{{footing['id']}}")
        obj.Shape = shape
        obj.Label = f"Footing {{footing['id']}}"
    for beam in DESIGN["gradeBeams"]:
        shape = _box(
            beam["xMm"],
            beam["yMm"],
            0.0,
            beam["lengthMm"],
            beam["widthMm"],
            beam["depthMm"],
        )
        obj = document.addObject("Part::Feature", f"GradeBeam_{{beam['id']}}")
        obj.Shape = shape
        obj.Label = f"Grade beam {{beam['id']}}"
    document.recompute()

    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR")
    if out_dir:
        summary = {{
            "projectId": DESIGN["projectId"],
            "footings": len(DESIGN["footings"]),
            "gradeBeams": len(DESIGN["gradeBeams"]),
            "excavation": DESIGN["excavation"],
        }}
        target = pathlib.Path(out_dir) / "foundation-design.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(summary, ensure_ascii=False, indent=1, sort_keys=True) + "\\n",
            encoding="utf-8",
        )


build()
'''
