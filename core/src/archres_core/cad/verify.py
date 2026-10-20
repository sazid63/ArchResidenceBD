"""Score a measured CAD run against its case, and say *why* when it fails (W1.8).

The verifier is the only place that decides pass/fail, and it only ever looks at the
launcher's measurement - never at anything a candidate script claimed about itself. When a
case fails, the failure carries three things a repair model needs: which expectation broke,
the value that actually arrived, and the engine's trace text (a structured traceback when the
candidate raised).

Expected volumes are compared with a tolerance because geometry arrives through a float
pipeline; the tolerance is the case's to choose. Counts, flags and hashes are compared
exactly - a determinism claim that is only "close" is not a determinism claim.
"""

from __future__ import annotations

import pathlib
from dataclasses import dataclass, field
from typing import Any

from .cases import ArtifactExpectation, Bounds, CadCase, ObjectExpectation, _bounds
from .runner import RunOutcome, tail

__all__ = ["CaseVerdict", "Failure", "verify_result"]

VOLUME_TOLERANCE = 1e-6  # relative
LENGTH_TOLERANCE_MM = 1e-3  # absolute


@dataclass(frozen=True)
class Failure:
    """One broken expectation, with the evidence that broke it."""

    check: str
    message: str
    expected: Any = None
    actual: Any = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "check": self.check,
            "message": self.message,
            "expected": self.expected,
            "actual": self.actual,
        }


@dataclass
class CaseVerdict:
    """The outcome of one case (or one determinism repeat)."""

    case_id: str
    ok: bool
    failures: list[Failure] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    code: str | None = None
    duration_ms: float = 0.0
    engine_version: str | None = None
    trace: str = ""
    artifact_hashes: dict[str, str] = field(default_factory=dict)
    totals: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "caseId": self.case_id,
            "ok": self.ok,
            "code": self.code,
            "durationMs": self.duration_ms,
            "engineVersion": self.engine_version,
            "failures": [failure.as_dict() for failure in self.failures],
            "warnings": list(self.warnings),
            "artifactHashes": dict(sorted(self.artifact_hashes.items())),
            "totals": self.totals,
        }

    def signature(self) -> dict[str, Any]:
        """The part of a verdict that determinism must reproduce exactly."""
        return {
            "ok": self.ok,
            "code": self.code,
            "failures": [failure.as_dict() for failure in self.failures],
            "artifactHashes": dict(sorted(self.artifact_hashes.items())),
            "totals": self.totals,
        }


def _relative(value: float, expected: float) -> float:
    if expected == 0.0:
        return abs(value - expected)
    return abs(value - expected) / abs(expected)


def _bounds_equal(first: Bounds | None, second: Bounds | None) -> bool:
    return first == second


def _check_totals(
    case: CadCase, result: dict[str, Any], failures: list[Failure]
) -> dict[str, Any]:
    objects = [item for item in (result.get("objects") or []) if isinstance(item, dict)]
    totals = {
        "objects": len(objects),
        "solids": sum(int(item.get("solids") or 0) for item in objects),
        "volumeM3": round(sum(float(item.get("volumeM3") or 0.0) for item in objects), 9),
    }
    for key, bounds in (case.expect.get("totals") or {}).items():
        actual = float(totals[key])
        if key == "volumeM3":
            expected = bounds.min if bounds.min == bounds.max else None
            if expected is not None and _relative(actual, expected) <= VOLUME_TOLERANCE:
                continue
        if not bounds.holds(actual):
            failures.append(
                Failure(
                    check=f"totals.{key}",
                    message=f"total {key} is {actual:g}, expected {bounds.describe()}",
                    expected=bounds.describe(),
                    actual=actual,
                )
            )
    return totals


