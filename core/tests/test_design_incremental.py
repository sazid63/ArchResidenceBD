"""The equivalence gate (W2.11): an incremental rebuild must equal a full rebuild.

The plan's efficiency law (plan §8) says the app regenerates only the changed phases; the
quality law (plan §9) puts that promise under a gate. This is the gate's **design-level** half,
and it runs in CI on every push (no engine needed):

- a full build and an incremental build of the same spec must produce the **same** phase states
  (same design hashes, same input hashes) — not a similar model, the same one;
- a spec that changed in one phase must rebuild **that** phase and only that one (the efficiency
  claim), and the result must still equal the full build;
- a spec that changed nothing must rebuild nothing.

The engine-level half (the meshes the two builds produce must be byte-identical) lives in
``tools/cad/equivalence_probe.py`` and runs in the weekly ``cad-execution`` job, because it
needs the engine.
"""

from __future__ import annotations

import copy
import json
import pathlib

from archres_core.design.incremental import (
    build_states,
    compare_states,
    incremental_states,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def test_a_full_build_is_reproducible() -> None:
    one = build_states(_spec())
    other = build_states(_spec())
    assert not compare_states(one, other)
    assert set(one) == {"foundation", "floor-1"}


def test_an_incremental_build_of_a_new_project_equals_the_full_build() -> None:
    spec = _spec()
    states, rebuilt = incremental_states(spec, {})
    assert rebuilt == ["foundation", "floor-1"]
    assert not compare_states(states, build_states(spec))


def test_an_unchanged_spec_rebuilds_nothing() -> None:
    spec = _spec()
    previous = build_states(spec)
    states, rebuilt = incremental_states(spec, previous)
    assert rebuilt == []
    assert not compare_states(states, previous)


def test_a_changed_phase_rebuilds_only_that_phase() -> None:
    spec = _spec()
    previous = build_states(spec)

    changed = copy.deepcopy(spec)
    # A real change: the typical floor's height moves, so the floor's columns get taller.
    changed["building"]["storeys"]["typicalFloorHeightM"] = 3.6

    states, rebuilt = incremental_states(changed, previous)
    assert rebuilt == ["floor-1"], "the foundation's inputs did not change, so it must not rebuild"
    assert states["floor-1"].design_hash != previous["floor-1"].design_hash, (
        "the change must actually move the design - otherwise the gate proves nothing"
    )
    assert states["foundation"].design_hash == previous["foundation"].design_hash
    assert not compare_states(states, build_states(changed))


def test_a_changed_foundation_input_rebuilds_the_foundation_only() -> None:
    spec = _spec()
    previous = build_states(spec)

    changed = copy.deepcopy(spec)
    changed["site"]["soil"]["sbcKpa"] = 90

    states, rebuilt = incremental_states(changed, previous)
    assert rebuilt == ["foundation"], "the foundation's inputs changed, so it is rebuilt"
    # v0's footing sizes are authored assumptions (the pack has no footing rule), so the soil
    # does not move the geometry - and the floor, which stands on that geometry, is untouched.
    assert states["foundation"].design_hash == previous["foundation"].design_hash
    assert states["floor-1"].design_hash == previous["floor-1"].design_hash
    assert not compare_states(states, build_states(changed))


def test_the_floor_depends_on_the_foundations_design() -> None:
    """The chain is real: a different foundation means a different floor."""
    from archres_core.design.incremental import floor_input_hash

    spec = _spec()
    foundation = build_states(spec)["foundation"].design
    one = floor_input_hash(spec, foundation)

    class OtherFoundation:
        def as_dict(self) -> dict:
            return {"footings": [], "gradeBeams": []}

    two = floor_input_hash(spec, OtherFoundation())
    assert one != two


def test_the_gate_catches_a_different_result() -> None:
    # The gate is only worth having if it can fail: a state that differs is reported.
    spec = _spec()
    one = build_states(spec)
    other = build_states(spec)
    broken = dict(one)
    broken["floor-1"] = one["floor-1"].__class__(
        phase="floor-1",
        input_hash=one["floor-1"].input_hash,
        design_hash="0" * 64,
        design=one["floor-1"].design,
    )
    problems = compare_states(one, broken)
    assert problems and "design hashes differ" in problems[0]
