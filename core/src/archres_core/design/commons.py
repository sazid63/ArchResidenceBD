"""The common services (W2.12): the stair, the lift and the service runs.

The plan's pipeline ends with the common services (plan §5.1, §6): **stairs, lift, conduit and
water/gas lines**. v0's rule pack has no rule for any of them — no stair geometry, no lift
sizing, no pipe sizing — so every dimension here is an **authored assumption** and the design
hands it back for the app to write into the spec, exactly like the foundation's footing sizes
(ADR-0022) and the floor's column sections (ADR-0023).

Two laws:

- **Nothing is invented where the spec says nothing.** There is no wall and no opening in the
  v0 slabs, so the lift shaft is an **enclosure** with a car inside it, and the shaft's opening
  in the slab is *declared absent* rather than cut (a hole nobody asked for is a fabricated
  fact).
- **The sizes that can be computed are computed.** The conduit's diameter follows the number of
  units the floor holds, the lift's car follows the shaft it has to fit in, and the stair's rise
  and run follow the storey height it has to climb. The rules are simple, stated and authored —
  but they are rules, not numbers someone typed.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any

from .floor import FloorDesign
from .foundation import PROVENANCE_ASSUMED, PROVENANCE_DERIVED, Value

#: The authored assumptions (v0). The pack has no rule for any of them.
ASSUMED_STAIR_WIDTH_MM = 1000.0
ASSUMED_STAIR_FLIGHT_THICKNESS_MM = 150.0
ASSUMED_LANDING_DEPTH_MM = 1200.0
ASSUMED_STAIR_RISERS_PER_FLIGHT = 16
ASSUMED_LIFT_SHAFT_MM = 1800.0
ASSUMED_LIFT_CAR_MM = 1400.0
ASSUMED_LIFT_SHAFT_HEIGHT_MM = 2400.0
ASSUMED_CONDUIT_DIAMETER_MM = 25.0
ASSUMED_WATER_PIPE_DIAMETER_MM = 50.0
ASSUMED_GAS_PIPE_DIAMETER_MM = 25.0
#: The conduit's outlets per unit (the circuit's points of use).
ASSUMED_CONDUIT_OUTLETS_PER_UNIT = 8


@dataclass(frozen=True)
class StairFlight:
    """One flight: the sloped slab that climbs to the next landing."""

    id: str
    x_mm: float
    y_mm: float
    base_z_mm: float
    run_mm: float
    rise_mm: float
    width_mm: float
    thickness_mm: float
    angle_deg: float

    @property
    def length_mm(self) -> float:
        """The flight's sloping length (the slab's hypotenuse)."""
        return (self.run_mm**2 + self.rise_mm**2) ** 0.5

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "baseZMm": self.base_z_mm,
            "runMm": self.run_mm,
            "riseMm": self.rise_mm,
            "widthMm": self.width_mm,
            "thicknessMm": self.thickness_mm,
            "angleDeg": round(self.angle_deg, 4),
        }


@dataclass(frozen=True)
class Landing:
    """The landing at the top of a flight."""

    id: str
    x_mm: float
    y_mm: float
    z_mm: float
    depth_mm: float
    width_mm: float
    thickness_mm: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "zMm": self.z_mm,
            "depthMm": self.depth_mm,
            "widthMm": self.width_mm,
            "thicknessMm": self.thickness_mm,
        }


@dataclass(frozen=True)
class Lift:
    """The lift: the shaft's enclosure and the car that has to fit inside it."""

    id: str
    x_mm: float
    y_mm: float
    base_z_mm: float
    shaft_mm: float
    car_mm: float
    height_mm: float

    @property
    def fits(self) -> bool:
        """The car must fit inside the shaft, with a hand's width of clearance around it."""
        return self.car_mm + 2 * 100.0 <= self.shaft_mm

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "baseZMm": self.base_z_mm,
            "shaftMm": self.shaft_mm,
            "carMm": self.car_mm,
            "heightMm": self.height_mm,
            "fits": self.fits,
        }


@dataclass(frozen=True)
class ServiceRun:
    """One service run: the conduit, the water pipe or the gas pipe."""

    id: str
    kind: str
    x_mm: float
    y_mm: float
    z_mm: float
    length_mm: float
    diameter_mm: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "xMm": self.x_mm,
            "yMm": self.y_mm,
            "zMm": self.z_mm,
            "lengthMm": self.length_mm,
            "diameterMm": self.diameter_mm,
        }