def _check_document_objects(
    case: CadCase, result: dict[str, Any], totals: dict[str, Any], failures: list[Failure]
) -> None:
    raw = case.expect.get("documentObjects")
    if raw is None:
        return
    if isinstance(raw, int):
        expected = Bounds(float(raw), float(raw))
    elif isinstance(raw, dict) and {"min", "max"} <= set(raw):
        expected = _bounds(raw, "documentObjects")
    elif isinstance(raw, dict) and "min" in raw and "max" not in raw:
        expected = Bounds(float(raw["min"]), float(raw["min"]))
    elif isinstance(raw, dict) and "max" in raw and "min" not in raw:
        expected = Bounds(float(raw["max"]), float(raw["max"]))
    else:
        raise CadError("expect.documentObjects must be a count or bounds")
    names = result.get("documentObjects")
    count = len(names) if isinstance(names, list) else totals["objects"]
    if not expected.holds(float(count)):
        failures.append(
            Failure(
                check="documentObjects",
                message=f"document holds {count} object(s), expected {expected.describe()}",
                expected=expected.describe(),
                actual=count,
            )
        )
    objects_list = result.get("objects") or []
    shape_objects = [item for item in objects_list if isinstance(item, dict)]
    if not shape_objects and not _bounds_equal(expected, None):
        failures.append(
            Failure(
                check="objects.measured",
                message="no object in the document exposes a Shape, so nothing was verified",
                expected="at least one measurable solid",
                actual=0,
            )
        )


def _check_object(
    case: CadCase,
    expectation: ObjectExpectation,
    measured: dict[str, Any],
    failures: list[Failure],
) -> None:
    source = measured.get(expectation.name) or {}
    if not source:
        failures.append(
            Failure(
                check=f"objects[{expectation.name}]",
                message=f"the document has no object named {expectation.name!r}",
                expected=expectation.name,
                actual=sorted(measured),
            )
        )
        return
    if expectation.volume_m3 is not None:
        actual = float(source.get("volumeM3") or 0.0)
        expected = expectation.volume_m3
        close = expected.min == expected.max and _relative(actual, expected.min) <= VOLUME_TOLERANCE
        if not close and not expected.holds(actual):
            failures.append(
                Failure(
                    check=f"objects[{expectation.name}].volumeM3",
                    message=(
                        f"{expectation.name} volume is {actual:g} m3, "
                        f"expected {expected.describe()}"
                    ),
                    expected=expected.describe(),
                    actual=actual,
                )
            )
    if expectation.bbox_mm is not None:
        actual_box = [float(value) for value in (source.get("bboxMm") or [0.0, 0.0, 0.0])]
        for axis, (expected, actual) in enumerate(zip(expectation.bbox_mm, actual_box)):
            if _bounds_equal(expected, None):
                continue
            if expected.min == expected.max:
                if abs(actual - expected.min) <= LENGTH_TOLERANCE_MM:
                    continue
            if not expected.holds(actual):
                failures.append(
                    Failure(
                        check=f"objects[{expectation.name}].bboxMm[{axis}]",
                        message=(
                            f"{expectation.name} extent {axis} is {actual:g} mm, "
                            f"expected {expected.describe()}"
                        ),
                        expected=expected.describe(),
                        actual=actual,
                    )
                )
    if expectation.solids is not None and int(source.get("solids") or 0) != expectation.solids:
        failures.append(
            Failure(
                check=f"objects[{expectation.name}].solids",
                message=(
                    f"{expectation.name} holds {int(source.get('solids') or 0)} solid(s), "
                    f"expected {expectation.solids}"
                ),
                expected=expectation.solids,
                actual=int(source.get("solids") or 0),
            )
        )
    if expectation.valid is not None and bool(source.get("valid")) is not expectation.valid:
        failures.append(
            Failure(
                check=f"objects[{expectation.name}].valid",
                message=(
                    f"{expectation.name} validity is {bool(source.get('valid'))}, "
                    f"expected {expectation.valid}"
                ),
                expected=expectation.valid,
                actual=bool(source.get("valid")),
            )
        )


