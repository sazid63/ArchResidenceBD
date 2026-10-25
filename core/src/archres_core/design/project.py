"""Project design (W2.10): the chain from one Building Spec to one building.

The plan's pipeline (§6) is *site/foundation → structure → per-floor + MEP → roof/boundary →
 drawings → BBS → takeoff/BOQ*. Every engine in that chain exists as its own package (W2.2
 foundation, W2.3 floor, W2.4 rebar, W2.5 sheet, W2.6 BOQ); this module is the **assembly** —
 it says which design belongs to which phase, in which order they are built, and which parts of
 the plan v0 does not cover (so the gap is visible instead of implied).

The walking skeleton (W2.10) was the phase's proof: one small house, from the spec to a
 measured foundation, a floor with its steel, a sheet a human can read and a priced BOQ.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Tuple

from .boq import Takeoff, design_takeoff
from .drawing import DrawingDesign, design_sheet
from .floor import FloorDesign, design_typical_floor
from .foundation import FoundationDesign, design_foundation
from .rebar import RebarDesign, design_rebar
from .mep import MepDesign, design_mep
from .commons import CommonServicesDesign, design_common_services
from .roof import RoofDesign, design_roof_boundary
from .foundation import DesignError

# The plan's pipeline order (plan §6). v0 covers the first four stages; the rest is declared.
PIPELINE = (
    ("site-excavation", "excavation"),
    ("foundation", "foundation"),
    ("floor", "floor"),
    # The per-floor MEP (plan §6: "per-floor + MEP (layouts/schedules/sizing)") - the point
    # layouts, the circuits and the schedules (W3.1).
    ("floor", "mep"),
    ("roof-boundary", "roof"),
    ("common-services", "common services"),
    ("drawings", "sheet"),
    ("bbs", "rebar schedule"),
    ("takeoff", "boq"),
)

UNCOVERED_PHASES = ()


@dataclass(frozen=True)
class DesignAssumption:
    """A value a part of the design assumed, together with the part that assumed it."""

    source: str
    pointer: str
    value: float
    unit: str
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "pointer": self.pointer,
            "value": self.value,
            "unit": self.unit,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class ProjectDesign:
    """One project: the phase designs, in the order the pipeline builds them."""

    project_id: str
    project_name: str
    foundation: FoundationDesign
    floors: tuple[FloorDesign, ...]
    rebar: RebarDesign
    sheet: DrawingDesign
    takeoff: Takeoff
    roof: RoofDesign
    commons: CommonServicesDesign
    meps: tuple[MepDesign, ...] = ()
    # The design's assumptions, each tagged with the part that made it.
    assumptions: tuple[DesignAssumption, ...] = ()
    stages: tuple[tuple[str, str], ...] = PIPELINE

    @property
    def uncovered_phases(self) -> tuple[str, ...]:
        return UNCOVERED_PHASES

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "projectName": self.project_name,
            "stages": [{"phase": phase, "stage": stage} for phase, stage in self.stages],
            "uncoveredPhases": list(self.uncovered_phases),
            "foundation": self.foundation.as_dict(),
            "floors": [item.as_dict() for item in self.floors],
            "rebar": self.rebar.as_dict(),
            "sheet": self.sheet.as_dict(),
            "takeoff": self.takeoff.as_dict(),
            "roof": self.roof.as_dict(),
            "commons": self.commons.as_dict(),
            "meps": [item.as_dict() for item in self.meps],
            "assumptions": [item.as_dict() for item in self.assumptions],
        }


def _merge_assumptions(parts: list[tuple[str, Any]]) -> Tuple[DesignAssumption, ...]:
    """Merge assumptions from several design parts.

    Each part yields Assumption objects (with pointer, value, unit, reason).
    The source label is taken from the part's name.
    Duplicate pointers must have the same value, otherwise the design is inconsistent.
    """
    merged: dict[str, DesignAssumption] = {}
    for source, part in parts:
        for ass in getattr(part, "assumptions", ()) or ():
            da = DesignAssumption(source, ass.pointer, ass.value, ass.unit, ass.reason)
            existing = merged.get(ass.pointer)
            if existing is None:
                merged[ass.pointer] = da
            else:
                # If the same pointer appears with a different value, raise.
                if existing.value != da.value:
                    raise DesignError(
                        f"conflicting assumptions for {ass.pointer}: {existing.value} vs {da.value}"
                    )
    # Preserve deterministic order: sort by pointer for reproducibility.
    return tuple(merged[p] for p in sorted(merged))


def design_project(spec: dict[str, Any], *, storey_indices: tuple[int, ...] = (1,)) -> ProjectDesign:
    """Design every part of the project v0 covers, in the pipeline's order."""
    foundation = design_foundation(spec)
    floors = tuple(
        design_typical_floor(spec, foundation, storey_index=index) for index in storey_indices
    )
    # Build MEP for each typical floor.
    meps = tuple(design_mep(spec, floor, storey_index=floor.storey_index) for floor in floors)
    # Design the roof and boundary.
    roof = design_roof_boundary(spec, foundation, floors)
    # Design common services for each typical floor.
    commons = design_common_services(spec, floors[0], storey_index=floors[0].storey_index)
    rebar = design_rebar(spec, foundation, floors[0])
    sheet = design_sheet(spec, foundation, floors[0])
    takeoff = design_takeoff(spec, foundation, floors[0], rebar)
    # Merge assumptions, tagging each with its source.
    parts_with_sources = [
        ("foundation", foundation),
        *[(f"floor-{f.storey_index}", f) for f in floors],
        *[(f"mep-{m.storey_index}", m) for m in meps],
        ("roof", roof),
        ("common-services", commons),
        ("rebar", rebar),
        ("sheet", sheet),
        ("takeoff", takeoff),
    ]
    assumptions = _merge_assumptions(parts_with_sources)
    project = spec.get("project") or {}
    return ProjectDesign(
        project_id=str(project.get("id") or "unknown"),
        project_name=str(project.get("name") or "Untitled project"),
        foundation=foundation,
        floors=floors,
        rebar=rebar,
        sheet=sheet,
        takeoff=takeoff,
        roof=roof,
        commons=commons,
        meps=meps,
        assumptions=assumptions,
    )
