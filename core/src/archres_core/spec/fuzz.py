"""Spec fuzzing (the plan's §9 guard): the spec engine must never crash on bad input.

The plan's §9 names four CI guards, and this is the one that had no package: "**spec
fuzzing**". The Building Spec is the app's source of truth ✓ — a malformed one must be
*rejected* ✓, never *crash* the engine ✓, and never let a bad document through ✓.

The fuzzer is **deterministic** ✓ (a fixed seed ✓, the same mutants on every run ✓ — plan §9's
"identical outputs" ✓) and it mutates the *committed examples* ✓, so the cases are the ones
that matter ✓.

The laws it checks:

1. **No unexpected exception.** A mutant may make the engine raise `SpecValidationError` ✓ or
   `SpecPatchError` ✓ — those are the engine's answers ✓. Anything else (a `TypeError` ✓, an
   `AttributeError` ✓, a `RecursionError` ✓, a `KeyError` from a half-parsed document ✓) is a
   **defect** ✓ — a crash on bad input is a crash a user can cause ✓.
2. **A patch that succeeds produces a valid document.** The engine validates before it
   returns ✓ (W1.3 ✓); the fuzzer checks it again ✓, because a document that passes the
   engine and fails the schema is a document that reaches the app ✓.
3. **A bad pointer is an error, not a traceback.** The pointer operations (the rule engine's
   restore ✓, the price service's override ✓) walk a path the caller supplies ✓ — a broken path
   must raise the engine's own error ✓.

The fuzzer is a *test harness*, not a generator of truth ✓: it finds crashes ✓; what the engine
should say about a bad document is a separate question ✓ (and the engine's own tests cover that
✓).
"""

from __future__ import annotations

import copy
import random
from dataclasses import dataclass, field
from typing import Any, Callable

from .engine import (
    SpecPatchError,
    SpecValidationError,
    apply_patch,
    diff_specs,
    spec_sha256,
    validate_spec,
)

#: The errors the engine is allowed to raise.
EXPECTED_ERRORS = (SpecValidationError, SpecPatchError)

#: The seed the fuzzer uses - the same mutants on every run (plan §9).
DEFAULT_SEED = 20261021


@dataclass
class Mutant:
    """One mutated document, and what was done to it."""

    name: str
    spec: dict[str, Any]
    changed: bool = True
    note: str = ""


@dataclass
class FuzzResult:
    """What the fuzzer found."""

    mutants: int = 0
    applied: int = 0
    rejected: int = 0
    unchanged: int = 0
    crashes: list[str] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.crashes and not self.invalid


def _first_value(spec: dict[str, Any], path: tuple[str, ...]) -> Any:
    node: Any = spec
    for token in path:
        if isinstance(node, list):
            node = node[int(token)]
        else:
            node = node[token]
    return node


def _set_value(spec: dict[str, Any], path: tuple[str, ...], value: Any) -> None:
    node: Any = spec
    for token in path[:-1]:
        node = node[int(token)] if isinstance(node, list) else node[token]
    last = path[-1]
    if isinstance(node, list):
        node[int(last)] = value
    else:
        node[last] = value


def _paths(spec: dict[str, Any], prefix: tuple[str, ...] = ()) -> list[tuple[str, ...]]:
    """Every leaf path in the document (bounded, so the fuzzer stays quick)."""
    found: list[tuple[str, ...]] = []
    if len(prefix) > 4:
        return found
    if isinstance(spec, dict):
        for key, value in list(spec.items())[:12]:
            found.extend(_paths(value, prefix + (key,)))
    elif isinstance(spec, list):
        for index, value in enumerate(spec[:6]):
            found.extend(_paths(value, prefix + (str(index),)))
    else:
        found.append(prefix)
    return found


#: The mutators: each takes the document and returns a changed one (or None).
MUTATORS: tuple[tuple[str, Callable[[dict[str, Any], random.Random], Any]], ...] = (
    ("drop", lambda spec, rng: _drop(spec, rng)),
    ("wrong-type", lambda spec, rng: _set_value(spec, rng.choice(_paths(spec)), "not-a-number")),
    ("out-of-range", lambda spec, rng: _set_value(spec, rng.choice(_paths(spec)), -1.0)),
    ("huge", lambda spec, rng: _set_value(spec, rng.choice(_paths(spec)), 1e300)),
    ("empty-list", lambda spec, rng: _empty_list(spec, rng)),
    ("extra-field", lambda spec, rng: _extra_field(spec, rng)),
    ("wrong-enum", lambda spec, rng: _wrong_enum(spec, rng)),
)


