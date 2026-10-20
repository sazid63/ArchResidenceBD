"""CAD verdicts and the two suite layers (W1.8) - measured truth, never a candidate's claim."""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.cad import (
    EngineInfo,
    check_cases,
    load_cases,
    render_markdown,
    run_candidate,
    run_execution,
    verify_result,
)
from archres_core.cad.runner import RunOutcome
from archres_core.cad.suite import artifact_tree_sha

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"

FAKE_LAUNCHER = '''\
import json, os, pathlib, sys

state = json.loads(pathlib.Path(os.environ["FAKE_STATE"]).read_text(encoding="utf-8"))
calls = pathlib.Path(os.environ["FAKE_CALLS"])
count = int(calls.read_text(encoding="utf-8")) if calls.exists() else 0
calls.write_text(str(count + 1), encoding="utf-8")
out = pathlib.Path(os.environ["ARCHRES_JOB_OUT"])
outdir = pathlib.Path(os.environ["ARCHRES_JOB_OUTDIR"])
outdir.mkdir(parents=True, exist_ok=True)
for name, body in (state.get("artifacts") or {}).items():
    (outdir / name).write_text(body, encoding="utf-8")
payload = json.loads(json.dumps(state["result"]))
if state.get("vary_with_call") and payload.get("objects"):
    payload["objects"][0]["volumeM3"] = 0.675 + count
out.write_text(json.dumps(payload, sort_keys=True), encoding="utf-8")
'''


@pytest.fixture
def fake_launcher(tmp_path: pathlib.Path) -> pathlib.Path:
    path = tmp_path / "fake_launcher.py"
    path.write_text(FAKE_LAUNCHER, encoding="utf-8")
    return path


def _state(tmp_path: pathlib.Path, payload: dict) -> pathlib.Path:
    path = tmp_path / "state.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _result(**overrides) -> dict:
    result = {
        "status": "ok",
        "engineVersion": "1.1.4",
        "documentObjects": ["Pad_1"],
        "objects": [
            {
                "name": "Pad_1",
                "volumeM3": 0.675,
                "bboxMm": [1200.0, 1200.0, 3000.0],
                "solids": 1,
                "valid": True,
            }
        ],
        "artifacts": [
            {
                "name": "foundation-summary.json",
                "sizeBytes": 92,
                "sha256": "a" * 64,
            }
        ],
        "warnings": [],
        "notes": [],
    }
    result.update(overrides)
    return result


def _outcome(tmp_path: pathlib.Path, result: dict | None, *, code: str | None = None) -> RunOutcome:
    return RunOutcome(
        exit_code=0,
        timed_out=False,
        duration_ms=12.0,
        stdout="",
        stderr="",
        result=result,
        result_error=None,
        code=code,
        workdir=tmp_path,
        engine_version=(result or {}).get("engineVersion"),
    )


def _case_dir(tmp_path: pathlib.Path, **overrides) -> pathlib.Path:
    case = {
        "id": "case-1",
        "kind": "geometry.build",
        "script": "tools/cad/candidates/geometry_build.py",
        "params": {},
        "expect": {
            "status": "ok",
            "documentObjects": {"min": 1},
            "totals": {"volumeM3": {"min": 0.674, "max": 0.676}},
            "objects": [
                {
                    "name": "Pad_1",
                    "volumeM3": {"min": 0.674, "max": 0.676},
                    "bboxMm": [
                        {"min": 1199.9, "max": 1200.1},
                        {"min": 1199.9, "max": 1200.1},
                        {"min": 2999.9, "max": 3000.1},
                    ],
                    "solids": 1,
                    "valid": True,
                }
            ],
            "artifacts": [{"name": "foundation-summary.json", "minBytes": 10}],
        },
        "determinism": True,
        "notes": "a passing case",
    }
    case.update(overrides)
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([case]), encoding="utf-8")
    return path


