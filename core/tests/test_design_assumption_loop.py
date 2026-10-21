"""The assumption loop must stay closed: what the design hands back, it reads back.

The defect this guards against: a design hands an assumption back with a pointer, the app
writes the value into the spec, and the design **ignores** it - so the user changes a value and
the building does not change. That is silent wrong geometry, the same class as the foundation
ignoring the spec's footing depth.

The guard writes each assumption through the **app's own write path** (`apply_patch`, the spec
engine) and then re-runs the design, asserting the value comes back as the spec's. If a design
ever hands back a pointer it does not read, this fails.
"""

from __future__ import annotations

import copy
import json
import pathlib

from archres_core.design import (
    design_foundation,
    design_mep,
    design_typical_floor,
)
from archres_core.design.commons import design_common_services
from archres_core.design.foundation import PROVENANCE_SPEC
from archres_core.spec import apply_patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def _write(spec: dict, pointer: str, value: float) -> dict:
    """Write a value into the spec the way the app does - through the spec engine."""
    return apply_patch(
        spec,
        [{"op": "add", "path": pointer, "value": value}],
        provenance={"source": "user"},
    )


def _foundation_with(spec: dict):
    return design_foundation(spec)


def _floor_with(spec: dict):
    foundation = design_foundation(spec)
    return design_typical_floor(spec, foundation, storey_index=1)


def _commons_with(spec: dict):
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    return design_common_services(spec, floor, storey_index=1)


def _mep_with(spec: dict):
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    return design_mep(spec, floor, storey_index=1)


DESIGNS = {
    "the foundation": _foundation_with,
    "the floor": _floor_with,
    "the common services": _commons_with,
    "the MEP": _mep_with,
}


def test_every_assumption_is_read_back() -> None:
    """Each assumption, written into the spec, must come back as the spec's value."""
    for name, build in DESIGNS.items():
        spec = _spec()
        design = build(spec)
        assumptions = list(design.assumptions)
        assert assumptions, f"{name} hands no assumptions back"
        for assumption in assumptions:
            # a pointer the app can actually write
            assert assumption.pointer.startswith("/phases/"), assumption.pointer
            written_value = assumption.value * 1.5
            written = _write(copy.deepcopy(spec), assumption.pointer, written_value)
            redone = build(written)
            # the design now shows the spec's value, sourced from that pointer
            records = [
                record for record in redone.values.values() if record.source == assumption.pointer
            ]
            assert records, (
                f"{name}: no value carries the source {assumption.pointer} - the design does "
                "not read what it hands back"
            )
            for record in records:
                assert record.provenance == PROVENANCE_SPEC, (
                    f"{name}: the value written at {assumption.pointer} was not read back "
                    f"({record.provenance})"
                )
                assert record.value == written_value, assumption.pointer
            # and it is not handed back again
            pointers = {item.pointer for item in redone.assumptions}
            assert assumption.pointer not in pointers, (
                f"{name}: {assumption.pointer} is still handed back although the spec carries it"
            )


def test_the_pointer_names_a_place_in_the_spec() -> None:
    """A pointer that does not resolve is a pointer the app cannot write."""
    for name, build in DESIGNS.items():
        design = build(_spec())
        for assumption in design.assumptions:
            written = _write(_spec(), assumption.pointer, assumption.value)
            assert written, f"{name}: {assumption.pointer} did not resolve"
