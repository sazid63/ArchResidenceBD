"""The MEP engines (W3.1): electrical, water, drainage, gas, lift - and their schedules.

The plan's §5.7: *"v1: point layouts + schedules + deterministic sizing (electrical load/circuits,
water fixture units, drainage slopes, Titas gas, lift check) + coordination/clash checks. Full 3D
routing = v2. All deterministic."*

W2.12 built the **runs** — the conduit, the water pipe and the gas pipe — and the lift's fit
check. What was missing is everything that sits on top of the runs: the **point layouts** (where
the outlets, the fixtures and the cooker are), the **sizing** (the circuits and their loads, the
pipe sizes, the drainage's falls) and the **schedules** that carry all of it.

Three laws shape this module:

- **Nothing is invented where the spec says nothing.** The v0 spec carries no room programme, no
  wiring layout and no supply data, so the point layouts are computed from the floor's area and
  every number is an **authored assumption**, handed back for the app to write into the spec —
  the same contract the foundation's footing sizes (ADR-0022), the floor's column sections
  (ADR-0023) and the common services' dimensions (ADR-0034) keep.
- **The sizes that can be computed are computed.** A circuit's load is the sum of its points'
  loads; a pipe's size follows the fixture units it serves; a drain's fall follows the standard
  it is laid to. The rules are simple, stated and authored — but they are *rules*, not numbers
  someone typed.
- **Full 3D routing is v2.** The plan says so; v0 has the point layouts and the runs, and the
  routing between them is **declared absent** rather than faked.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .floor import FloorDesign
from .foundation import (
    PROVENANCE_ASSUMED,
    PROVENANCE_DERIVED,
    Assumption,
    Value,
    spec_value,
)

if TYPE_CHECKING:  # the lift's type is only needed for the annotation
    from .commons import Lift

# --- the authored assumptions (v0) -------------------------------------------------
# The v0 rule pack has no MEP rule at all (plan §5.7), so every number below is authored and
# handed back. The reasons say what the number is for, so the app can put it in the spec with
# the reason attached.

#: A lighting point per this many square metres of floor.
ASSUMED_LIGHTING_POINTS_PER_100M2 = 3.0
#: A power outlet per this many square metres of floor.
ASSUMED_POWER_OUTLETS_PER_100M2 = 4.0
#: A ceiling fan per this many square metres of floor.
ASSUMED_FANS_PER_100M2 = 1.0
#: The connected load of one lighting point (an LED fitting).
ASSUMED_LIGHTING_LOAD_W = 40.0
#: The connected load of one power outlet.
ASSUMED_OUTLET_LOAD_W = 100.0
#: The connected load of one ceiling fan.
ASSUMED_FAN_LOAD_W = 60.0
#: The largest load one circuit may carry (13 A at 230 V).
ASSUMED_MAX_CIRCUIT_LOAD_W = 3000.0
#: The cable that carries a circuit's load.
ASSUMED_CIRCUIT_CABLE_SQMM = 2.5
#: The breaker's rating.
ASSUMED_CIRCUIT_BREAKER_A = 20.0
#: The supply voltage.
ASSUMED_SUPPLY_VOLTAGE_V = 230.0
#: The points are kept this far from the floor's edge.
ASSUMED_POINT_INSET_MM = 600.0

#: The water fixture units, per fixture (the standard fixture-unit values).
ASSUMED_WFU_BASIN = 1.0
ASSUMED_WFU_WC = 2.0
ASSUMED_WFU_SHOWER = 2.0
ASSUMED_WFU_KITCHEN_SINK = 2.0
#: The pipe that carries the supply, by the fixture units it serves (mm -> fixture units).
ASSUMED_SUPPLY_PIPE_BY_WFU: tuple[tuple[float, float], ...] = (
    (4.0, 15.0),
    (10.0, 20.0),
    (20.0, 25.0),
    (30.0, 32.0),
)
#: The supply pipe for more fixture units than the table covers.
ASSUMED_SUPPLY_PIPE_LARGE_MM = 40.0

#: The horizontal drainage's fall (1:60 - a 2 % gradient).
ASSUMED_DRAINAGE_FALL = "1:60"
#: The soil stack's diameter.
ASSUMED_STACK_DIAMETER_MM = 100.0
#: The branch drain's diameter.
ASSUMED_BRANCH_DIAMETER_MM = 50.0

#: The gas load of one domestic cooker (cubic metres per hour).
ASSUMED_COOKER_LOAD_M3_PER_H = 0.5
#: The gas pipe's diameter.
ASSUMED_GAS_PIPE_DIAMETER_MM = 15.0
#: The meter's position: this far from the grid's origin.
ASSUMED_METER_OFFSET_MM = 300.0

#: The lift's motor power (a five-person lift).
ASSUMED_LIFT_POWER_KW = 5.0
#: The lift's rated load (five people).
ASSUMED_LIFT_PERSONS = 5


def _phase_data(spec: dict[str, Any], phase_id: str) -> dict[str, Any]:
    """The data of one phase of the spec (an empty dict when the phase is not there)."""
    for phase in spec.get("phases") or []:
        if phase.get("id") == phase_id:
            return phase.get("data") or {}
    return {}


#: The MEP's authored values: the key the spec carries the value under (in the services
#: phase's data), the authored default, the unit, and the reason. One table is the single
#: source of truth - the design reads the defaults from here, the spec's values win when it
#: carries them, and the assumption handed back names the key that was read.
_AUTHORED: tuple[tuple[str, float, str, str], ...] = (
    (
        "lightingPointsPer100m2",
        ASSUMED_LIGHTING_POINTS_PER_100M2,
        "points/100m²",
        "the lighting layout is computed from the floor's area, not from a room plan",
    ),
    (
        "powerOutletsPer100m2",
        ASSUMED_POWER_OUTLETS_PER_100M2,
        "points/100m²",
        "the outlet layout is computed from the floor's area, not from a room plan",
    ),
    (
        "fansPer100m2",
        ASSUMED_FANS_PER_100M2,
        "points/100m²",
        "the fan layout is computed from the floor's area, not from a room plan",
    ),
    (
        "lightingLoadW",
        ASSUMED_LIGHTING_LOAD_W,
        "W",
        "the connected load of one lighting point",
    ),
    (
        "outletLoadW",
        ASSUMED_OUTLET_LOAD_W,
        "W",
        "the connected load of one power outlet",
    ),
    (
        "fanLoadW",
        ASSUMED_FAN_LOAD_W,
        "W",
        "the connected load of one ceiling fan",
    ),
    (
        "maxCircuitLoadW",
        ASSUMED_MAX_CIRCUIT_LOAD_W,
        "W",
        "the load one circuit may carry; the points are packed up to it",
    ),
    (
        "circuitCableSqMm",
        ASSUMED_CIRCUIT_CABLE_SQMM,
        "mm²",
        "the cable that carries a circuit's load",
    ),
    (
        "circuitBreakerA",
        ASSUMED_CIRCUIT_BREAKER_A,
        "A",
        "the breaker's rating",
    ),
    (
        "supplyVoltageV",
        ASSUMED_SUPPLY_VOLTAGE_V,
        "V",
        "the supply voltage",
    ),
    (
        "fixtureUnitsBasin",
        ASSUMED_WFU_BASIN,
        "FU",
        "the wash basin's fixture units",
    ),
    (
        "fixtureUnitsWc",
        ASSUMED_WFU_WC,
        "FU",
        "the WC's fixture units",
    ),
    (
        "fixtureUnitsShower",
        ASSUMED_WFU_SHOWER,
        "FU",
        "the shower's fixture units",
    ),
    (
        "fixtureUnitsKitchenSink",
        ASSUMED_WFU_KITCHEN_SINK,
        "FU",
        "the kitchen sink's fixture units",
    ),
    (
        "drainageFallDenominator",
        60.0,
        "1/N",
        "the fall the horizontal branches are laid to (1:N); it is what carries the water",
    ),
    (
        "drainageStackDiameterMm",
        ASSUMED_STACK_DIAMETER_MM,
        "mm",
        "the soil stack's size; the v0 spec carries no drainage layout",
    ),
    (
        "drainageBranchDiameterMm",
        ASSUMED_BRANCH_DIAMETER_MM,
        "mm",
        "the branch drain's size",
    ),
    (
        "gasCookerLoadM3PerH",
        ASSUMED_COOKER_LOAD_M3_PER_H,
        "m³/h",
        "the load of one domestic cooker (Titas)",
    ),
    (
        "gasPipeDiameterMm",
        ASSUMED_GAS_PIPE_DIAMETER_MM,
        "mm",
        "the gas run's size; the v0 spec carries no gas layout",
    ),
    (
        "gasMeterOffsetMm",
        ASSUMED_METER_OFFSET_MM,
        "mm",
        "the meter's offset from the grid's corner",
    ),
    (
        "liftPowerKw",
        ASSUMED_LIFT_POWER_KW,
        "kW",
        "the lift's motor power; the fit check itself is W2.12's",
    ),
    (
        "liftPersons",
        float(ASSUMED_LIFT_PERSONS),
        "1",
        "the lift's rated load, in people",
    ),
    (
        "pointInsetMm",
        ASSUMED_POINT_INSET_MM,
        "mm",
        "the points keep clear of the floor's edge",
    ),
)

#: The authored values that only exist when the building has a lift.
_LIFT_KEYS = ("liftPowerKw", "liftPersons")


def _authored_values(
    spec: dict[str, Any], phase_id: str
) -> tuple[dict[str, float], dict[str, Value], list[Assumption]]:
    """The MEP's authored values: the spec's when it carries them, the defaults otherwise.

    The key is the services phase's data under an ``mep.`` prefix - so the app writes where
    the design looks - and the assumption handed back names exactly that key.
    """
    data = _phase_data(spec, phase_id)
    resolved: dict[str, float] = {}
    records: dict[str, Value] = {}
    assumptions: list[Assumption] = []
    for key, default, unit, reason in _AUTHORED:
        value, record, assumption = spec_value(
            data, phase_id, f"mep.{key}", default, unit, reason
        )
        resolved[key] = value
        records[f"mep.{key}"] = record
        if assumption is not None:
            assumptions.append(assumption)
    return resolved, records, assumptions


@dataclass(frozen=True)
class MepPoint:
    """One point of use: a light, an outlet, a fan, a fixture, a cooker, a meter."""

    id: str
    system: str
    kind: str
    storey_index: int
    x_mm: float
    y_mm: float
    z_mm: float
    load_w: float = 0.0
    fixture_units: float = 0.0
    load_m3_per_h: float = 0.0
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "system": self.system,
            "kind": self.kind,
            "storeyIndex": self.storey_index,
            "xMm": round(self.x_mm, 3),
            "yMm": round(self.y_mm, 3),
            "zMm": round(self.z_mm, 3),
            "loadW": round(self.load_w, 3),
            "fixtureUnits": round(self.fixture_units, 3),
            "loadM3PerH": round(self.load_m3_per_h, 3),
            "note": self.note,
        }


@dataclass(frozen=True)
class Circuit:
    """One electrical circuit: the points it serves and the load it carries."""

    id: str
    storey_index: int
    kind: str
    point_ids: tuple[str, ...]
    load_w: float
    cable_sqmm: float
    breaker_a: float
    voltage_v: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "storeyIndex": self.storey_index,
            "kind": self.kind,
            "pointIds": list(self.point_ids),
            "loadW": round(self.load_w, 3),
            "cableSqMm": round(self.cable_sqmm, 3),
            "breakerA": round(self.breaker_a, 3),
            "voltageV": round(self.voltage_v, 3),
        }


@dataclass(frozen=True)
class ScheduleRow:
    """One row of one schedule (the thing an engineer reads and signs)."""

    system: str
    id: str
    description: str
    quantity: float
    unit: str
    size: str = ""
    load: str = ""
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "system": self.system,
            "id": self.id,
            "description": self.description,
            "quantity": round(self.quantity, 3),
            "unit": self.unit,
            "size": self.size,
            "load": self.load,
            "note": self.note,
        }


@dataclass(frozen=True)
class MepDesign:
    """The MEP of one storey: the points, the circuits, the runs and the schedules."""

    project_id: str
    storey_index: int
    storey_label: str
    points: tuple[MepPoint, ...] = ()
    circuits: tuple[Circuit, ...] = ()
    schedules: tuple[ScheduleRow, ...] = ()
    values: dict[str, Value] = field(default_factory=dict)
    assumptions: tuple[Assumption, ...] = ()
    declared_absent: tuple[str, ...] = ()

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "storeyIndex": self.storey_index,
            "storeyLabel": self.storey_label,
            "points": [point.as_dict() for point in self.points],
            "circuits": [circuit.as_dict() for circuit in self.circuits],
            "schedules": [row.as_dict() for row in self.schedules],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
            "assumptions": [item.as_dict() for item in self.assumptions],
            "declaredAbsent": list(self.declared_absent),
        }

    def total_load_w(self) -> float:
        """The connected load of every point on this storey."""
        return round(sum(point.load_w for point in self.points), 3)

    def total_fixture_units(self) -> float:
        """The water fixture units this storey holds."""
        return round(sum(point.fixture_units for point in self.points), 3)

    def total_gas_load_m3_per_h(self) -> float:
        """The gas load this storey holds."""
        return round(sum(point.load_m3_per_h for point in self.points), 3)


def _grid_positions(
    count: int, x0: float, y0: float, x1: float, y1: float, inset: float
) -> list[tuple[float, float]]:
    """`count` points on an even grid inside the floor's extent (deterministic)."""
    if count <= 0:
        return []
    left = x0 + inset
    right = x1 - inset
    bottom = y0 + inset
    top = y1 - inset
    if right <= left:
        left = right = x0
    if top <= bottom:
        bottom = top = y0
    columns = math.ceil(math.sqrt(count))
    rows = math.ceil(count / columns)
    positions: list[tuple[float, float]] = []
    for row in range(rows):
        for column in range(columns):
            if len(positions) >= count:
                break
            x = left if columns == 1 else left + (right - left) * column / (columns - 1)
            y = bottom if rows == 1 else bottom + (top - bottom) * row / (rows - 1)
            positions.append((round(x, 3), round(y, 3)))
    return positions


