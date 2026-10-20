"""A stand-in CAD worker: the same XML-RPC contract, no CAD engine (W2.1 tests).

The real worker (``cad/worker/worker.py``) runs inside FreeCAD. The pool's contract - spawn,
ping, dispatch, crash, restart, deadline - is engine-independent, so the tests drive a stub that
speaks the same protocol and can be told to misbehave:

- a script containing ``CRASH_WORKER`` kills the process mid-job (a crash the pool must
  survive and report as ``worker_restarted``);
- a script containing ``HANG_WORKER`` never returns (a deadline the pool must enforce);
- anything else "measures" a deterministic shape and answers with the frozen result shape.
"""

from __future__ import annotations

import json
import os
import pathlib
import threading
import time
import xmlrpc.server

PROTOCOL_VERSION = "0.1.0"
GEOMETRY_ARTIFACT = "geometry.json"


def _now_ms() -> float:
    return round(time.monotonic() * 1000.0, 3)


class StubWorker:
    def __init__(self) -> None:
        self.name = os.environ.get("ARCHRES_WORKER_ID", "stub")
        self.port = int(os.environ.get("ARCHRES_WORKER_PORT", "0"))
        self.workdir = pathlib.Path(os.environ.get("ARCHRES_WORKER_WORKDIR", ".")).resolve()
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.started = time.monotonic()
        self.jobs = 0
        self.last_ms: float | None = None

    def ping(self) -> dict:
        return {
            "name": self.name,
            "pid": os.getpid(),
            "engineVersion": "stub-0.0.0",
            "port": self.port,
            "uptimeS": round(time.monotonic() - self.started, 3),
        }

    def stats(self) -> dict:
        payload = {
            "name": self.name,
            "pid": os.getpid(),
            "jobs": self.jobs,
            "uptimeS": round(time.monotonic() - self.started, 3),
        }
        if self.last_ms is not None:
            payload["lastMs"] = self.last_ms
        return payload

    def job(self, request: dict) -> dict:
        started = _now_ms()
        script = str((request.get("params") or {}).get("script") or "")
        if "CRASH_WORKER" in script:
            os._exit(9)
        if "HANG_WORKER" in script:
            time.sleep(3600)
        job_id = str(request.get("jobId") or "")
        job_dir = self.workdir / job_id
        out_dir = job_dir / "out"
        out_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            "status": "ok",
            "engineVersion": "stub-0.0.0",
            "objects": [{"name": "Pad_1", "volumeM3": 0.432, "bboxMm": [1.2, 1.2, 0.3]}],
            "documentObjects": ["Pad_1"],
        }
        (out_dir / GEOMETRY_ARTIFACT).write_text(
            json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        artifacts = []
        for path in sorted(out_dir.rglob("*")):
            if not path.is_file():
                continue
            data = path.read_bytes()
            import hashlib

            artifacts.append(
                {
                    "name": path.relative_to(out_dir).as_posix(),
                    "kind": "json",
                    "mediaType": "application/json",
                    "sizeBytes": max(1, len(data)),
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "path": path.relative_to(out_dir).as_posix(),
                }
            )
        self.jobs += 1
        self.last_ms = round(_now_ms() - started, 3)
        return {
            "messageType": "job.result",
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id,
            "kind": str(request.get("kind") or "geometry.build"),
            "status": "ok",
            "artifacts": artifacts,
            "warnings": [],
            "metrics": {"durationMs": self.last_ms},
        }


class _Handler(xmlrpc.server.SimpleXMLRPCRequestHandler):
    def log_message(self, fmt, *args):  # noqa: A003
        return


def serve() -> None:
    worker = StubWorker()
    server = xmlrpc.server.SimpleXMLRPCServer(
        ("127.0.0.1", worker.port), requestHandler=_Handler, allow_none=True, logRequests=False
    )
    server.register_function(worker.ping, "ping")
    server.register_function(worker.stats, "stats")
    server.register_function(worker.job, "job")

    def shutdown() -> dict:
        # The reply must reach the app before the process exits, and `server.shutdown()`
        # cannot be called from inside a request handler (it waits for the serve loop, which is
        # running this handler). The exit is detached and slightly delayed.
        def _exit_soon() -> None:
            time.sleep(0.05)
            os._exit(0)

        threading.Thread(target=_exit_soon, daemon=True).start()
        return {"ok": True}

    server.register_function(shutdown, "shutdown")
    worker.port = server.server_address[1]
    print(f"[stub-worker] {worker.name} on 127.0.0.1:{worker.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if os.environ.get("ARCHRES_WORKER_PORT"):
    serve()
