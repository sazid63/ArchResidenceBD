"""In-engine CAD worker (W2.1): the persistent FreeCAD process behind the job protocol.

This file runs **inside** the CAD engine (``freecadcmd worker.py``), not in the app. It serves
the frozen job protocol (plan Appendix C, W0.9) on stdlib XML-RPC over loopback:

- ``ping()``    -> readiness (the app polls this; readiness is never scraped from stdout)
- ``stats()``   -> jobs served, last duration, uptime
- ``job(req)``  -> the frozen ``JobResult`` for one ``JobRequest``
- ``shutdown()``-> a clean exit acknowledgement

The worker is **single-threaded on purpose**: FreeCAD is not thread-safe, so jobs serialise
inside a worker and parallelism comes from running several workers (spike S4). Every job runs
in a **fresh document**, so a crash loses nothing and the app can resubmit.

The measurement is not re-implemented here: the worker loads the W1.8 launcher module
(``ARCHRES_LAUNCHER_PATH``) and calls its ``execute()``, so the numbers a worker returns and the
numbers the W1.8 harness measures are the same code path.

Environment (all set by the pool at spawn):

===========================  ==========================================================
``ARCHRES_WORKER_PORT``      loopback port to bind (the pool picks a free one)
``ARCHRES_WORKER_ID``        worker name, e.g. ``cad-1``
``ARCHRES_LAUNCHER_PATH``    absolute path of the W1.8 launcher module to load
``ARCHRES_WORKER_WORKDIR``   scratch root for per-job directories
===========================  ==========================================================

FreeCAD quirk (spike S4): ``freecadcmd`` sets ``__name__`` to the *file stem*, so a script must
not rely on ``if __name__ == "__main__"``. The server starts at module level.
"""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import socket
import sys
import threading
import time
import traceback
import xmlrpc.client
import xmlrpc.server

PROTOCOL_VERSION = "0.1.0"
JOB_KINDS = ("geometry.build", "drawing.sheet", "rebar.build")
IMPLEMENTED_KINDS = ("geometry.build",)
ERROR_CODES = ("invalid_params", "worker_down", "worker_restarted", "timeout", "engine_error", "internal")

#: The measurement result travels as a JSON artifact: the frozen JobResult has no free-form
#: metrics field (plan Appendix C, W0.9), so the app reads the numbers from the artifact.
GEOMETRY_ARTIFACT = "geometry.json"


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name)
    if value:
        return value
    if default is not None:
        return default
    raise RuntimeError(f"missing environment variable {name}")


