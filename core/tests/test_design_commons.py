"""The common services (W2.12): the stair, the lift and the service runs."""

from __future__ import annotations

import json
import pathlib

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.commons import design_common_services, render_commons_macro

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _design(storey_index: int = 1, spec: dict | None = None):
    spec = spec or json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=storey_index)
    return spec, design_common_services(spec, floor)


def test_the_services_sit_on_the_floor() -> None:
    _spec, design = _design()
    assert len(design.flights) == 1
    assert len(design.landings) == 1
    # the spec says the building has no lift, so there is no lift
    assert len(design.lifts) == 0
    assert len(design.runs) == 3
    # the flight climbs from its base to the landing
    assert design.flights[0].base_z_mm + design.flights[0].rise_mm == design.landings[0].z_mm


def test_the_lift_car_fits_its_shaft() -> None:
    """When the spec asks for a lift, the car has to fit inside the shaft."""
    spec, _design_ = _design()
    for phase in spec["phases"]:
        if phase.get("id") == "common-services":
            phase.setdefault("data", {})["hasLift"] = True
    _spec, design = _design(spec=spec)
    assert len(design.lifts) == 1
    lift = design.lifts[0]
    assert lift.fits
    assert lift.car_mm < lift.shaft_mm


def test_the_conduit_is_sized_by_the_units_the_floor_holds() -> None:
    spec, design = _design()
    outlets = int(spec["building"]["unitsPerFloor"]) * 8
    assert outlets <= 32
    assert design.values["services.conduitDiameterMm"].value == 25.0


def test_the_stair_climbs_the_storey_height() -> None:
    spec, design = _design()
    height_mm = float(spec["building"]["storeys"]["typicalFloorHeightM"]) * 1000.0
    flight = design.flights[0]
    assert flight.rise_mm == height_mm
    assert flight.angle_deg > 0.0


def test_the_macro_is_deterministic() -> None:
    _spec, design = _design()
    assert render_commons_macro(design) == render_commons_macro(design)
    assert "StairFlight_" in render_commons_macro(design)


def test_two_storeys_do_not_collide() -> None:
    """The scale-out's own lesson: the ids must be unique across the model."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    ground = design_typical_floor(spec, foundation, storey_index=0)
    first = design_typical_floor(spec, foundation, storey_index=1)
    names = {item["name"] for item in ground.expected_objects() + first.expected_objects()}
    assert len(names) == len(ground.expected_objects()) + len(first.expected_objects())