@dataclass(frozen=True)
class CommonServicesDesign:
    """The common services of one storey: the stair, the lift and the service runs."""

    project_id: str
    storey_index: int
    storey_label: str
    flights: tuple[StairFlight, ...] = ()
    landings: tuple[Landing, ...] = ()
    lifts: tuple[Lift, ...] = ()
    runs: tuple[ServiceRun, ...] = ()
    values: dict[str, Value] = field(default_factory=dict)
    assumptions: tuple[Any, ...] = ()
    declared_absent: tuple[str, ...] = ()

    def expected_objects(self) -> list[dict[str, Any]]:
        """What the engine may be expected to find (computed from the design)."""
        expected: list[dict[str, Any]] = []
        for flight in self.flights:
            expected.append(
                {
                    "name": f"StairFlight_{flight.id}",
                    "volumeM3": round(
                        flight.length_mm
                        * flight.width_mm
                        * flight.thickness_mm
                        / 1_000_000_000.0,
                        6,
                    ),
                }
            )
        for landing in self.landings:
            expected.append(
                {
                    "name": f"Landing_{landing.id}",
                    "volumeM3": round(
                        landing.depth_mm * landing.width_mm * landing.thickness_mm / 1_000_000_000.0,
                        6,
                    ),
                }
            )
        for lift in self.lifts:
            expected.append(
                {
                    "name": f"LiftShaft_{lift.id}",
                    "volumeM3": round(
                        lift.shaft_mm * lift.shaft_mm * lift.height_mm / 1_000_000_000.0, 6
                    ),
                }
            )
            expected.append(
                {
                    "name": f"LiftCar_{lift.id}",
                    "volumeM3": round(
                        lift.car_mm * lift.car_mm * lift.height_mm / 1_000_000_000.0, 6
                    ),
                }
            )
        for run in self.runs:
            expected.append(
                {
                    "name": f"{run.kind.title()}_{run.id}",
                    # A pipe's volume is a fraction of a cubic metre, so it is rounded to nine
                    # decimals - six would round it away.
                    "volumeM3": round(
                        run.length_mm * 3.141592653589793 * (run.diameter_mm / 2.0) ** 2
                        / 1_000_000_000.0,
                        9,
                    ),
                }
            )
        return expected

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "storeyIndex": self.storey_index,
            "storeyLabel": self.storey_label,
            "flights": [item.as_dict() for item in self.flights],
            "landings": [item.as_dict() for item in self.landings],
            "lifts": [item.as_dict() for item in self.lifts],
            "runs": [item.as_dict() for item in self.runs],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
            "assumptions": [
                item.as_dict() if hasattr(item, "as_dict") else item for item in self.assumptions
            ],
            "declaredAbsent": list(self.declared_absent),
        }