def _check_artifacts(
    case: CadCase,
    result: dict[str, Any],
    failures: list[Failure],
) -> dict[str, str]:
    produced: dict[str, dict[str, Any]] = {
        str(item.get("name")): item
        for item in (result.get("artifacts") or [])
        if isinstance(item, dict)
    }
    for expectation in case.expect.get("artifacts") or ():
        found = produced.get(expectation.name)
        if found is None:
            failures.append(
                Failure(
                    check=f"artifacts[{expectation.name}]",
                    message=f"artifact {expectation.name!r} was not produced",
                    expected=expectation.name,
                    actual=sorted(produced),
                )
            )
            continue
        if expectation.min_bytes is not None and int(found.get("sizeBytes") or 0) < (
            expectation.min_bytes
        ):
            failures.append(
                Failure(
                    check=f"artifacts[{expectation.name}].sizeBytes",
                    message=(
                        f"artifact {expectation.name} is {int(found.get('sizeBytes') or 0)} bytes, "
                        f"expected at least {expectation.min_bytes}"
                    ),
                    expected=expectation.min_bytes,
                    actual=int(found.get("sizeBytes") or 0),
                )
            )
        if expectation.sha256 and str(found.get("sha256")) != expectation.sha256:
            failures.append(
                Failure(
                    check=f"artifacts[{expectation.name}].sha256",
                    message=f"artifact {expectation.name} content changed",
                    expected=expectation.sha256,
                    actual=str(found.get("sha256")),
                )
            )
        if expectation.kind is not None:
            suffix = pathlib.PurePosixPath(expectation.name).suffix.lstrip(".").lower()
            if suffix != expectation.kind.lower():
                failures.append(
                    Failure(
                        check=f"artifacts[{expectation.name}].kind",
                        message=(
                            f"artifact {expectation.name} has extension {suffix!r}, "
                            f"expected {expectation.kind!r}"
                        ),
                        expected=expectation.kind,
                        actual=suffix,
                    )
                )
    return {
        name: str(item.get("sha256"))
        for name, item in sorted(produced.items())
        if item.get("sha256")
    }


def verify_result(case: CadCase, outcome: RunOutcome) -> CaseVerdict:
    """Turn a run into a verdict: every broken expectation becomes its own failure row."""
    verdict = CaseVerdict(
        case_id=case.id,
        ok=False,
        code=outcome.code,
        duration_ms=outcome.duration_ms,
        engine_version=outcome.engine_version,
        trace=tail(outcome.trace_text),
    )
    if outcome.result is None:
        verdict.failures.append(
            Failure(
                check="run",
                message=(
                    "the engine produced no result.json"
                    + (f" ({outcome.result_error})" if outcome.result_error else "")
                    + (f" after {outcome.duration_ms / 1000.0:.1f} s" if outcome.timed_out else "")
                ),
                expected="a measured result",
                actual=tail(outcome.stderr, 400) or f"exit code {outcome.exit_code}",
            )
        )
        return verdict

    result = outcome.result
    for warning in result.get("warnings") or []:
        verdict.warnings.append(str(warning))
    verdict.artifact_hashes = _check_artifacts(case, result, verdict.failures)

    expected_status = case.expect.get("status", "ok")
    actual_status = str(result.get("status"))
    if actual_status != expected_status:
        message = (
            f"run status is {actual_status!r}, expected {expected_status!r}"
            if expected_status == "error"
            else f"the candidate failed: {result.get('errorType')}: {result.get('message')}"
        )
        verdict.failures.append(
            Failure(
                check="status",
                message=message,
                expected=expected_status,
                actual=actual_status,
            )
        )
        # A failed run cannot satisfy geometry expectations; the status row is the evidence.
        verdict.code = str(result.get("errorCode") or outcome.code or "engine_error")
        return verdict

    verdict.totals = _check_totals(case, result, verdict.failures)
    _check_document_objects(case, result, verdict.totals, verdict.failures)
    measured = {
        str(item.get("name")): item
        for item in (result.get("objects") or [])
        if isinstance(item, dict) and item.get("name")
    }
    for expectation in case.objects:
        _check_object(case, expectation, measured, verdict.failures)

    verdict.ok = not verdict.failures
    return verdict
