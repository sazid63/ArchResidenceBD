"""Project design (W2.10): the chain from one Building Spec to one building.

The plan's pipeline (§6) is *site/foundation → structure → per-floor + MEP → roof/boundary →
drawings → BBS → takeoff/BOQ*. Every engine in that chain exists as its own package (W2.2
foundation, W2.3 floor, W2.4 rebar, W2.5 sheet, W2.6 BOQ); this module is the **assembly** —
it says which design belongs to which phase, in which order they are built, and which parts of
the plan v0 does not cover (so the gap is visible instead of implied).

The walking skeleton (W2.10) is the phase's proof: one small house, from the spec to a
measured foundation, a floor with its steel, a sheet a human can read and a priced BOQ.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .boq import Takeoff, design_takeoff
from .drawing import DrawingDesign, design_sheet
from .floor import FloorDesign, design_typical_floor
from .foundation import FoundationDesign, design_foundation
from .rebar import RebarDesign, design_rebar

#: The plan's pipeline order (plan §6). v0 covers the first four stages; the rest is declared.
PIPELINE = (
    ("site-excavation", "excavation"),
    ("foundation", "foundation"),
    ("floor", "floor"),
    ("roof-boundary", "not covered in v0"),
    ("common-services", "not covered in v0"),
    ("drawings", "sheet"),
    ("bbs", "rebar schedule"),
    ("takeoff", "boq"),
)

#: The phases v0 does not build. Declared, not implied.
UNCOVERED_PHASES = ("roof-boundary", "common-services")


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
        }


def design_project(spec: dict[str, Any], *, storey_indices: tuple[int, ...] = (1,)) -> ProjectDesign:
    """Design every part of the project v0 covers, in the pipeline's order."""
    foundation = design_foundation(spec)
    floors = tuple(
        design_typical_floor(spec, foundation, storey_index=index) for index in storey_indices
    )
    rebar = design_rebar(spec, foundation, floors[0])
    sheet = design_sheet(spec, foundation, floors[0])
    takeoff = design_takeoff(spec, foundation, floors[0], rebar)
    project = spec.get("project") or {}
    return ProjectDesign(
        project_id=str(project.get("id") or "unknown"),
        project_name=str(project.get("name") or "Untitled project"),
        foundation=foundation,
        floors=floors,
        rebar=rebar,
        sheet=sheet,
        takeoff=takeoff,
    )