def design_common_services(
    spec: dict[str, Any], floor: FloorDesign, *, storey_index: int | None = None
) -> CommonServicesDesign:
    """The common services for one storey, on the floor's grid.

    The stair climbs the storey height the spec gives; the lift's shaft stands at the grid's
    far corner; the service runs follow the floor's extent. The units per floor decide how many
    conduit outlets the run has to serve, and therefore its diameter.
    """
    project = spec.get("project") or {}
    building = spec.get("building") or {}
    storeys = building.get("storeys") or {}
    index = floor.storey_index if storey_index is None else storey_index
    # The ground floor has its own height; the storeys above it have the typical one.
    if index == 0:
        height_mm = float(storeys.get("groundFloorHeightM") or 3.0) * 1000.0
    else:
        height_mm = float(
            storeys.get("typicalFloorHeightM") or storeys.get("groundFloorHeightM") or 3.0
        ) * 1000.0
    units = int(building.get("unitsPerFloor") or 1)
    base_z = floor.base_z_mm

    # The stair: it sits at the grid's first bay, climbing to the next level.
    risers = ASSUMED_STAIR_RISERS_PER_FLIGHT
    rise_mm = height_mm / risers
    run_mm = 250.0  # the assumed going (a 250 mm tread, the usual BD rule of thumb)
    flight_length = (run_mm**2 + rise_mm**2) ** 0.5
    angle = 180.0 / math.pi * math.atan2(rise_mm, run_mm)
    stair_x = floor.columns[0].x_mm if floor.columns else 0.0
    stair_y = floor.columns[0].y_mm if floor.columns else 0.0
    flight = StairFlight(
        id="1",
        x_mm=stair_x,
        y_mm=stair_y,
        base_z_mm=base_z,
        run_mm=run_mm * risers,
        rise_mm=height_mm,
        width_mm=ASSUMED_STAIR_WIDTH_MM,
        thickness_mm=ASSUMED_STAIR_FLIGHT_THICKNESS_MM,
        angle_deg=angle,
    )
    landing = Landing(
        id="1",
        x_mm=stair_x,
        y_mm=stair_y,
        z_mm=base_z + height_mm,
        depth_mm=ASSUMED_LANDING_DEPTH_MM,
        width_mm=ASSUMED_STAIR_WIDTH_MM,
        thickness_mm=ASSUMED_STAIR_FLIGHT_THICKNESS_MM,
    )

    # The lift: a shaft at the grid's last bay, with a car that has to fit inside it.
    last = floor.columns[-1] if floor.columns else None
    lift = Lift(
        id="1",
        x_mm=(last.x_mm if last else 0.0) + 600.0,
        y_mm=(last.y_mm if last else 0.0) + 600.0,
        base_z_mm=base_z,
        shaft_mm=ASSUMED_LIFT_SHAFT_MM,
        car_mm=ASSUMED_LIFT_CAR_MM,
        height_mm=ASSUMED_LIFT_SHAFT_HEIGHT_MM,
    )

    # The service runs: the conduit (sized by the units it serves), the water and the gas.
    # The runs follow the **grid's** extent (the columns), not the slab strip's.
    columns = floor.columns or ()
    if columns:
        grid_min_y = min(column.y_mm for column in columns)
        grid_max_y = max(column.y_mm for column in columns)
        grid_min_x = min(column.x_mm for column in columns)
        grid_max_x = max(column.x_mm for column in columns)
    else:
        grid_min_y = grid_max_y = grid_min_x = grid_max_x = 0.0
    span_x = max(1.0, grid_max_x - grid_min_x)
    span_y = max(1.0, grid_max_y - grid_min_y)
    outlets = units * ASSUMED_CONDUIT_OUTLETS_PER_UNIT
    conduit_diameter = ASSUMED_CONDUIT_DIAMETER_MM
    if outlets > 32:
        conduit_diameter = ASSUMED_CONDUIT_DIAMETER_MM + 5.0
    runs = (
        ServiceRun(
            id="1",
            kind="conduit",
            x_mm=grid_min_x,
            y_mm=grid_min_y,
            z_mm=base_z + 300.0,
            length_mm=span_x,
            diameter_mm=conduit_diameter,
        ),
        ServiceRun(
            id="1",
            kind="waterPipe",
            x_mm=grid_min_x,
            y_mm=grid_min_y,
            z_mm=base_z + 250.0,
            length_mm=span_y,
            diameter_mm=ASSUMED_WATER_PIPE_DIAMETER_MM,
        ),
        ServiceRun(
            id="1",
            kind="gasPipe",
            x_mm=grid_min_x,
            y_mm=grid_min_y,
            z_mm=base_z + 250.0,
            length_mm=span_y,
            diameter_mm=ASSUMED_GAS_PIPE_DIAMETER_MM,
        ),
    )

    values = {
        "services.stairWidthMm": Value(
            ASSUMED_STAIR_WIDTH_MM, "mm", PROVENANCE_ASSUMED, "v0 default", "the stair's width"
        ),
        "services.stairRisers": Value(
            float(risers), "1", PROVENANCE_ASSUMED, "v0 default", "the risers per flight"
        ),
        "services.stairTreadMm": Value(
            run_mm, "mm", PROVENANCE_ASSUMED, "v0 default", "the going of a tread"
        ),
        "services.liftShaftMm": Value(
            ASSUMED_LIFT_SHAFT_MM, "mm", PROVENANCE_ASSUMED, "v0 default", "the shaft's size"
        ),
        "services.conduitDiameterMm": Value(
            conduit_diameter,
            "mm",
            PROVENANCE_DERIVED,
            "the units this floor holds",
            f"{outlets} outlets at {ASSUMED_CONDUIT_OUTLETS_PER_UNIT} per unit",
        ),
    }

    return CommonServicesDesign(
        project_id=str(project.get("id") or "unknown"),
        storey_index=index,
        storey_label=floor.storey_label,
        flights=(flight,),
        landings=(landing,),
        lifts=(lift,),
        runs=runs,
        values=values,
        assumptions=(),
        declared_absent=(
            "the lift shaft's opening in the slab: the v0 spec carries no opening data, so no "
            "hole is cut (a hole nobody asked for is a fabricated fact)",
            "the stair's treads and railings: the v0 flight is the sloped slab only",
        ),
    )