def _supply_pipe_diameter_mm(fixture_units: float) -> float:
    """The supply pipe's diameter, by the fixture units it serves."""
    for limit, diameter in ASSUMED_SUPPLY_PIPE_BY_WFU:
        if fixture_units <= limit:
            return diameter
    return ASSUMED_SUPPLY_PIPE_LARGE_MM


def design_mep(
    spec: dict[str, Any],
    floor: FloorDesign,
    *,
    storey_index: int | None = None,
    lift: "Lift | None" = None,
) -> MepDesign:
    """The MEP of one storey: the point layouts, the sizing and the schedules.

    The electrical layout is a grid of points sized by the floor's area; the circuits are the
    points packed into loads the cable can carry; the water layout is the fixture set of the
    units this floor holds, sized by its fixture units; the drainage is the stack and the
    branches that serve it; the gas is the cooker of every unit and the run that carries it.
    """
    project = spec.get("project") or {}
    building = spec.get("building") or {}
    index = floor.storey_index if storey_index is None else storey_index
    units = int(building.get("unitsPerFloor") or 1)

    # The MEP's authored values: the spec's when it carries them, the table's defaults
    # otherwise - and the assumption names the key the design read.
    authored, authored_records, authored_assumptions = _authored_values(spec, "common-services")

    slab = floor.slab
    slab_area_m2 = (slab.size_x_mm * slab.size_y_mm) / 1_000_000.0
    # The spec says what the ground floor is used for. A parking ground floor holds no
    # residential unit, so it carries no fixture and no cooker - and the spec, not the design,
    # decides that.
    usage = str(building.get("groundFloorUsage") or "").strip().lower()
    residential = not (index == 0 and usage == "parking")
    units_here = units if residential else 0
    # The floor area the layout is sized by: the spec's unit area, or the slab's own extent
    # where the spec gives no unit area.
    unit_area = float(building.get("typicalUnitAreaSqm") or 0.0)
    area_m2 = unit_area * units_here if unit_area > 0.0 and units_here else slab_area_m2
    x0, y0 = slab.origin_x_mm, slab.origin_y_mm
    x1, y1 = slab.origin_x_mm + slab.size_x_mm, slab.origin_y_mm + slab.size_y_mm
    z = floor.base_z_mm
    # The points keep clear of the floor's edge - but the v0 structure is a single line of
    # footings along the frontage, so the floor can be narrower than the inset, and a point
    # off the floor is a point on no floor at all.
    inset = min(
        authored["pointInsetMm"], (x1 - x0) / 2.0, (y1 - y0) / 2.0
    )

    # --- the electrical layout: the points, sized by the floor's area ----------------
    lighting_count = max(1, round(area_m2 * authored["lightingPointsPer100m2"] / 100.0))
    outlet_count = max(1, round(area_m2 * authored["powerOutletsPer100m2"] / 100.0))
    fan_count = max(1, round(area_m2 * authored["fansPer100m2"] / 100.0))
    # The fall is a ratio (1:N), so the label is built from the value the spec carried.
    fall_label = f"1:{int(authored['drainageFallDenominator'])}"
    points: list[MepPoint] = []
    for kind, count, load, height, note in (
        ("light", lighting_count, authored["lightingLoadW"], 2700.0, "a ceiling lighting point"),
        ("outlet", outlet_count, authored["outletLoadW"], 300.0, "a power outlet"),
        ("fan", fan_count, authored["fanLoadW"], 2400.0, "a ceiling fan"),
    ):
        for number, (x_mm, y_mm) in enumerate(
            _grid_positions(count, x0, y0, x1, y1, inset), start=1
        ):
            points.append(
                MepPoint(
                    id=f"{kind}-{number}",
                    system="electrical",
                    kind=kind,
                    storey_index=index,
                    x_mm=x_mm,
                    y_mm=y_mm,
                    z_mm=z + height,
                    load_w=load,
                    note=note,
                )
            )

    # --- the circuits: the points packed into the loads the cable carries -----------
    circuits: list[Circuit] = []
    current: list[MepPoint] = []
    current_load = 0.0
    for point in points:
        if current and current_load + point.load_w > authored["maxCircuitLoadW"]:
            circuits.append(
                _make_circuit(
                    len(circuits) + 1,
                    index,
                    current,
                    current_load,
                    cable_sqmm=authored["circuitCableSqMm"],
                    breaker_a=authored["circuitBreakerA"],
                    voltage_v=authored["supplyVoltageV"],
                )
            )
            current = []
            current_load = 0.0
        current.append(point)
        current_load += point.load_w
    if current:
        circuits.append(
            _make_circuit(
                len(circuits) + 1,
                index,
                current,
                current_load,
                cable_sqmm=authored["circuitCableSqMm"],
                breaker_a=authored["circuitBreakerA"],
                voltage_v=authored["supplyVoltageV"],
            )
        )

    # The water layout: the fixture set of the units this floor holds -------------
    fixtures = (
        ("basin", authored["fixtureUnitsBasin"], "a wash basin"),
        ("wc", authored["fixtureUnitsWc"], "a WC (tank)"),
        ("shower", authored["fixtureUnitsShower"], "a shower"),
        ("kitchenSink", authored["fixtureUnitsKitchenSink"], "a kitchen sink"),
    )
    for kind, fixture_units, note in fixtures:
        for number in range(1, units_here + 1):
            points.append(
                MepPoint(
                    id=f"{kind}-{number}",
                    system="water",
                    kind=kind,
                    storey_index=index,
                    x_mm=round(x0 + inset * number, 3),
                    y_mm=round(y0 + inset, 3),
                    z_mm=z + 450.0,
                    fixture_units=fixture_units,
                    note=note,
                )
            )

    # --- the drainage: the stack and the branches that serve the fixtures ----------
    total_wfu = sum(point.fixture_units for point in points)
    stack = MepPoint(
        id="stack-1",
        system="drainage",
        kind="soilStack",
        storey_index=index,
        x_mm=round(x0 + inset, 3),
        y_mm=round(y0 + inset, 3),
        z_mm=z,
        note=f"the soil stack; the branches are laid at {fall_label}",
    )
    points.append(stack)

    # --- the gas: a cooker per unit, and the run that carries it -------------------
    for number in range(1, units_here + 1):
        points.append(
            MepPoint(
                id=f"cooker-{number}",
                system="gas",
                kind="cooker",
                storey_index=index,
                x_mm=round(x1 - authored["gasMeterOffsetMm"] * number, 3),
                y_mm=round(y1 - authored["gasMeterOffsetMm"], 3),
                z_mm=z + 900.0,
                load_m3_per_h=authored["gasCookerLoadM3PerH"],
                note="a domestic gas cooker (Titas)",
            )
        )
    if units_here:
        points.append(
            MepPoint(
                id="meter-1",
                system="gas",
                kind="meter",
                storey_index=index,
                x_mm=round(x1 - authored["gasMeterOffsetMm"], 3),
                y_mm=round(y0 + authored["gasMeterOffsetMm"], 3),
                z_mm=z + 1500.0,
                note="the gas meter; the run is sized by the load it carries",
            )
        )

    # --- the schedules --------------------------------------------------------------
    schedules: list[ScheduleRow] = []
    for circuit in circuits:
        schedules.append(
            ScheduleRow(
                system="electrical",
                id=circuit.id,
                description=f"Circuit {circuit.id} (storey {circuit.storey_index})",
                quantity=len(circuit.point_ids),
                unit="points",
                size=f"{circuit.cable_sqmm:g} mm² cable, {circuit.breaker_a:g} A breaker",
                load=f"{circuit.load_w:g} W",
                note="the connected load of the points on this circuit",
            )
        )
    total_load = sum(circuit.load_w for circuit in circuits)
    schedules.append(
        ScheduleRow(
            system="electrical",
            id="total",
            description="The total connected load",
            quantity=len(circuits),
            unit="circuits",
            size=f"{authored["supplyVoltageV"]:g} V",
            load=f"{total_load:g} W",
            note="the sum of the circuits' loads; the service capacity is not designed here",
        )
    )
    for kind, fixture_units, note in fixtures:
        count = sum(1 for point in points if point.system == "water" and point.kind == kind)
        if not count:
            continue
        schedules.append(
            ScheduleRow(
                system="water",
                id=kind,
                description=note,
                quantity=count,
                unit="no.",
                size=f"{fixture_units:g} fixture units",
                load=f"{count * fixture_units:g} FU",
                note="the fixture unit is the sizing unit for the supply",
            )
        )
    supply_pipe = _supply_pipe_diameter_mm(total_wfu)
    if units_here:
        schedules.append(
            ScheduleRow(
                system="water",
                id="supply",
                description="The fixture supply pipe",
                quantity=1,
                unit="no.",
                size=f"{supply_pipe:g} mm",
                load=f"{total_wfu:g} FU",
                note=(
                    "sized by the fixture units it serves; the grid's main (W2.12) is the pipe "
                    "these branches come off"
                ),
            )
        )
    schedules.append(
        ScheduleRow(
            system="drainage",
            id="stack",
            description="The soil stack",
            quantity=1,
            unit="no.",
            size=f"{authored["drainageStackDiameterMm"]:g} mm",
            load="",
            note="vertical; the branches that discharge into it carry the fall",
        )
    )
    if units_here:
        schedules.append(
            ScheduleRow(
                system="drainage",
                id="branch",
                description="The branch drains",
                quantity=len(fixtures) * units_here,
                unit="no.",
                size=f"{authored["drainageBranchDiameterMm"]:g} mm",
                load=fall_label,
                note="the horizontal run's fall; the fall is what carries the water",
            )
        )
    gas_load = sum(point.load_m3_per_h for point in points)
    cookers = sum(1 for point in points if point.system == "gas" and point.kind == "cooker")
    if cookers:
        schedules.append(
            ScheduleRow(
                system="gas",
                id="cooker",
                description="A domestic gas cooker (Titas)",
                quantity=cookers,
                unit="no.",
                size=f"{authored["gasPipeDiameterMm"]:g} mm pipe",
                load=f"{authored["gasCookerLoadM3PerH"]:g} m³/h each",
                note="the meter serves every cooker on the run",
            )
        )
        schedules.append(
            ScheduleRow(
                system="gas",
                id="run",
                description="The gas run",
                quantity=1,
                unit="no.",
                size=f"{authored["gasPipeDiameterMm"]:g} mm",
                load=f"{gas_load:g} m³/h",
                note="the run is sized by the total load it carries",
            )
        )

    if lift is not None and index == 0:
        schedules.append(
            ScheduleRow(
                system="lift",
                id=lift.id,
                description="The lift",
                quantity=1,
                unit="no.",
                size=f"{lift.shaft_mm:g} mm shaft, {lift.car_mm:g} mm car",
                load=f"{authored["liftPowerKw"]:g} kW, {int(authored["liftPersons"])} persons",
                note=(
                    "the car fits inside the shaft, with a hand's width of clearance on each side"
                    if lift.fits
                    else "THE CAR DOES NOT FIT INSIDE THE SHAFT"
                ),
            )
        )

    # The authored values (with their provenance) and the derived ones together.
    values: dict[str, Value] = dict(authored_records)
    values.update({
        "mep.area.floorAreaM2": Value(
            area_m2,
            "m²",
            PROVENANCE_DERIVED,
            "the spec's unit area" if unit_area > 0.0 and units_here else "the slab's extent",
            f"{units_here} unit(s) on this storey",
        ),
        "mep.electrical.totalLoadW": Value(
            total_load,
            "W",
            PROVENANCE_DERIVED,
            "the points on this storey",
            f"{len(circuits)} circuits",
        ),
        "mep.water.totalFixtureUnits": Value(
            total_wfu,
            "FU",
            PROVENANCE_DERIVED,
            "the fixtures on this storey",
            f"{units} unit(s) x {sum(unit for _, unit, _ in fixtures)} FU",
        ),
        "mep.water.supplyPipeMm": Value(
            supply_pipe,
            "mm",
            PROVENANCE_DERIVED,
            "the fixture units it serves",
            f"{total_wfu:g} FU",
        ),
        "mep.gas.totalLoadM3PerH": Value(
            gas_load,
            "m³/h",
            PROVENANCE_DERIVED,
            "the cookers on this storey",
            f"{cookers} cooker(s)",
        ),
    })

    # The assumptions the design hands back come from the table, so what the app writes
    # and what the design reads can never drift apart.
    assumptions = tuple(authored_assumptions)
    return MepDesign(
        project_id=str(project.get("id") or "unknown"),
        storey_index=index,
        storey_label=floor.storey_label,
        points=tuple(points),
        circuits=tuple(circuits),
        schedules=tuple(schedules),
        values=values,
        assumptions=assumptions,
        declared_absent=(
            "the riser that serves the floors above: each storey is sized for its own fixtures, "
            "and the riser's design is not done here",
            "the 3D routing between the points: the plan's §5.7 puts full 3D routing in v2, so "
            "v0 has the point layouts and the runs (W2.12) and no connection between them",
            "the switchboards, the main incoming feeder and the service capacity: the v0 spec "
            "carries no supply data, so the schedules size the loads and stop there",
            "the drainage's vent pipes and the floor-trap details: the v0 spec carries no "
            "drainage layout, so the branches carry the fall and nothing else",
            "the points' coordination with the structure: the layouts are an even grid over the "
            "floor, and the clash report is W3.2's job",
        ),
    )


