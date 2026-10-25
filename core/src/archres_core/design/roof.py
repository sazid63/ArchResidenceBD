"""Roof and boundary design v0 (W2.13): roof slab and site boundary walls.

The plan's pipeline includes **roof/boundary** after the per-floor stages.
v0 implements a simple roof slab and boundary walls, following the same
authoring laws as the foundation and floor:

- Every dimension is either read from the spec, computed, or an authored
  assumption handed back for the app to record.
- The roof slab covers the building's footprint plus eaves.
- Boundary walls follow the plot outline with an assumed height.

The pack has no rule for roof slab thickness or boundary wall height in v0,
so those are authored assumptions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .foundation import (
    Assumption,
    Value,
    PROVENANCE_SPEC,
    PROVENANCE_ASSUMED,
    PROVENANCE_DERIVED,
    _phase_data,
)


#: Authored defaults (v0).
ASSUMED_ROOF_THICKNESS_MM = 125.0
ASSUMED_ROOF_OVERHANG_MM = 600.0
ASSUMED_BOUNDARY_WALL_HEIGHT_MM = 2200.0
ASSUMED_BOUNDARY_WALL_THICKNESS_MM = 100.0


@dataclass(frozen=True)
class RoofSlab:
    """The roof slab covering the building footprint plus eaves."""

    x_mm: float
    y_mm: float
    size_x_mm: float
    size_y_mm: float
    thickness_mm: float
    z_mm: float

    @property
    def volume_m3(self) -> float:
        return (self.size_x_mm * self.size_y_mm * self.thickness_mm) / 1_000_000_000.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "sizeXMm": self.size_x_mm,
            "sizeYMm": self.size_y_mm,
            "thicknessMm": self.thickness_mm,
            "zMm": self.z_mm,
            "volumeM3": round(self.volume_m3, 6),
        }


@dataclass(frozen=True)
class BoundaryWall:
    """One side of the site boundary wall."""

    id: str
    x_mm: float
    y_mm: float
    length_mm: float
    height_mm: float
    thickness_mm: float

    @property
    def volume_m3(self) -> float:
        return (self.length_mm * self.height_mm * self.thickness_mm) / 1_000_000_000.0

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "lengthMm": self.length_mm,
            "heightMm": self.height_mm,
            "thicknessMm": self.thickness_mm,
            "volumeM3": round(self.volume_m3, 6),
        }


@dataclass(frozen=True)
class RoofDesign:
    """The roof and boundary for one project."""

    project_id: str
    roof_slab: RoofSlab
    boundary_walls: tuple[BoundaryWall, ...]
    values: dict[str, Value] = field(default_factory=dict)
    assumptions: tuple[Assumption, ...] = ()

    @property
    def roof_volume_m3(self) -> float:
        return self.roof_slab.volume_m3

    @property
    def boundary_volume_m3(self) -> float:
        return sum(wall.volume_m3 for wall in self.boundary_walls)

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "roofSlab": self.roof_slab.as_dict(),
            "boundaryWalls": [wall.as_dict() for wall in self.boundary_walls],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
            "assumptions": [item.as_dict() for item in self.assumptions],
            "totals": {
                "roofVolumeM3": round(self.roof_volume_m3, 6),
                "boundaryVolumeM3": round(self.boundary_volume_m3, 6),
            },
        }


def design_roof_boundary(spec: dict[str, Any], foundation: Any, floors: tuple) -> RoofDesign:
    """Design the roof slab and boundary walls.

    The roof slab sits on top of the highest floor and overhangs the footprint.
    Boundary walls follow the plot outline at an assumed height.
    """
    from .floor import FloorDesign

    project = spec.get("project") or {}
    project_id = str(project.get("id") or "unknown")

    # Plot dimensions
    plot = spec.get("site", {}).get("plot") or {}
    frontage_m = float(plot.get("frontageM") or 10.0)
    depth_m = float(plot.get("depthM") or (float(plot.get("areaSqm") or 133.78) / frontage_m))

    # Roof slab: covers the building footprint plus eaves
    roof_thickness, thickness_value, thickness_assumption = _roof_thickness(spec)
    roof_overhang, overhang_value, overhang_assumption = _roof_overhang(spec)

    roof_size_x = frontage_m * 1000.0 + 2 * roof_overhang
    roof_size_y = depth_m * 1000.0 + 2 * roof_overhang
    roof_x = -roof_overhang
    roof_y = -roof_overhang

    # Highest floor level (top of the last typical floor's slab)
    if floors:
        last_floor: FloorDesign = floors[-1]
        roof_z = last_floor.base_z_mm + last_floor.slab.thickness_mm
    else:
        roof_z = 3000.0  # fallback

    roof_slab = RoofSlab(
        x_mm=round(roof_x, 3),
        y_mm=round(roof_y, 3),
        size_x_mm=round(roof_size_x, 3),
        size_y_mm=round(roof_size_y, 3),
        thickness_mm=roof_thickness,
        z_mm=round(roof_z, 3),
    )

    # Boundary walls: four sides around the plot
    wall_height, height_value, height_assumption = _boundary_wall_height(spec)
    wall_thickness, thickness_w_value, thickness_w_assumption = _boundary_wall_thickness(spec)

    walls = (
        BoundaryWall("front", 0, 0, round(frontage_m * 1000.0, 3), wall_height, wall_thickness),
        BoundaryWall("rear", 0, round(depth_m * 1000.0, 3), round(frontage_m * 1000.0, 3), wall_height, wall_thickness),
        BoundaryWall("left", 0, 0, round(depth_m * 1000.0, 3), wall_height, wall_thickness),
        BoundaryWall("right", round(frontage_m * 1000.0, 3), 0, round(depth_m * 1000.0, 3), wall_height, wall_thickness),
    )

    # Values
    values: dict[str, Value] = {
        "roof.thicknessMm": thickness_value,
        "roof.overhangMm": overhang_value,
        "roof.sizeXMm": Value(roof_size_x, "mm", PROVENANCE_DERIVED, "/phases/roof-boundary/data/roofSizeXMm", "frontage + 2*eaves"),
        "roof.sizeYMm": Value(roof_size_y, "mm", PROVENANCE_DERIVED, "/phases/roof-boundary/data/roofSizeYMm", "plot depth + 2*eaves"),
        "boundary.wallHeightMm": height_value,
        "boundary.wallThicknessMm": thickness_w_value,
    }

    # Assumptions
    assumptions: list[Assumption] = []
    if thickness_assumption:
        assumptions.append(thickness_assumption)
    if overhang_assumption:
        assumptions.append(overhang_assumption)
    if height_assumption:
        assumptions.append(height_assumption)
    if thickness_w_assumption:
        assumptions.append(thickness_w_assumption)

    return RoofDesign(
        project_id=project_id,
        roof_slab=roof_slab,
        boundary_walls=walls,
        values=values,
        assumptions=tuple(assumptions),
    )


def _roof_thickness(spec: dict[str, Any]) -> tuple[float, Value, Assumption | None]:
    """Read roof slab thickness from spec, or assume 125 mm."""
    data = _phase_data(spec, "roof-boundary")
    raw = data.get("roofThicknessMm")
    if isinstance(raw, (int, float)) and raw > 0:
        return (
            float(raw),
            Value(float(raw), "mm", PROVENANCE_SPEC, "/phases/roof-boundary/data/roofThicknessMm"),
            None,
        )
    return (
        ASSUMED_ROOF_THICKNESS_MM,
        Value(ASSUMED_ROOF_THICKNESS_MM, "mm", PROVENANCE_ASSUMED, "v0 default", "the v0 pack has no roof-thickness rule"),
        Assumption("/phases/roof-boundary/data/roofThicknessMm", ASSUMED_ROOF_THICKNESS_MM, "mm", "the v0 pack has no roof-thickness rule; v0 assumes 125 mm"),
    )


def _roof_overhang(spec: dict[str, Any]) -> tuple[float, Value, Assumption | None]:
    """Read roof overhang from spec, or assume 600 mm."""
    data = _phase_data(spec, "roof-boundary")
    raw = data.get("roofOverhangMm")
    if isinstance(raw, (int, float)) and raw > 0:
        return (
            float(raw),
            Value(float(raw), "mm", PROVENANCE_SPEC, "/phases/roof-boundary/data/roofOverhangMm"),
            None,
        )
    return (
        ASSUMED_ROOF_OVERHANG_MM,
        Value(ASSUMED_ROOF_OVERHANG_MM, "mm", PROVENANCE_ASSUMED, "v0 default", "the v0 pack has no eaves rule"),
        Assumption("/phases/roof-boundary/data/roofOverhangMm", ASSUMED_ROOF_OVERHANG_MM, "mm", "the v0 pack has no eaves rule; v0 assumes 600 mm overhang"),
    )


def _boundary_wall_height(spec: dict[str, Any]) -> tuple[float, Value, Assumption | None]:
    """Read boundary wall height from spec, or assume 2200 mm."""
    data = _phase_data(spec, "roof-boundary")
    raw = data.get("boundaryWallHeightMm")
    if isinstance(raw, (int, float)) and raw > 0:
        return (
            float(raw),
            Value(float(raw), "mm", PROVENANCE_SPEC, "/phases/roof-boundary/data/boundaryWallHeightMm"),
            None,
        )
    return (
        ASSUMED_BOUNDARY_WALL_HEIGHT_MM,
        Value(ASSUMED_BOUNDARY_WALL_HEIGHT_MM, "mm", PROVENANCE_ASSUMED, "v0 default", "the v0 pack has no boundary wall height rule"),
        Assumption("/phases/roof-boundary/data/boundaryWallHeightMm", ASSUMED_BOUNDARY_WALL_HEIGHT_MM, "mm", "the v0 pack has no boundary wall height rule; v0 assumes 2200 mm"),
    )


def _boundary_wall_thickness(spec: dict[str, Any]) -> tuple[float, Value, Assumption | None]:
    """Read boundary wall thickness from spec, or assume 100 mm."""
    data = _phase_data(spec, "roof-boundary")
    raw = data.get("boundaryWallThicknessMm")
    if isinstance(raw, (int, float)) and raw > 0:
        return (
            float(raw),
            Value(float(raw), "mm", PROVENANCE_SPEC, "/phases/roof-boundary/data/boundaryWallThicknessMm"),
            None,
        )
    return (
        ASSUMED_BOUNDARY_WALL_THICKNESS_MM,
        Value(ASSUMED_BOUNDARY_WALL_THICKNESS_MM, "mm", PROVENANCE_ASSUMED, "v0 default", "the v0 pack has no boundary wall thickness rule"),
        Assumption("/phases/roof-boundary/data/boundaryWallThicknessMm", ASSUMED_BOUNDARY_WALL_THICKNESS_MM, "mm", "the v0 pack has no boundary wall thickness rule; v0 assumes 100 mm"),
    )