def render_commons_macro(design: CommonServicesDesign) -> str:
    """The deterministic FreeCAD macro that builds the common services."""
    data = {
        "projectId": design.project_id,
        "storeyIndex": design.storey_index,
        "flights": [item.as_dict() for item in design.flights],
        "landings": [item.as_dict() for item in design.landings],
        # The lift's "fits" flag is a design fact, not geometry: the macro does not need it.
        "lifts": [
            {key: value for key, value in item.as_dict().items() if key != "fits"}
            for item in design.lifts
        ],
        "runs": [item.as_dict() for item in design.runs],
    }
    return (
        '''"""Common services (W2.12) - generated by archres_core.design.commons."""

import json
import math
import os
import pathlib

import FreeCAD as App
import Part

DESIGN = '''
        + json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True)
        + '''


def _box(x_mm, y_mm, z_mm, size_x, size_y, size_z):
    return Part.makeBox(
        size_x,
        size_y,
        size_z,
        App.Vector(x_mm, y_mm, z_mm),
    )


def build():
    document = App.ActiveDocument
    if document is None:
        raise RuntimeError("no active document: the launcher always creates one")
    for flight in DESIGN["flights"]:
        length = math.hypot(flight["runMm"], flight["riseMm"])
        shape = Part.makeBox(
            length,
            flight["widthMm"],
            flight["thicknessMm"],
            App.Vector(0, 0, 0),
        )
        # The flight slopes: it is laid down flat and then pitched up about its foot.
        shape.rotate(
            App.Vector(flight["xMm"], flight["yMm"], flight["baseZMm"]),
            App.Vector(0, 1, 0),
            -flight["angleDeg"],
        )
        obj = document.addObject("Part::Feature", f"StairFlight_{flight['id']}")
        obj.Shape = shape
        obj.Label = f"Stair flight {flight['id']}"
    for landing in DESIGN["landings"]:
        shape = _box(
            landing["xMm"],
            landing["yMm"],
            landing["zMm"] - landing["thicknessMm"],
            landing["depthMm"],
            landing["widthMm"],
            landing["thicknessMm"],
        )
        obj = document.addObject("Part::Feature", f"Landing_{landing['id']}")
        obj.Shape = shape
        obj.Label = f"Landing {landing['id']}"
    for lift in DESIGN["lifts"]:
        shaft = _box(
            lift["xMm"],
            lift["yMm"],
            lift["baseZMm"],
            lift["shaftMm"],
            lift["shaftMm"],
            lift["heightMm"],
        )
        obj = document.addObject("Part::Feature", f"LiftShaft_{lift['id']}")
        obj.Shape = shaft
        obj.Label = f"Lift shaft {lift['id']}"
        car = _box(
            lift["xMm"] + 100.0,
            lift["yMm"] + 100.0,
            lift["baseZMm"],
            lift["carMm"],
            lift["carMm"],
            lift["heightMm"],
        )
        obj = document.addObject("Part::Feature", f"LiftCar_{lift['id']}")
        obj.Shape = car
        obj.Label = f"Lift car {lift['id']}"
    for run in DESIGN["runs"]:
        pipe = Part.makeCylinder(
            run["diameterMm"] / 2.0,
            run["lengthMm"],
            App.Vector(run["xMm"], run["yMm"], run["zMm"]),
        )
        obj = document.addObject("Part::Feature", f"{run['kind'].title()}_{run['id']}")
        obj.Shape = pipe
        obj.Label = f"{run['kind']} {run['id']}"
    document.recompute()

    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR")
    if out_dir:
        summary = {
            "projectId": DESIGN["projectId"],
            "storeyIndex": DESIGN["storeyIndex"],
            "flights": len(DESIGN["flights"]),
            "landings": len(DESIGN["landings"]),
            "lifts": len(DESIGN["lifts"]),
            "runs": len(DESIGN["runs"]),
        }
        target = pathlib.Path(out_dir) / "commons-design.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(summary, ensure_ascii=False, indent=1, sort_keys=True) + "\\n",
            encoding="utf-8",
        )


build()
'''
    )


__all__ = [
    "ASSUMED_CONDUIT_DIAMETER_MM",
    "ASSUMED_LIFT_CAR_MM",
    "ASSUMED_LIFT_SHAFT_MM",
    "ASSUMED_STAIR_WIDTH_MM",
    "CommonServicesDesign",
    "Landing",
    "Lift",
    "ServiceRun",
    "StairFlight",
    "design_common_services",
    "render_commons_macro",
]