def _make_circuit(
    number: int,
    storey_index: int,
    points: list[MepPoint],
    load_w: float,
    *,
    cable_sqmm: float,
    breaker_a: float,
    voltage_v: float,
) -> Circuit:
    """One circuit, from the points it serves."""
    return Circuit(
        id=f"circuit-{storey_index}-{number}",
        storey_index=storey_index,
        kind="lighting-and-power",
        point_ids=tuple(point.id for point in points),
        load_w=round(load_w, 3),
        cable_sqmm=cable_sqmm,
        breaker_a=breaker_a,
        voltage_v=voltage_v,
    )


__all__ = [
    "ASSUMED_BRANCH_DIAMETER_MM",
    "ASSUMED_COOKER_LOAD_M3_PER_H",
    "ASSUMED_CIRCUIT_BREAKER_A",
    "ASSUMED_CIRCUIT_CABLE_SQMM",
    "ASSUMED_DRAINAGE_FALL",
    "ASSUMED_FAN_LOAD_W",
    "ASSUMED_FANS_PER_100M2",
    "ASSUMED_GAS_PIPE_DIAMETER_MM",
    "ASSUMED_LIFT_POWER_KW",
    "ASSUMED_LIFT_PERSONS",
    "ASSUMED_LIGHTING_LOAD_W",
    "ASSUMED_LIGHTING_POINTS_PER_100M2",
    "ASSUMED_MAX_CIRCUIT_LOAD_W",
    "ASSUMED_OUTLET_LOAD_W",
    "ASSUMED_POWER_OUTLETS_PER_100M2",
    "ASSUMED_STACK_DIAMETER_MM",
    "ASSUMED_SUPPLY_VOLTAGE_V",
    "ASSUMED_WFU_BASIN",
    "ASSUMED_WFU_KITCHEN_SINK",
    "ASSUMED_WFU_SHOWER",
    "ASSUMED_WFU_WC",
    "Circuit",
    "MepDesign",
    "MepPoint",
    "ScheduleRow",
    "design_mep",
]
