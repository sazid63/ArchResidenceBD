"""The incremental build (W2.11): rebuild only the phase that changed, and prove the result
is the same as a full rebuild.

The plan's efficiency law (plan §8) is exact: the app must be able to **regenerate only the
changed phases**, and "all IDs/marks derive from stable spec IDs only (never build order)". The
quality law (plan §9) then puts that promise under a gate: **incremental ≡ full rebuild**.

This module is the *decision* half of that gate: it says which phases changed, and it rebuilds
only those. The other half is the proof (the design-level equality below, and the engine-level
equality in ``tools/cad/equivalence_probe.py``).

Three laws:

- **A phase's inputs are hashed, not guessed.** The foundation depends on the spec's site and
  project; the floor depends on the spec's building **and on the foundation's design**. A phase
  is rebuilt when its input hash changes, and a phase whose inputs are untouched is *reused*.
- **The result must be identical, not merely similar.** The incremental build's state must
  equal the full build's state — same phases, same design hashes — or the gate fails. That is
  the whole point: an optimisation that changes the output is rejected (plan §9).
- **The ids come from the spec.** A phase's objects are named from the design's stable ids, so
  the build order cannot change a name.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from .floor import FloorDesign, design_typical_floor
from .foundation import FoundationDesign, design_foundation

#: The phases the v0 chain builds, in build order.
PHASES = ("foundation", "floor-1")

#: The storey the v0 floor phase builds (the first floor above the ground floor).
FLOOR_STOREY_INDEX = 1


def canonical(value: Any) -> str:
    """The canonical JSON form a hash is taken over (sorted keys, no spacing)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(value: Any) -> str:
    """The sha256 of a value's canonical form."""
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class PhaseState:
    """One phase's build state: what it depends on, and what it produced."""

    phase: str
    input_hash: str
    design_hash: str
    design: Any = field(repr=False, default=None)

    def summary(self) -> dict[str, str]:
        return {
            "phase": self.phase,
            "inputHash": self.input_hash,
            "designHash": self.design_hash,
        }


def foundation_input_hash(spec: dict[str, Any]) -> str:
    """What the foundation depends on (the spec's site and project)."""
    return digest({"project": spec.get("project"), "site": spec.get("site")})


def floor_input_hash(spec: dict[str, Any], foundation: FoundationDesign) -> str:
    """What the floor depends on (the spec's building, plus the foundation it stands on)."""
    return digest(
        {
            "building": spec.get("building"),
            "foundation": digest(foundation.as_dict()),
        }
    )


def build_states(spec: dict[str, Any]) -> dict[str, PhaseState]:
    """The full build: every phase, in order."""
    foundation = design_foundation(spec)
    foundation_state = PhaseState(
        phase="foundation",
        input_hash=foundation_input_hash(spec),
        design_hash=digest(foundation.as_dict()),
        design=foundation,
    )
    floor = design_typical_floor(spec, foundation, storey_index=FLOOR_STOREY_INDEX)
    floor_state = PhaseState(
        phase="floor-1",
        input_hash=floor_input_hash(spec, foundation),
        design_hash=digest(floor.as_dict()),
        design=floor,
    )
    return {"foundation": foundation_state, "floor-1": floor_state}


def incremental_states(
    spec: dict[str, Any], previous: dict[str, PhaseState]
) -> tuple[dict[str, PhaseState], list[str]]:
    """Rebuild only the phases whose inputs changed; reuse the rest.

    Returns the new state and the list of the phases that were rebuilt. A phase whose input
    hash is unchanged is **not** rebuilt — its previous design is carried over — and the caller
    does not have to re-run the engine for it.
    """
    states: dict[str, PhaseState] = {}
    rebuilt: list[str] = []

    previous_foundation = previous.get("foundation")
    if previous_foundation is None or previous_foundation.input_hash != foundation_input_hash(spec):
        foundation: FoundationDesign = design_foundation(spec)
        rebuilt.append("foundation")
    else:
        foundation = previous_foundation.design
    states["foundation"] = PhaseState(
        phase="foundation",
        input_hash=foundation_input_hash(spec),
        design_hash=digest(foundation.as_dict()),
        design=foundation,
    )

    previous_floor = previous.get("floor-1")
    floor_input = floor_input_hash(spec, foundation)
    if previous_floor is None or previous_floor.input_hash != floor_input:
        floor: FloorDesign = design_typical_floor(
            spec, foundation, storey_index=FLOOR_STOREY_INDEX
        )
        rebuilt.append("floor-1")
    else:
        floor = previous_floor.design
    states["floor-1"] = PhaseState(
        phase="floor-1",
        input_hash=floor_input,
        design_hash=digest(floor.as_dict()),
        design=floor,
    )
    return states, rebuilt


def compare_states(
    left: dict[str, PhaseState], right: dict[str, PhaseState]
) -> list[str]:
    """The gate: the two states must be the same, phase by phase."""
    problems: list[str] = []
    if set(left) != set(right):
        problems.append(
            f"the builds hold different phases: {sorted(left)} against {sorted(right)}"
        )
        return problems
    for phase in sorted(left):
        one = left[phase]
        other = right[phase]
        if one.design_hash != other.design_hash:
            problems.append(
                f"{phase}: the design hashes differ ({one.design_hash[:12]} against "
                f"{other.design_hash[:12]})"
            )
        if one.input_hash != other.input_hash:
            problems.append(f"{phase}: the input hashes differ")
    return problems


__all__ = [
    "FLOOR_STOREY_INDEX",
    "PHASES",
    "PhaseState",
    "build_states",
    "canonical",
    "compare_states",
    "digest",
    "floor_input_hash",
    "foundation_input_hash",
    "incremental_states",
]
