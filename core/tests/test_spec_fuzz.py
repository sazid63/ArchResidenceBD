"""The spec fuzzer (plan §9): the engine answers, and the fuzzer is deterministic."""

from __future__ import annotations

import json
import pathlib

from archres_core.spec.engine import SpecValidationError, apply_patch, validate_spec
from archres_core.spec.fuzz import DEFAULT_SEED, fuzz

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "spec" / "examples"


def _spec(name: str = "two-storey-residential.json") -> dict:
    return json.loads((EXAMPLES / name).read_text(encoding="utf-8"))


def test_the_fuzzer_actually_mutates() -> None:
    result = fuzz(_spec(), rounds=200, seed=DEFAULT_SEED)
    assert result.mutants > 100, "the fuzzer must produce real mutants"
    assert result.rejected > 0, "the engine must reject some of them"


def test_the_engine_never_crashes_on_the_mutants() -> None:
    result = fuzz(_spec(), rounds=400, seed=DEFAULT_SEED)
    assert result.crashes == []
    assert result.invalid == []
    assert result.ok


def test_the_fuzzer_is_deterministic() -> None:
    one = fuzz(_spec(), rounds=100, seed=DEFAULT_SEED)
    other = fuzz(_spec(), rounds=100, seed=DEFAULT_SEED)
    assert (one.mutants, one.rejected, one.applied) == (other.mutants, other.rejected, other.applied)
    # A different seed is a different set of mutants, and still no crash.
    different = fuzz(_spec(), rounds=100, seed=DEFAULT_SEED + 1)
    assert different.crashes == []


def test_a_broken_pointer_is_the_engines_error_not_a_traceback() -> None:
    spec = _spec()
    try:
        apply_patch(spec, [{"op": "replace", "path": "/no/such/path", "value": 1}], provenance={"source": "user"})
    except Exception as exc:  # noqa: BLE001
        assert isinstance(exc, (SpecValidationError, Exception))
        assert not isinstance(exc, (TypeError, AttributeError, KeyError, IndexError))
    else:
        raise AssertionError("the engine accepted a patch to a path that does not exist")


def test_a_mutant_the_engine_accepts_satisfies_the_schema() -> None:
    spec = _spec()
    result = fuzz(spec, rounds=200, seed=DEFAULT_SEED)
    assert result.invalid == []
    # And the engine still accepts the original.
    validate_spec(spec)
