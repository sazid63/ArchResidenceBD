"""Run one candidate CAD script headless, with a deadline, and read its measured result (W1.8).

A run is a **process**, so everything that can go wrong in a process is an outcome here,
not an exception the caller has to guess about: the engine can be missing, the candidate can
raise, the engine can hang, or it can die without writing anything. Each of those maps to a
distinct ``code`` so the verifier - and the repair traces W1.7 trains on - can name what
happened instead of printing "failed".

The candidate script is ours (a CAD generator or a fixture), never user input: CAD
generation is code, and this package is the boundary where that code is executed.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import time
from dataclasses import dataclass, field
from typing import Any

from .engine import EngineInfo

__all__ = ["RunOutcome", "run_candidate", "KILL_SLACK_S"]

LAUNCHER = pathlib.Path(__file__).with_name("launcher.py")

#: Extra seconds to wait for the killed engine to be reaped before giving up on it.
KILL_SLACK_S = 10.0


@dataclass(frozen=True)
class RunOutcome:
    """What one engine process did."""

    exit_code: int
    timed_out: bool
    duration_ms: float
    stdout: str
    stderr: str
    result: dict[str, Any] | None
    result_error: str | None
    code: str | None
    workdir: pathlib.Path
    engine_version: str | None = None

    @property
    def artifacts_dir(self) -> pathlib.Path:
        return self.workdir / "out"

    @property
    def trace_text(self) -> str:
        """The best trace we have: the engine's structured traceback, else its stderr."""
        if self.result and self.result.get("traceback"):
            return str(self.result["traceback"])
        return self.stderr


def _kill_tree(process: subprocess.Popen) -> None:
    """Kill the engine and any child it spawned; a hung engine must not outlive the run."""
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        # freecadcmd spawns no children for our jobs, but /T makes that a guarantee.
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(process.pid)],
            capture_output=True,
            check=False,
        )
    else:
        process.kill()
    try:
        process.communicate(timeout=KILL_SLACK_S)
    except subprocess.TimeoutExpired:  # pragma: no cover - a truly wedged process
        process.kill()


def run_candidate(
    engine: EngineInfo,
    candidate: str | pathlib.Path,
    params: dict[str, Any],
    workdir: str | pathlib.Path,
    *,
    timeout_ms: int = 60_000,
) -> RunOutcome:
    """Execute ``candidate`` in a fresh engine process and return its measured result.

    ``workdir`` is created (or reused) and receives ``params.json``, ``result.json`` and the
    candidate's artifacts under ``out/``. The caller owns ``workdir`` so a failed run can be
    inspected afterwards.
    """
    directory = pathlib.Path(workdir)
    directory.mkdir(parents=True, exist_ok=True)
    out_dir = directory / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    result_path = directory / "result.json"
    if result_path.exists():  # a reused directory must not hand us a stale result
        result_path.unlink()
    params_path = directory / "params.json"
    params_path.write_bytes(
        (json.dumps(params, ensure_ascii=False, indent=1, sort_keys=True) + "\n").encode("utf-8")
    )

    env = os.environ.copy()
    env.update(
        {
            "ARCHRES_CANDIDATE": str(pathlib.Path(candidate).resolve()),
            "ARCHRES_JOB_PARAMS": str(params_path.resolve()),
            "ARCHRES_JOB_OUT": str(result_path.resolve()),
            "ARCHRES_JOB_OUTDIR": str(out_dir.resolve()),
            # FreeCAD prints progress to stdout; keep it from interleaving with our own output.
            "PYTHONUNBUFFERED": "1",
        }
    )

    started = time.monotonic()
    process = subprocess.Popen(
        [str(engine.path), str(LAUNCHER.resolve())],
        cwd=str(directory),
        env=env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=max(timeout_ms, 1) / 1000.0)
    except subprocess.TimeoutExpired:
        timed_out = True
        _kill_tree(process)
        stdout, stderr = process.communicate()
    duration_ms = round((time.monotonic() - started) * 1000.0, 3)

    result: dict[str, Any] | None = None
    result_error: str | None = None
    if result_path.is_file():
        try:
            loaded = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            result_error = f"result.json could not be read: {exc}"
        else:
            if isinstance(loaded, dict):
                result = loaded
            else:
                result_error = f"result.json is a {type(loaded).__name__}, not an object"
    elif not timed_out:
        result_error = "result.json was not written"

    if timed_out:
        code: str | None = "timeout"
    elif result is None:
        code = "no_result"
    elif result.get("status") == "error":
        code = str(result.get("errorCode") or "engine_error")
    else:
        code = None

    return RunOutcome(
        exit_code=process.returncode if process.returncode is not None else -1,
        timed_out=timed_out,
        duration_ms=duration_ms,
        stdout=stdout or "",
        stderr=stderr or "",
        result=result,
        result_error=result_error,
        code=code,
        workdir=directory,
        engine_version=(result or {}).get("engineVersion"),
    )


def tail(text: str, limit: int = 4000) -> str:
    """Last ``limit`` characters of a stream, for messages and traces."""
    text = text.strip()
    if len(text) <= limit:
        return text
    return "…" + text[-limit:]
