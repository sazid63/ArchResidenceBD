"""Every field the spec carries is accounted for (the class of defect the cost meter's test found).

The spec's phase data is the app's input. A key the design does not read is a number the
user typed that silently does nothing — and the design's own reports would show an
assumption where the user set a value.

The rule this test holds:

- every key in a phase's data is either **used** (the design reads it, and the value carries
  the spec's provenance ✓) or **declared** (the design does not read it, and this is why ✓);
- the list below matches the spec exactly ✓ — a new key fails the test until someone decides
  what it means ✓, and a key that disappears fails it too ✓ (a stale list is a lie ✓).

The two fields this test caught: the foundation's ``footingDepthM`` (the design read
``footingDepthMm``, a key the spec does not have ✓ — so the spec's 1.5 m footing was
silently ignored ✓) and the common services' ``hasLift`` (the design built a lift whatever
the spec said ✓).
"""

from __future__ import annotations

import json
import pathlib

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.commons import design_common_services
from archres_core.design.foundation import PROVENANCE_SPEC

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"

#: phase id -> {field: "used" | "declared: why"}.
PHASE_FIELDS: dict[str, dict[str, str]] = {
    "site-excavation": {
        "excavationDepthM": "used",
        "method": "declared: a note about the works, not a number the geometry turns on",
        "shoring": "declared: the v0 pack does not design shoring",
    },
    "foundation": {
        "foundationType": "declared: the v0 pack builds isolated footings only",
        "footingDepthM": "used",
        "sbcUsedKpa": (
            "declared: the v0 pack has no bearing rule, so the footing's size stays an "
            "assumption until a rule pack lands"
        ),
    },
    "floor-0": {"slabThicknessMm": "used"},
    "floor-1": {"slabThicknessMm": "used"},
    "common-services": {
        "hasLift": "used",
        "stairType": "declared: the v0 pack has one stair shape, so the type is not distinguished",
    },
}


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def test_every_spec_field_is_accounted_for() -> None:
    """A field nobody has decided about is a field that silently does nothing."""
    for phase in _spec().get("phases") or []:
        phase_id = str(phase.get("id"))
        fields = (phase.get("data") or {})
        if not fields:
            continue
        assert phase_id in PHASE_FIELDS, f"{phase_id} carries fields and is not accounted for"
        assert set(fields) == set(PHASE_FIELDS[phase_id]), (
            f"{phase_id}'s fields changed: {sorted(fields)} against "
            f"{sorted(PHASE_FIELDS[phase_id])}"
        )


def test_the_list_has_no_stale_entries() -> None:
    """A list that names a field the spec no longer has is a list that lies."""
    phases = {str(phase.get("id")): phase for phase in _spec().get("phases") or []}
    for phase_id, fields in PHASE_FIELDS.items():
        assert phase_id in phases, f"{phase_id} is not in the spec any more"
        assert set((phases[phase_id].get("data") or {})) == set(fields), phase_id


def test_the_used_fields_carry_the_specs_provenance() -> None:
    """A field the design reads must show the spec's value, not an assumption."""
    spec = _spec()
    foundation = design_foundation(spec)
    for key in ("footing.depthMm", "excavation.depthM"):
        value = foundation.values[key]
        assert value.provenance == PROVENANCE_SPEC, key
        assert value.source.startswith("/phases/"), key

    floor = design_typical_floor(spec, foundation, storey_index=1)
    assert floor.values["slab.thicknessMm"].provenance == PROVENANCE_SPEC

    commons = design_common_services(spec, floor, storey_index=1)
    assert commons.values["services.hasLift"].provenance == PROVENANCE_SPEC


def test_the_foundations_depth_comes_from_the_spec() -> None:
    """The regression: the example says 1.5 m, and the footing is 1.5 m deep."""
    spec = _spec()
    foundation = design_foundation(spec)
    depth_m = None
    for phase in spec.get("phases") or []:
        if phase.get("id") == "foundation":
            depth_m = (phase.get("data") or {}).get("footingDepthM")
    assert depth_m, "the example must carry a footing depth for this test to mean anything"
    for footing in foundation.footings:
        assert footing.depth_mm == round(float(depth_m) * 1000.0, 3)


def test_the_lift_follows_the_spec() -> None:
    """The regression: the example says no lift, and there is no lift."""
    spec = _spec()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    commons = design_common_services(spec, floor, storey_index=1)
    has_lift = None
    for phase in spec.get("phases") or []:
        if phase.get("id") == "common-services":
            has_lift = (phase.get("data") or {}).get("hasLift")
    assert has_lift is False, "the example must say it has no lift for this test to mean anything"
    assert not commons.lifts
