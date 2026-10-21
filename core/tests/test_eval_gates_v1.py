"""The eval gates v1 (W4.3): the golden project, the band, and the pending gate.

The plan's section 7: *"golden projects - BOQ within ±8%, CAD execution success >90%, drawings
engineer-checked"*.

These tests hold the three:

1. **The golden project** — the app's own path on the reference project, compared with the
   committed reference BOQ, and the deviation must be inside the plan's 8%.
2. **The band** — a gate may carry a floor, a ceiling, or both. A band that cannot fail is
   not a gate, so the tests make it fail.
3. **The pending gate** — the engineer's check is a human act: the gate is **named** and
   reported as pending, and it does not stop the build (plan §9: explicit, user-visible state —
   never silent).
"""

from __future__ import annotations

import json
import pathlib

from archres_core.eval.run import EvalError, build_report, run_golden_suite
from archres_core.eval.cases import EvalCase

ROOT = pathlib.Path(__file__).resolve().parents[2]
GOLDEN_SPEC = ROOT / "spec" / "examples" / "two-storey-residential.json"
GOLDEN_REFERENCE = ROOT / "data" / "boq" / "two-storey-residential.boq.json"
GOLDEN_CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"


def _case(tolerance_pct: float = 8.0) -> EvalCase:
    return EvalCase(
        id="golden-two-storey-residential",
        suite="golden",
        lang=None,
        split="engine",
        source={"kind": "golden"},
        input={"spec": str(GOLDEN_SPEC.relative_to(ROOT))},
        expect={"tolerancePct": tolerance_pct},
    )


def _suite(tolerance_pct: float = 8.0, engineer_check: dict | None = None):
    return run_golden_suite(
        [_case(tolerance_pct)],
        ROOT,
        json.loads(GOLDEN_REFERENCE.read_text(encoding="utf-8")),
        json.loads(GOLDEN_CARD.read_text(encoding="utf-8")),
        engineer_check=engineer_check or {},
    )


def test_the_golden_project_is_inside_the_tolerance() -> None:
    """The app's own path, against the committed reference."""
    suite = _suite()
    assert suite.cases == 1
    assert suite.passed == 1, suite.failures
    assert suite.metrics["boqDeviationPct"] <= 8.0
    assert suite.metrics["boqTotalBdt"] == suite.metrics["boqReferenceBdt"]


def test_the_golden_gate_can_fail(tmp_path: pathlib.Path) -> None:
    """A band that cannot fail is not a gate: move the design and the gate must fail."""
    spec = json.loads(GOLDEN_SPEC.read_text(encoding="utf-8"))
    spec["site"]["plot"]["frontageM"] = 12.0  # a wider plot, more footings, a dearer BOQ
    moved = tmp_path / "moved.json"
    moved.write_text(json.dumps(spec, ensure_ascii=False), encoding="utf-8")
    case = EvalCase(
        id="golden-moved",
        suite="golden",
        lang=None,
        split="engine",
        source={"kind": "golden"},
        input={"spec": str(moved)},
        expect={"tolerancePct": 8.0},
    )
    suite = run_golden_suite(
        [case],
        ROOT,
        json.loads(GOLDEN_REFERENCE.read_text(encoding="utf-8")),
        json.loads(GOLDEN_CARD.read_text(encoding="utf-8")),
    )
    assert suite.passed == 0, "a BOQ 15% away must fail the 8% gate"
    assert suite.metrics["boqDeviationPct"] > 8.0


def test_a_gate_may_be_a_band() -> None:
    """The BOQ's gate is a band: the deviation must be at most 8%."""
    suite = _suite()
    report = build_report(
        suites=[suite],
        cases=[_case()],
        gates=[
            {
                "suite": "golden",
                "metric": "boqDeviationPct",
                "max": 8.0,
                "note": "the plan's band",
            }
        ],
        model=None,
        pins={},
    )
    assert report["ok"] is True
    gate = report["gates"][0]
    assert gate["ok"] is True
    assert gate["max"] == 8.0
    assert gate["floor"] is None


def test_a_band_that_is_broken_fails() -> None:
    """The band must fail when the value is outside it."""
    suite = _suite()
    report = build_report(
        suites=[suite],
        cases=[_case()],
        # the deviation is 0.000, so a band that starts above it cannot hold
        gates=[{"suite": "golden", "metric": "boqDeviationPct", "floor": 0.5, "max": 8.0}],
        model=None,
        pins={},
    )
    assert report["ok"] is False
    assert report["gates"][0]["ok"] is False


def test_a_gate_needs_a_bound() -> None:
    """A gate with neither a floor nor a ceiling is not a gate."""
    suite = _suite()
    try:
        build_report(
            suites=[suite],
            cases=[_case()],
            gates=[{"suite": "golden", "metric": "boqDeviationPct"}],
            model=None,
            pins={},
        )
    except EvalError:
        return
    raise AssertionError("a gate with no bound was accepted")


def test_the_engineers_check_is_pending_and_visible() -> None:
    """A human act: named, reported, and not a silent pass."""
    suite = _suite(engineer_check={"signed": False})
    report = build_report(
        suites=[suite],
        cases=[_case()],
        gates=[
            {
                "suite": "golden",
                "metric": "engineerCheckSigned",
                "floor": 1.0,
                "pending": True,
                "ownerItem": 9,
                "note": "the drawings engineer-checked",
            }
        ],
        model=None,
        pins={},
    )
    gate = report["gates"][0]
    assert gate["pending"] is True
    assert gate["ownerItem"] == 9
    assert gate["ok"] is False, "the unsigned check is not a pass"
    # and it is visible: the report names it, and the build is not stopped by it
    assert report["pendingGates"] and report["pendingGates"][0]["ownerItem"] == 9
    assert report["ok"] is True, "a pending gate must not stop the build"


def test_the_signed_check_passes_the_gate() -> None:
    """Once a human signs, the gate is a real gate."""
    suite = _suite(engineer_check={"signed": True})
    report = build_report(
        suites=[suite],
        cases=[_case()],
        gates=[{"suite": "golden", "metric": "engineerCheckSigned", "floor": 1.0}],
        model=None,
        pins={},
    )
    assert report["gates"][0]["ok"] is True
    assert report["ok"] is True