def test_a_matching_run_passes(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    verdict = verify_result(case, _outcome(tmp_path, _result()))
    assert verdict.ok is True
    assert verdict.failures == []
    assert verdict.totals == {"objects": 1, "solids": 1, "volumeM3": 0.675}
    assert verdict.artifact_hashes == {"foundation-summary.json": "a" * 64}


def test_a_volume_outside_the_bounds_fails_with_the_numbers(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    result = _result()
    result["objects"][0]["volumeM3"] = 0.71
    verdict = verify_result(case, _outcome(tmp_path, result))
    assert verdict.ok is False
    checks = {failure.check: failure for failure in verdict.failures}
    assert {"totals.volumeM3", "objects[Pad_1].volumeM3"} <= set(checks)
    object_failure = checks["objects[Pad_1].volumeM3"]
    assert "0.71" in object_failure.message
    assert "0.674..0.676" in object_failure.message


def test_a_missing_object_is_named(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    result = _result(objects=[], documentObjects=[])
    verdict = verify_result(case, _outcome(tmp_path, result))
    assert verdict.ok is False
    assert {failure.check for failure in verdict.failures} >= {
        "documentObjects",
        "objects.measured",
        "objects[Pad_1]",
    }
    assert "nothing was verified" in " ".join(f.message for f in verdict.failures)


def test_a_missing_artifact_fails(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    verdict = verify_result(case, _outcome(tmp_path, _result(artifacts=[])))
    assert verdict.ok is False
    assert any(failure.check == "artifacts[foundation-summary.json]" for failure in verdict.failures)


def test_an_invalid_solid_fails(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    result = _result()
    result["objects"][0]["valid"] = False
    verdict = verify_result(case, _outcome(tmp_path, result))
    assert [failure.check for failure in verdict.failures] == ["objects[Pad_1].valid"]


def test_an_expected_failure_must_actually_fail(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(
        _case_dir(
            tmp_path,
            expect={"status": "error", "errorType": "RuntimeError"},
            determinism=False,
        ),
        root=ROOT,
    )
    verdict = verify_result(case, _outcome(tmp_path, _result()))
    assert verdict.ok is False
    assert verdict.failures[0].check == "status"
    assert "expected 'error'" in verdict.failures[0].message


def _error_result(**overrides) -> dict:
    result = _result(
        status="error",
        errorCode="engine_error",
        errorType="RuntimeError",
        message="Column_1 is missing: the foundation needs a column",
    )
    result.update(overrides)
    return result


def test_an_expected_error_must_be_the_named_error(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(
        _case_dir(
            tmp_path,
            expect={
                "status": "error",
                "errorType": "RuntimeError",
                "errorContains": "Column_1 is missing",
            },
            determinism=False,
        ),
        root=ROOT,
    )
    verdict = verify_result(case, _outcome(tmp_path, _error_result()))
    assert verdict.ok is True
    assert verdict.code == "engine_error"


def test_the_wrong_exception_type_does_not_pass_an_expected_error(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(
        _case_dir(
            tmp_path,
            expect={"status": "error", "errorType": "RuntimeError"},
            determinism=False,
        ),
        root=ROOT,
    )
    verdict = verify_result(case, _outcome(tmp_path, _error_result(errorType="NameError")))
    assert verdict.ok is False
    assert [failure.check for failure in verdict.failures] == ["errorType"]


def test_the_wrong_error_message_does_not_pass_an_expected_error(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(
        _case_dir(
            tmp_path,
            expect={
                "status": "error",
                "errorType": "RuntimeError",
                "errorContains": "Column_1 is missing",
            },
            determinism=False,
        ),
        root=ROOT,
    )
    verdict = verify_result(
        case, _outcome(tmp_path, _error_result(message="something else broke"))
    )
    assert verdict.ok is False
    assert [failure.check for failure in verdict.failures] == ["errorContains"]


def test_an_empty_document_can_be_expected(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(
        _case_dir(
            tmp_path,
            expect={"status": "ok", "documentObjects": {"max": 0}},
        ),
        root=ROOT,
    )
    verdict = verify_result(case, _outcome(tmp_path, _result(objects=[], documentObjects=[])))
    assert verdict.ok is True
    assert verdict.totals["objects"] == 0


def test_a_failed_run_cannot_pass_geometry_expectations(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    failed = _result(status="error", errorCode="engine_error", errorType="NameError")
    verdict = verify_result(case, _outcome(tmp_path, failed))
    assert verdict.ok is False
    assert verdict.code == "engine_error"
    assert verdict.failures[0].check == "status"


def test_no_result_at_all_is_a_failure_with_the_stderr(tmp_path: pathlib.Path) -> None:
    (case,) = load_cases(_case_dir(tmp_path), root=ROOT)
    outcome = RunOutcome(
        exit_code=3,
        timed_out=False,
        duration_ms=5.0,
        stdout="",
        stderr="cannot read job params",
        result=None,
        result_error="result.json was not written",
        code="no_result",
        workdir=tmp_path,
    )
    verdict = verify_result(case, outcome)
    assert verdict.ok is False
    assert verdict.failures[0].check == "run"
    assert "cannot read job params" in str(verdict.failures[0].actual)


def test_the_offline_layer_passes_on_the_committed_cases() -> None:
    report = check_cases(CASES, root=ROOT)
    assert report.ok is True
    assert len(report.cases) == 3
    assert report.as_dict()["determinism"] == 2
    assert render_markdown(report).startswith("# CAD verify (suite)")


def test_the_offline_layer_fails_on_a_missing_script(tmp_path: pathlib.Path) -> None:
    path = _case_dir(tmp_path, script="tools/cad/candidates/does_not_exist.py")
    report = check_cases(path, root=ROOT)
    assert report.ok is False
    assert "candidate script is missing" in report.failures[0]


def test_the_offline_layer_surfaces_a_broken_case_file(tmp_path: pathlib.Path) -> None:
    broken = tmp_path / "cases.json"
    broken.write_text("{not json", encoding="utf-8")
    report = check_cases(broken, root=ROOT)
    assert report.ok is False
    assert "cannot parse" in report.failures[0]


def test_execution_passes_and_repeats_determinism_cases(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    monkeypatch.setenv("FAKE_STATE", str(_state(tmp_path, {"result": _result()})))
    monkeypatch.setenv("FAKE_CALLS", str(tmp_path / "calls.txt"))
    cases = load_cases(_case_dir(tmp_path), root=ROOT)
    report = run_execution(
        cases,
        engine=EngineInfo(pathlib.Path(sys.executable), "test"),
        workdir=tmp_path / "work",
        keep=True,
        launcher=fake_launcher,
    )
    assert report.ok is True
    assert int((tmp_path / "calls.txt").read_text(encoding="utf-8")) == 2
    assert report.runs[0].determinism_ok is True
    assert report.as_dict()["accuracy"] == 1.0


def test_execution_fails_an_unstable_candidate(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    monkeypatch.setenv(
        "FAKE_STATE",
        str(_state(tmp_path, {"result": _result(), "vary_with_call": True})),
    )
    monkeypatch.setenv("FAKE_CALLS", str(tmp_path / "calls.txt"))
    cases = load_cases(
        _case_dir(
            tmp_path,
            expect={"status": "ok", "documentObjects": {"min": 1}},
        ),
        root=ROOT,
    )
    report = run_execution(
        cases,
        engine=EngineInfo(pathlib.Path(sys.executable), "test"),
        workdir=tmp_path / "work",
        keep=True,
        launcher=fake_launcher,
    )
    assert report.runs[0].verdict.ok is True  # each run is valid on its own
    assert report.runs[0].determinism_ok is False
    assert report.ok is False  # ... but the pair is not the same output


def test_execution_without_an_engine_is_an_error(monkeypatch) -> None:
    monkeypatch.delenv("ARCHRES_FREECADCMD", raising=False)
    monkeypatch.setattr(
        "archres_core.cad.engine.KNOWN_PATHS", (pathlib.Path("Z:/nowhere/freecadcmd.exe"),)
    )
    monkeypatch.setattr("archres_core.cad.engine.shutil.which", lambda _name: None)
    report = run_execution([])
    assert report.ok is False
    assert report.errors
    assert "ARCHRES_FREECADCMD" in report.errors[0]


def test_artifact_tree_sha_changes_with_content(tmp_path: pathlib.Path) -> None:
    first = tmp_path / "a"
    (first / "out").mkdir(parents=True)
    (first / "out" / "x.json").write_text("{}", encoding="utf-8")
    second = tmp_path / "b"
    (second / "out").mkdir(parents=True)
    (second / "out" / "x.json").write_text('{"a": 1}', encoding="utf-8")
    assert artifact_tree_sha(first / "out") == artifact_tree_sha(first / "out")
    assert artifact_tree_sha(first / "out") != artifact_tree_sha(second / "out")


def test_the_cli_checks_the_committed_cases_without_an_engine() -> None:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "cp1252"  # the house rule: a piped console is cp1252
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "cad" / "verify.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        env=env,
    )
    assert result.returncode == 0, result.stderr
    assert "3" in result.stdout
    assert "PASS" in result.stdout