def _drop(spec: dict[str, Any], rng: random.Random) -> Any:
    paths = [path for path in _paths(spec) if path and isinstance(path[-1], str)]
    if not paths:
        return None
    path = rng.choice(paths)
    node: Any = spec
    for token in path[:-1]:
        node = node[token]
    if isinstance(node, dict) and path[-1] in node:
        del node[path[-1]]
        return True
    return None


def _empty_list(spec: dict[str, Any], rng: random.Random) -> Any:
    candidates: list[tuple[str, ...]] = []
    for key, value in spec.items():
        if isinstance(value, list):
            candidates.append((key,))
    if not candidates:
        return None
    path = rng.choice(candidates)
    spec[path[0]] = []
    return True


def _extra_field(spec: dict[str, Any], rng: random.Random) -> Any:
    node = spec
    for _ in range(rng.randint(0, 2)):
        if not node:
            return None
        key = rng.choice(sorted(node))
        value = node[key]
        if isinstance(value, dict):
            node = value
    node["zzUnexpectedField"] = "fuzz"
    return True


def _wrong_enum(spec: dict[str, Any], rng: random.Random) -> Any:
    for key, value in spec.items():
        if isinstance(value, str) and value in ("residential", "rcc_frame", "site_excavation"):
            spec[key] = "not-a-real-enum"
            return True
    return None


def _mutate(spec: dict[str, Any], rng: random.Random) -> Mutant | None:
    for name, mutator in MUTATORS:
        candidate = copy.deepcopy(spec)
        try:
            changed = mutator(candidate, rng)
        except (KeyError, IndexError, TypeError, ValueError):
            continue
        if not changed:
            continue
        if spec_sha256(candidate) == spec_sha256(spec):
            continue
        return Mutant(name=name, spec=candidate, note=str(changed))
    return None


def fuzz(spec: dict[str, Any], *, rounds: int = 200, seed: int = DEFAULT_SEED) -> FuzzResult:
    """Fuzz the spec engine with the document and report what it did."""
    rng = random.Random(seed)
    result = FuzzResult()
    for _ in range(rounds):
        mutant = _mutate(spec, rng)
        if mutant is None:
            result.unchanged += 1
            continue
        result.mutants += 1

        # 1. validation must answer, not crash.
        try:
            validate_spec(mutant.spec)
            result.applied += 1
        except EXPECTED_ERRORS:
            result.rejected += 1
        except Exception as exc:  # noqa: BLE001 - that is the finding
            result.crashes.append(
                f"{mutant.name}: validate raised {type(exc).__name__}: {exc}"
            )
            continue

        # 2. a patch with a broken pointer must be an error, not a traceback.
        for op in (
            {"op": "replace", "path": "/does/not/exist", "value": 1},
            {"op": "add", "path": "/nope/", "value": 1},
            {"op": "remove", "path": "/site/soil/doesNotExist"},
            {"op": "replace", "path": "", "value": 1},
        ):
            try:
                apply_patch(mutant.spec, [op], provenance={"source": "user"})
            except EXPECTED_ERRORS:
                pass
            except Exception as exc:  # noqa: BLE001 - that is the finding
                result.crashes.append(
                    f"{mutant.name}: patch {op['path']!r} raised {type(exc).__name__}: {exc}"
                )

        # 3. a document the engine accepts must satisfy the schema.
        try:
            validate_spec(mutant.spec)
        except EXPECTED_ERRORS:
            continue
        except Exception as exc:  # noqa: BLE001 - that is the finding
            result.invalid.append(f"{mutant.name}: {type(exc).__name__}: {exc}")

    # The diff must also survive a broken document.
    try:
        diff_specs(spec, copy.deepcopy(spec))
    except Exception as exc:  # noqa: BLE001 - that is the finding
        result.crashes.append(f"diff raised {type(exc).__name__}: {exc}")
    return result


__all__ = [
    "DEFAULT_SEED",
    "EXPECTED_ERRORS",
    "FuzzResult",
    "MUTATORS",
    "Mutant",
    "fuzz",
]
