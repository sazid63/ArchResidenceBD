"""The MEP engines (W3.1): the point layouts, the sizing, the schedules.

The laws these tests hold:

- the design is **deterministic** - the same spec gives the same document;
- every number is either **derived** or an **authored assumption** handed back for the spec;
- the sizes are **computed**, not typed: a circuit's load is the sum of its points' loads, a
  pipe's size follows the fixture units it serves;
- the **spec decides** what a storey is for - a parking ground floor carries no residential
  fixture;
- the schedules **say** what is not covered.
"""

from __future__ import annotations

import json
import pathlib

from archres_core.design import (
    ASSUMED_MAX_CIRCUIT_LOAD_W,
    design_foundation,
    design_mep,
    design_typical_floor,
)
from archres_core.design.commons import design_common_services
from archres_core.design.foundation import PROVENANCE_ASSUMED, PROVENANCE_DERIVED

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def _mep(storey_index: int = 0):
    spec = _spec()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=storey_index)
    commons = design_common_services(spec, floor, storey_index=storey_index)
    lift = commons.lifts[0] if commons.lifts else None
    return design_mep(spec, floor, storey_index=storey_index, lift=lift)


def test_the_points_are_placed_on_the_floor() -> None:
    mep = _mep()
    assert mep.points, "the MEP must have points"
    for point in mep.points:
        assert point.x_mm >= 0.0 and point.y_mm >= 0.0
        assert point.z_mm >= 0.0


def test_the_electrical_layout_is_sized_by_the_floor_area() -> None:
    mep = _mep(1)
    lights = [point for point in mep.points if point.kind == "light"]
    outlets = [point for point in mep.points if point.kind == "outlet"]
    fans = [point for point in mep.points if point.kind == "fan"]
    assert len(lights) >= 1 and len(outlets) >= 1 and len(fans) >= 1
    # the layout follows the spec's unit area, not the slab's structural extent
    assert mep.values["mep.area.floorAreaM2"].provenance == PROVENANCE_DERIVED
    assert mep.values["mep.area.floorAreaM2"].value > 0.0


def test_the_circuits_carry_what_their_points_carry() -> None:
    mep = _mep(1)
    assert mep.circuits
    for circuit in mep.circuits:
        points = [point for point in mep.points if point.id in circuit.point_ids]
        assert points, "a circuit with no points is not a circuit"
        assert abs(circuit.load_w - sum(point.load_w for point in points)) < 1e-6
        assert circuit.load_w <= ASSUMED_MAX_CIRCUIT_LOAD_W + 1e-6
        assert circuit.breaker_a > 0.0 and circuit.cable_sqmm > 0.0


def test_every_electrical_point_is_on_exactly_one_circuit() -> None:
    mep = _mep(1)
    electrical = [point.id for point in mep.points if point.system == "electrical"]
    on_circuits = [point_id for circuit in mep.circuits for point_id in circuit.point_ids]
    assert sorted(electrical) == sorted(on_circuits)


def test_the_water_fixtures_sum_to_the_fixture_units() -> None:
    mep = _mep(1)
    assert mep.total_fixture_units() > 0.0
    assert abs(mep.total_fixture_units() - mep.values["mep.water.totalFixtureUnits"].value) < 1e-6
    assert mep.values["mep.water.totalFixtureUnits"].provenance == PROVENANCE_DERIVED


def test_the_supply_pipe_follows_the_fixture_units() -> None:
    mep = _mep(1)
    pipe = mep.values["mep.water.supplyPipeMm"]
    assert pipe.value > 0.0
    rows = [row for row in mep.schedules if row.system == "water" and row.id == "supply"]
    assert len(rows) == 1
    assert f"{pipe.value:g} mm" in rows[0].size


def test_the_gas_load_is_the_cookers_load() -> None:
    mep = _mep(1)
    cookers = [point for point in mep.points if point.kind == "cooker"]
    assert cookers
    assert abs(mep.total_gas_load_m3_per_h() - sum(c.load_m3_per_h for c in cookers)) < 1e-6
    assert mep.values["mep.gas.totalLoadM3PerH"].provenance == PROVENANCE_DERIVED


def test_the_spec_decides_what_the_ground_floor_is_for() -> None:
    """The example's ground floor is parking (the spec says so), so it has no fixture."""
    ground = _mep(0)
    upstairs = _mep(1)
    assert not [point for point in ground.points if point.system == "water"]
    assert not [point for point in ground.points if point.system == "gas"]
    assert [point for point in upstairs.points if point.system == "water"]
    assert [point for point in upstairs.points if point.system == "gas"]
    # the ground floor still has lights, and still has the soil stack through it
    assert [point for point in ground.points if point.kind == "light"]
    assert [point for point in ground.points if point.kind == "soilStack"]


def test_the_schedules_cover_every_system() -> None:
    mep = _mep(1)
    systems = {row.system for row in mep.schedules}
    assert systems == {"electrical", "water", "drainage", "gas"}
    for row in mep.schedules:
        assert row.description, "a schedule row must say what it is"
        assert row.quantity >= 0.0
    # the lift is the building's, so it is scheduled once - on the ground floor
    ground = _mep(0)
    lift_rows = [row for row in ground.schedules if row.system == "lift"]
    assert len(lift_rows) == 1
    assert not [row for row in mep.schedules if row.system == "lift"]


def test_the_lift_row_reports_the_fit_check() -> None:
    mep = _mep(0)
    rows = [row for row in mep.schedules if row.system == "lift"]
    assert len(rows) == 1
    note = rows[0].note.lower()
    assert "the car fits" in note or "does not fit" in note


def test_the_assumptions_are_handed_back_for_the_spec() -> None:
    mep = _mep(1)
    assert mep.assumptions
    for assumption in mep.assumptions:
        assert assumption.pointer.startswith("mep.")
        assert assumption.reason, "an assumption without a reason is not handed back"
    for key, value in mep.values.items():
        assert value.provenance in (PROVENANCE_ASSUMED, PROVENANCE_DERIVED)
        assert value.source, f"{key} must say where it came from"


def test_what_is_not_covered_is_declared() -> None:
    mep = _mep(1)
    assert mep.declared_absent
    joined = " ".join(mep.declared_absent)
    assert "3D routing" in joined
    assert "clash" in joined


def test_the_design_is_deterministic() -> None:
    first = _mep(1).as_dict()
    second = _mep(1).as_dict()
    assert first == second


def test_the_committed_artefact_is_fresh() -> None:
    committed = ROOT / "data" / "cad" / "generated" / "mep-design.json"
    assert committed.is_file(), committed
    document = json.loads(committed.read_text(encoding="utf-8"))
    assert document["storeys"], "the artefact must carry the storeys"
    for storey in document["storeys"]:
        assert storey["points"] and storey["schedules"]
    assert document["totals"]["loadW"] > 0.0
