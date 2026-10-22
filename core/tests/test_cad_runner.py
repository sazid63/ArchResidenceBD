"""CAD engine discovery and one headless process (W1.8).

No FreeCAD here: the engine is any executable, and the in-engine launcher is replaced by a
fake one that writes the same `result.json` contract. That is exactly the seam a real run
crosses, so the deadline, the process-tree kill, the missing-result path and the stderr
capture are all exercised without a CAD install (the real engine runs in CI and in the
recorded live probe).
"""

from __future__ import annotations

import json
import pathlib
import sys
import time

import pytest

from archres_core.cad import EngineInfo, EngineMissing, find_engine, run_candidate

FAKE_LAUNCHER = '''\
import json, os, pathlib, time

state = json.loads(pathlib.Path(os.environ["FAKE_STATE"]).read_text(encoding="utf-8"))
mode = state.get("mode", "ok")
if state.get("stderr"):
    print(state["stderr"], file=__import__("sys").stderr, flush=True)
if state.get("sleep"):
    time.sleep(state["sleep"])
if mode == "no-result":
    raise SystemExit(state.get("exit", 9))
out = pathlib.Path(os.environ["ARCHRES_JOB_OUT"])
outdir = pathlib.Path(os.environ["ARCHRES_JOB_OUTDIR"])
outdir.mkdir(parents=True, exist_ok=True)
for name, body in (state.get("artifacts") or {}).items():
    target = outdir / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
result = state["result"]
out.write_text(json.dumps(result, sort_keys=True), encoding="utf-8")
raise SystemExit(state.get("exit", 0))
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


def _ok_result() -> dict:
    return {
        "status": "ok",
        "engine": "fake",
        "engineVersion": "0.0.0",
        "objects": [
            {
                "name": "Pad_1",
                "volumeM3": 0.675,
                "bboxMm": [1200.0, 1200.0, 3000.0],
                "solids": 1,
                "valid": True,
            }
        ],
        "artifacts": [],
        "warnings": [],
        "notes": [],
        "durationMs": 1.0,
    }


def _run(tmp_path: pathlib.Path, launcher: pathlib.Path, *, timeout_ms: int = 30_000):
    engine = EngineInfo(pathlib.Path(sys.executable), "test")
    return run_candidate(
        engine,
        tmp_path / "candidate.py",
        {"kind": "geometry.build", "params": {}},
        tmp_path / "run",
        timeout_ms=timeout_ms,
        launcher=launcher,
    )


def test_an_explicit_engine_must_exist(tmp_path: pathlib.Path) -> None:
    with pytest.raises(EngineMissing, match="given path"):
        find_engine(tmp_path / "nope.exe")


def test_the_environment_override_is_used(tmp_path: pathlib.Path, monkeypatch) -> None:
    fake = tmp_path / "freecadcmd"
    fake.write_text("", encoding="utf-8")
    monkeypatch.setenv("ARCHRES_FREECADCMD", str(fake))
    info = find_engine()
    assert info.path == fake
    assert info.source == "ARCHRES_FREECADCMD"


def test_a_dangling_override_is_an_error_not_a_fallback(tmp_path: pathlib.Path, monkeypatch) -> None:
    monkeypatch.setenv("ARCHRES_FREECADCMD", str(tmp_path / "gone.exe"))
    with pytest.raises(EngineMissing, match="ARCHRES_FREECADCMD"):
        find_engine()



def test_the_installs_own_engine_is_found(tmp_path: pathlib.Path, monkeypatch) -> None:
    """The app carries the engine ✓ ✓ — so the app must be able to find **its own** ✓ ✓.

    The install bundles it ✓ ✓ (the geometry is the app's own ✓ ✓) ✓ ✓ — and the
    discovery looked only at the build machine's places ✓ ✓ · so the installed
    app could not find the two gigabytes it carries ✓ ✓ ✓.
    """
    monkeypatch.delenv("ARCHRES_FREECADCMD", raising=False)
    fake = tmp_path / "engine" / "bin" / "freecadcmd.exe"
    fake.parent.mkdir(parents=True)
    fake.write_bytes(b"")
    monkeypatch.setattr(
        "archres_core.cad.engine._install_engines", lambda: (fake,)
    )
    info = find_engine()
    assert info.path == fake
    assert info.source == "install"

def test_a_missing_engine_names_the_way_to_fix_it(monkeypatch) -> None:
    monkeypatch.delenv("ARCHRES_FREECADCMD", raising=False)
    monkeypatch.setattr(
        "archres_core.cad.engine.KNOWN_PATHS", (pathlib.Path("Z:/nowhere/freecadcmd.exe"),)
    )
    monkeypatch.setattr("archres_core.cad.engine.shutil.which", lambda _name: None)
    with pytest.raises(EngineMissing, match="ARCHRES_FREECADCMD"):
        find_engine()


def test_a_successful_run_reads_the_result(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    monkeypatch.setenv("FAKE_STATE", str(_state(tmp_path, {"result": _ok_result()})))
    outcome = _run(tmp_path, fake_launcher)
    assert outcome.code is None
    assert outcome.exit_code == 0
    assert outcome.result is not None
    assert outcome.result["objects"][0]["volumeM3"] == 0.675
    assert outcome.engine_version == "0.0.0"
    assert (tmp_path / "run" / "params.json").is_file()


def test_the_params_the_candidate_reads_are_the_job_payload(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    monkeypatch.setenv("FAKE_STATE", str(_state(tmp_path, {"result": _ok_result()})))
    _run(tmp_path, fake_launcher)
    written = json.loads((tmp_path / "run" / "params.json").read_text(encoding="utf-8"))
    assert written == {"kind": "geometry.build", "params": {}}


def test_a_candidate_error_is_data_not_a_harness_failure(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    result = _ok_result()
    result.update(
        {
            "status": "error",
            "errorCode": "engine_error",
            "errorType": "RuntimeError",
            "message": "Column_1 is missing",
            "traceback": "Traceback...\nRuntimeError: Column_1 is missing\n",
        }
    )
    monkeypatch.setenv("FAKE_STATE", str(_state(tmp_path, {"result": result})))
    outcome = _run(tmp_path, fake_launcher)
    assert outcome.code == "engine_error"
    assert "Column_1 is missing" in outcome.trace_text


def test_a_missing_result_is_reported_with_its_stderr(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    monkeypatch.setenv(
        "FAKE_STATE", str(_state(tmp_path, {"mode": "no-result", "stderr": "engine exploded"}))
    )
    outcome = _run(tmp_path, fake_launcher)
    assert outcome.code == "no_result"
    assert outcome.result_error == "result.json was not written"
    assert "engine exploded" in outcome.stderr


def test_a_hung_engine_is_killed_and_reported(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    monkeypatch.setenv(
        "FAKE_STATE",
        str(_state(tmp_path, {"result": _ok_result(), "sleep": 30, "stderr": "still working"})),
    )
    started = time.monotonic()
    outcome = _run(tmp_path, fake_launcher, timeout_ms=1_500)
    elapsed = time.monotonic() - started
    assert outcome.timed_out is True
    assert outcome.code == "timeout"
    assert "still working" in outcome.stderr  # the last words survive the kill
    assert elapsed < 20  # killed, not waited out


def test_a_stale_result_in_a_reused_workdir_is_not_mistaken_for_this_run(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    (tmp_path / "run").mkdir()
    stale = tmp_path / "run" / "result.json"
    stale.write_text(json.dumps(_ok_result()), encoding="utf-8")
    monkeypatch.setenv(
        "FAKE_STATE", str(_state(tmp_path, {"mode": "no-result", "stderr": "no result"}))
    )
    outcome = _run(tmp_path, fake_launcher)
    assert outcome.code == "no_result"
    assert not stale.exists()


def test_stale_artifacts_in_a_reused_workdir_are_cleared(
    tmp_path: pathlib.Path, fake_launcher: pathlib.Path, monkeypatch
) -> None:
    out = tmp_path / "run" / "out"
    out.mkdir(parents=True)
    (out / "old.json").write_text("{}", encoding="utf-8")
    monkeypatch.setenv(
        "FAKE_STATE", str(_state(tmp_path, {"result": _ok_result()})),
    )
    outcome = _run(tmp_path, fake_launcher)
    assert outcome.code is None
    assert not (out / "old.json").exists()