def _load_launcher():
    """Load the W1.8 launcher module by path (it is not on the engine's import path)."""
    path = pathlib.Path(_env("ARCHRES_LAUNCHER_PATH")).resolve()
    spec = importlib.util.spec_from_file_location("archres_cad_launcher", path)
    if not spec or not spec.loader:
        raise RuntimeError(f"cannot load the launcher module at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_LAUNCHER = None


def launcher():
    """The W1.8 launcher module, loaded once (lazily, so this module stays importable)."""
    global _LAUNCHER
    if _LAUNCHER is None:
        _LAUNCHER = _load_launcher()
    return _LAUNCHER


def _now_ms() -> float:
    return round(time.monotonic() * 1000.0, 3)


def _engine_version() -> str:
    try:
        import FreeCAD  # noqa: PLC0415 - only exists inside the engine

        return ".".join(str(part) for part in FreeCAD.Version()[:3])
    except Exception:  # pragma: no cover - the engine is always there in production
        return "unknown"


class Worker:
    """One persistent engine process serving the job protocol."""

    def __init__(self) -> None:
        self.name = _env("ARCHRES_WORKER_ID", "cad-worker")
        self.port = int(_env("ARCHRES_WORKER_PORT", "0"))
        self.workdir = pathlib.Path(_env("ARCHRES_WORKER_WORKDIR", ".")).resolve()
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.engine_version = _engine_version()
        self.started = time.monotonic()
        self.jobs = 0
        self.last_ms: float | None = None
        self.pid = os.getpid()

    # -- control plane ---------------------------------------------------
    def ping(self) -> dict:
        return {
            "name": self.name,
            "pid": self.pid,
            "engineVersion": self.engine_version,
            "port": self.port,
            "uptimeS": round(time.monotonic() - self.started, 3),
        }

    def stats(self) -> dict:
        payload = {
            "name": self.name,
            "pid": self.pid,
            "jobs": self.jobs,
            "uptimeS": round(time.monotonic() - self.started, 3),
        }
        if self.last_ms is not None:
            payload["lastMs"] = self.last_ms
        return payload

    # -- data plane ------------------------------------------------------
    def job(self, request: dict) -> dict:
        started = _now_ms()
        job_id = str(request.get("jobId") or "")
        kind = str(request.get("kind") or "")
        params = request.get("params") or {}
        try:
            result = self._run(request, kind, params)
        except Exception as exc:  # noqa: BLE001 - a worker must never die on one job
            result = self._error(job_id, kind, "internal", f"{type(exc).__name__}: {exc}")
        result["metrics"] = {"durationMs": round(_now_ms() - started, 3)}
        self.jobs += 1
        self.last_ms = result["metrics"]["durationMs"]
        return result

    def _error(self, job_id: str, kind: str, code: str, message: str, detail: str = "") -> dict:
        error = {"code": code, "message": message}
        if detail:
            error["detail"] = detail
        return {
            "messageType": "job.result",
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id,
            "kind": kind if kind in JOB_KINDS else "geometry.build",
            "status": "error",
            "artifacts": [],
            "warnings": [],
            "error": error,
        }

    def _run(self, request: dict, kind: str, params: dict) -> dict:
        job_id = str(request.get("jobId") or "")
        if request.get("messageType") != "job.request":
            return self._error(job_id, kind, "invalid_params", "messageType must be job.request")
        if request.get("protocolVersion") != PROTOCOL_VERSION:
            return self._error(
                job_id, kind, "invalid_params", f"protocolVersion must be {PROTOCOL_VERSION}"
            )
        if kind not in JOB_KINDS:
            return self._error(job_id, kind, "invalid_params", f"unknown job kind {kind!r}")
        if kind not in IMPLEMENTED_KINDS:
            return self._error(
                job_id,
                kind,
                "invalid_params",
                f"job kind {kind!r} is not implemented by this worker yet "
                f"(implemented: {', '.join(IMPLEMENTED_KINDS)})",
            )
        script = params.get("script")
        if not isinstance(script, str) or not script.strip():
            return self._error(
                job_id, kind, "invalid_params", "params.script must be the macro source to run"
            )

        job_dir = self.workdir / job_id
        out_dir = job_dir / "out"
        out_dir.mkdir(parents=True, exist_ok=True)
        candidate = job_dir / "candidate.py"
        candidate.write_text(script, encoding="utf-8", newline="\n")
        script_params = params.get("scriptParams")
        if not isinstance(script_params, dict):
            script_params = {}
        # The candidate reads its parameters from the same environment contract the W1.8
        # harness uses (ARCHRES_JOB_PARAMS / ARCHRES_JOB_OUTDIR), so one macro works on both
        # hosts: the one-shot launcher and the persistent worker.
        params_file = job_dir / "params.json"
        params_file.write_text(
            json.dumps({"kind": kind, "params": script_params}, ensure_ascii=False, indent=1,
                       sort_keys=True)
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
        os.environ["ARCHRES_JOB_PARAMS"] = str(params_file)
        os.environ["ARCHRES_JOB_OUTDIR"] = str(out_dir)

        measured = launcher().execute(candidate, out_dir, {"kind": kind, "params": script_params})
        payload = {
            "status": measured.get("status", "ok"),
            "engineVersion": measured.get("engineVersion") or self.engine_version,
            "objects": measured.get("objects") or [],
            "documentObjects": measured.get("documentObjects") or [],
            "params": measured.get("params") or {},
            "errorType": measured.get("errorType"),
            "message": measured.get("message"),
            "traceback": measured.get("traceback"),
            "frames": measured.get("frames") or [],
        }
        (out_dir / GEOMETRY_ARTIFACT).write_text(
            json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        artifacts = []
        for item in launcher()._artifacts(out_dir):  # noqa: SLF001 - same module, one implementation
            artifacts.append(
                {
                    "name": item["name"],
                    "kind": "json" if item["name"].endswith(".json") else "text",
                    "mediaType": "application/json" if item["name"].endswith(".json") else "text/plain",
                    "sizeBytes": max(1, int(item["sizeBytes"])),
                    "sha256": item["sha256"],
                    "path": item["name"],
                }
            )
        warnings = [str(item) for item in measured.get("warnings") or []]
        if payload["status"] == "error":
            error = {
                "code": "engine_error",
                "message": str(payload.get("message") or "the candidate raised"),
            }
            detail = payload.get("traceback") or ""
            if detail:
                error["detail"] = detail[:2000]
            return {
                "messageType": "job.result",
                "protocolVersion": PROTOCOL_VERSION,
                "jobId": job_id,
                "kind": kind,
                "status": "error",
                "artifacts": artifacts,
                "warnings": warnings,
                "error": error,
            }
        return {
            "messageType": "job.result",
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id,
            "kind": kind,
            "status": "ok",
            "artifacts": artifacts,
            "warnings": warnings,
        }


class _Handler(xmlrpc.server.SimpleXMLRPCRequestHandler):
    """Quiet handler: the engine's stdout is not the app's log."""

    def log_message(self, fmt, *args):  # noqa: A003 - the base class names it this way
        return


def _serve() -> None:
    worker = Worker()
    server = xmlrpc.server.SimpleXMLRPCServer(
        ("127.0.0.1", worker.port), requestHandler=_Handler, allow_none=True, logRequests=False
    )
    server.register_introspection_functions()
    server.register_function(worker.ping, "ping")
    server.register_function(worker.stats, "stats")
    server.register_function(worker.job, "job")

    def shutdown() -> dict:
        # The reply has to reach the app before the process goes away, and `server.shutdown()`
        # cannot be called from inside a request handler (it waits for the serve loop, which is
        # busy running this handler). The exit is therefore detached and slightly delayed
        # (spike S4 used the same shape).
        def _exit_soon() -> None:
            time.sleep(0.05)
            os._exit(0)

        threading.Thread(target=_exit_soon, daemon=True).start()
        return {"ok": True, "name": worker.name, "pid": worker.pid}

    server.register_function(shutdown, "shutdown")
    worker.port = server.server_address[1]
    print(f"[cad-worker] {worker.name} listening on 127.0.0.1:{worker.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if os.environ.get("ARCHRES_WORKER_PORT"):
    # freecadcmd sets __name__ to the file stem, so `__name__ == "__main__"` never fires
    # (spike S4). The module-level guard on the spawn environment is what actually starts the
    # server - and it keeps this module importable for tests.
    try:
        _serve()
    except Exception:  # pragma: no cover - the pool reports the death
        traceback.print_exc()
        sys.exit(1)
