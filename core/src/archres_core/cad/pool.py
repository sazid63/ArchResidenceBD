"""The CAD worker pool (W2.1): persistent, isolated FreeCAD workers behind the job protocol.

The pool is the app side of the frozen job contract (``spec/schemas/job-protocol.schema.json``,
``docs/spec/interfaces-v0.md`` §1). It owns everything the spike S4 measured and the product
needs:

- **two isolated workers** by default, each on its own free loopback port (no hardcoded ports);
- a **watchdog** that pings every worker at least once a second - the primary crash detector,
  because a dead worker only surfaces to a client ~2 s after death on Windows loopback;
- **restart with backoff** after a crash, and a clean, client-synthesised error for the job that
  was in flight (``worker_restarted`` / ``worker_down``), never a hang;
- **per-job deadlines** (client side, always set) with the frozen per-kind defaults;
- a **clean shutdown** of every worker.

Jobs are stateless (a fresh document per job inside the worker), so a crash costs nothing but
the job: the app resubmits it. The pool never fabricates a result - a worker that cannot answer
produces an explicit error the app can see (plan §9: no silent gaps).
"""

from __future__ import annotations

import http.client
import os
import pathlib
import socket
import subprocess
import threading
import time
import uuid
import xmlrpc.client
from dataclasses import dataclass, field
from typing import Any

PROTOCOL_VERSION = "0.1.0"
JOB_KINDS = ("geometry.build", "drawing.sheet", "rebar.build")
#: Frozen per-kind deadline defaults (interfaces §1). The client ALWAYS sets a deadline.
DEADLINE_DEFAULTS = {
    "geometry.build": 30_000,
    "drawing.sheet": 120_000,
    "rebar.build": 60_000,
}


class PoolError(RuntimeError):
    """The pool could not serve a job (spawn, readiness or dispatch failed)."""


class _TimeoutTransport(xmlrpc.client.Transport):
    """XML-RPC transport with a client-side timeout (stdlib only)."""

    def __init__(self, timeout: float) -> None:
        super().__init__()
        self.timeout = timeout

    def make_connection(self, host):  # noqa: ANN001 - the base class is untyped
        chost, self._extra_headers, _x509 = self.get_host_info(host)
        self._connection = host, http.client.HTTPConnection(chost, timeout=self.timeout)
        return self._connection[1]


def _free_port() -> int:
    """Pick a free loopback port (the product never hardcodes ports - S4 carry-forward)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@dataclass
class WorkerConfig:
    """How to start one worker."""

    command: list[str]
    launcher_path: pathlib.Path
    workdir: pathlib.Path
    env: dict[str, str] = field(default_factory=dict)


@dataclass
class _Worker:
    name: str
    port: int
    process: subprocess.Popen | None = None
    ready: bool = False
    busy: bool = False
    restarts: int = 0
    last_error: str = ""

    def proxy(self, timeout: float) -> xmlrpc.client.ServerProxy:
        transport = _TimeoutTransport(timeout)
        return xmlrpc.client.ServerProxy(
            f"http://127.0.0.1:{self.port}/", transport=transport, allow_none=True
        )


class WorkerPool:
    """Two or more persistent engine workers, supervised."""

    def __init__(
        self,
        config: WorkerConfig,
        *,
        workers: int = 2,
        start_timeout_s: float = 60.0,
        watchdog_interval_s: float = 1.0,
        restart_backoff_s: float = 0.5,
        max_restarts: int = 5,
        call_timeout_s: float = 5.0,
    ) -> None:
        self.config = config
        self.worker_count = max(1, int(workers))
        self.start_timeout_s = start_timeout_s
        self.watchdog_interval_s = watchdog_interval_s
        self.restart_backoff_s = restart_backoff_s
        self.max_restarts = max_restarts
        self.call_timeout_s = call_timeout_s
        self.workers: list[_Worker] = []
        self._lock = threading.Condition()
        self._watchdog: threading.Thread | None = None
        self._stopping = False
        self._spawns = 0
        self._watchdog_error = ""
        self._artifacts_by_job: dict[str, dict[str, pathlib.Path]] = {}

    # -- lifecycle -------------------------------------------------------
    def start(self) -> None:
        """Spawn every worker and wait until it answers a ping."""
        self.config.workdir.mkdir(parents=True, exist_ok=True)
        for index in range(self.worker_count):
            self.workers.append(self._spawn(f"cad-{index + 1}"))
        for worker in self.workers:
            self._wait_ready(worker)
        self._stopping = False
        self._watchdog = threading.Thread(target=self._watchdog_loop, name="cad-watchdog", daemon=True)
        self._watchdog.start()

    def _spawn(self, name: str) -> _Worker:
        self._spawns += 1
        port = _free_port()
        worker = _Worker(name=name, port=port)
        env = os.environ.copy()
        env.update(
            {
                "ARCHRES_WORKER_PORT": str(port),
                "ARCHRES_WORKER_ID": name,
                "ARCHRES_LAUNCHER_PATH": str(self.config.launcher_path.resolve()),
                "ARCHRES_WORKER_WORKDIR": str((self.config.workdir / name).resolve()),
                "PYTHONUNBUFFERED": "1",
            }
        )
        env.update(self.config.env)
        log_path = self.config.workdir / f"worker-{name}-{self._spawns}.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handle = log_path.open("wb")
        try:
            worker.process = subprocess.Popen(  # noqa: S603 - the command is our own
                self.config.command,
                env=env,
                stdout=handle,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
            )
        finally:
            handle.close()
        return worker

    def _wait_ready(self, worker: _Worker) -> None:
        deadline = time.monotonic() + self.start_timeout_s
        while time.monotonic() < deadline:
            try:
                reply = worker.proxy(self.call_timeout_s).ping()
                if reply and reply.get("name"):
                    worker.ready = True
                    return
            except Exception:  # noqa: BLE001 - not up yet
                pass
            if worker.process is not None and worker.process.poll() is not None:
                raise PoolError(
                    f"{worker.name}: the worker exited with code {worker.process.returncode} "
                    "before it became ready"
                )
            time.sleep(0.1)
        raise PoolError(f"{worker.name}: the worker did not become ready in {self.start_timeout_s}s")

    def stop(self) -> None:
        """Shut every worker down cleanly, then make sure nothing is left running."""
        with self._lock:
            self._stopping = True
        watchdog = self._watchdog
        if watchdog is not None:
            watchdog.join(timeout=5.0)
            self._watchdog = None
        for worker in self.workers:
            self._shutdown_worker(worker)

    def _shutdown_worker(self, worker: _Worker) -> None:
        process = worker.process
        if process is None:
            return
        try:
            worker.proxy(self.call_timeout_s).shutdown()
        except Exception:  # noqa: BLE001 - the worker may already be gone
            pass
        try:
            process.wait(timeout=5.0)
        except subprocess.TimeoutExpired:
            process.kill()
            try:
                process.wait(timeout=5.0)
            except subprocess.TimeoutExpired:  # pragma: no cover - a killed process is gone
                pass
        worker.ready = False
        worker.busy = False

    # -- watchdog --------------------------------------------------------
    def _watchdog_loop(self) -> None:
        while True:
            with self._lock:
                if self._stopping:
                    return
            try:
                self._watchdog_tick()
            except Exception as exc:  # noqa: BLE001 - a supervisor that dies silently is a trap
                self._watchdog_error = f"{type(exc).__name__}: {exc}"
            time.sleep(self.watchdog_interval_s)

    def _watchdog_tick(self) -> None:
        for worker in list(self.workers):
            if worker.process is not None and worker.process.poll() is not None:
                self._handle_death(worker, "the worker process exited")
                continue
            if not worker.ready or worker.busy:
                # A busy worker is serving a job: the engine is single-threaded, so a ping
                # would not be answered until the job is done - and a job that outruns its
                # deadline is the *job's* contract, not the watchdog's. Only an idle worker
                # is pinged, so a stuck job cannot be mistaken for a dead worker.
                continue
            try:
                worker.proxy(self.call_timeout_s).ping()
            except Exception as exc:  # noqa: BLE001 - a dead worker is data, not a crash
                if worker.busy:
                    # The worker picked up a job while the ping was in flight, and the
                    # single-threaded engine could not answer it. That is a busy worker,
                    # not a dead one - the job's own deadline governs it.
                    continue
                self._handle_death(worker, f"ping failed: {type(exc).__name__}")

    def _handle_death(self, worker: _Worker, reason: str) -> None:
        worker.ready = False
        worker.busy = False
        worker.last_error = reason
        if self._stopping:
            return
        if worker.restarts >= self.max_restarts:
            worker.last_error = f"{reason} (restart limit {self.max_restarts} reached)"
            return
        worker.restarts += 1
        time.sleep(self.restart_backoff_s * worker.restarts)
        try:
            self._kill(worker)
            replacement = self._spawn(worker.name)
            replacement.restarts = worker.restarts
            self._wait_ready(replacement)
            with self._lock:
                self.workers[self.workers.index(worker)] = replacement
        except Exception as exc:  # noqa: BLE001 - a failed restart is recorded, not hidden
            worker.last_error = f"{reason}; restart failed: {type(exc).__name__}: {exc}"

    def _kill(self, worker: _Worker) -> None:
        process = worker.process
        if process is None:
            return
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run(  # noqa: S603, S607 - our own pid
                    ["taskkill", "/F", "/T", "/PID", str(process.pid)],
                    capture_output=True,
                    check=False,
                )
            else:
                process.kill()
        try:
            process.wait(timeout=5.0)
        except subprocess.TimeoutExpired:  # pragma: no cover
            pass
        worker.process = None

    # -- dispatch --------------------------------------------------------
    def submit(self, request: dict[str, Any] | None = None, *, kind: str = "geometry.build",
               params: dict[str, Any] | None = None, job_id: str | None = None) -> dict[str, Any]:
        """Run one job and return the frozen ``JobResult`` (never raises for engine failures)."""
        payload = self._envelope(request, kind=kind, params=params, job_id=job_id)
        deadline_ms = int(payload["deadlineMs"])
        try:
            worker = self._claim_worker()
        except PoolError as exc:
            return self._client_error(payload, "worker_down", str(exc))
        try:
            result = self._call(worker, payload, timeout_s=deadline_ms / 1000.0)
            self._remember_artifacts(worker, payload, result)
        except _WorkerGone as exc:
            self._handle_death(worker, str(exc))
            return self._client_error(payload, "worker_restarted", str(exc))
        except _JobTimeout as exc:
            # The engine cannot be interrupted safely, so the worker is poisoned and replaced;
            # the job is lost, not silently continued.
            self._handle_death(worker, f"the job exceeded its deadline: {exc}")
            return self._client_error(payload, "timeout", str(exc))
        finally:
            with self._lock:
                worker.busy = False
                self._lock.notify_all()
        return result

    def _envelope(
        self,
        request: dict[str, Any] | None,
        *,
        kind: str,
        params: dict[str, Any] | None,
        job_id: str | None,
    ) -> dict[str, Any]:
        if request is not None:
            payload = dict(request)
            payload.setdefault("messageType", "job.request")
            payload.setdefault("protocolVersion", PROTOCOL_VERSION)
            payload.setdefault("jobId", job_id or str(uuid.uuid4()))
            payload.setdefault("kind", kind)
            payload.setdefault("params", params or {})
            payload.setdefault(
                "deadlineMs", DEADLINE_DEFAULTS.get(payload.get("kind", kind), 30_000)
            )
            return payload
        return {
            "messageType": "job.request",
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": job_id or str(uuid.uuid4()),
            "kind": kind,
            "params": params or {},
            "deadlineMs": DEADLINE_DEFAULTS.get(kind, 30_000),
        }

    def _claim_worker(self) -> _Worker:
        with self._lock:
            deadline = time.monotonic() + self.start_timeout_s
            while True:
                for worker in self.workers:
                    if worker.ready and not worker.busy:
                        worker.busy = True
                        return worker
                if self._stopping:
                    raise PoolError("the pool is shutting down")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise PoolError("no worker became free in time")
                self._lock.wait(min(remaining, 0.5))

    def _call(self, worker: _Worker, payload: dict[str, Any], *, timeout_s: float) -> dict[str, Any]:
        proxy = worker.proxy(timeout_s)
        started = time.monotonic()
        try:
            result = proxy.job(payload)
        except socket.timeout as exc:
            raise _JobTimeout(str(exc)) from exc
        except (ConnectionError, OSError, xmlrpc.client.Fault, xmlrpc.client.ProtocolError) as exc:
            # The XML-RPC transport turns a socket timeout into a ProtocolError, so the
            # deadline - not the exception type - decides whether the worker died or the job
            # simply ran out of time. A worker that refuses the connection fails fast.
            elapsed = time.monotonic() - started
            if elapsed >= timeout_s * 0.9:
                raise _JobTimeout(f"the job did not answer within {timeout_s:.1f}s") from exc
            raise _WorkerGone(f"{type(exc).__name__}: {exc}") from exc
        if not isinstance(result, dict):
            raise _WorkerGone(f"the worker returned {type(result).__name__}, not a job result")
        return result

    def _client_error(
        self, payload: dict[str, Any], code: str, message: str
    ) -> dict[str, Any]:
        return {
            "messageType": "job.result",
            "protocolVersion": PROTOCOL_VERSION,
            "jobId": payload.get("jobId", ""),
            "kind": payload.get("kind", "geometry.build"),
            "status": "error",
            "artifacts": [],
            "warnings": [],
            "error": {"code": code, "message": message},
        }

    def _remember_artifacts(
        self, worker: _Worker, payload: dict[str, Any], result: dict[str, Any]
    ) -> None:
        """Remember where the job's artifacts landed, so the app can read them back.

        The wire result carries the artifact *name* and hash; the bytes stay in the worker's
        per-job output directory until the app moves them into the project store (the job
        protocol says exactly that).
        """
        job_id = str(payload.get("jobId") or "")
        out_dir = self.config.workdir / worker.name / job_id / "out"
        paths: dict[str, pathlib.Path] = {}
        for artifact in result.get("artifacts") or []:
            name = str(artifact.get("name") or "")
            if name:
                paths[name] = out_dir / name
        if paths:
            self._artifacts_by_job[job_id] = paths

    def artifact_path(self, job_id: str, name: str) -> pathlib.Path | None:
        """Where an artifact of a finished job landed (None when the job had none)."""
        return self._artifacts_by_job.get(str(job_id), {}).get(name)

    # -- introspection ---------------------------------------------------
    @property
    def watchdog_error(self) -> str:
        """The last error the supervisor thread hit (empty when it is healthy)."""
        return self._watchdog_error

    def stats(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for worker in self.workers:
            entry = {
                "name": worker.name,
                "port": worker.port,
                "ready": worker.ready,
                "busy": worker.busy,
                "restarts": worker.restarts,
                "lastError": worker.last_error,
                "pid": worker.process.pid if worker.process is not None else None,
            }
            if worker.ready:
                try:
                    reply = worker.proxy(self.call_timeout_s).stats()
                    entry["engine"] = reply
                except Exception as exc:  # noqa: BLE001 - stats are best effort
                    entry["engineError"] = f"{type(exc).__name__}: {exc}"
            out.append(entry)
        return out


class _WorkerGone(RuntimeError):
    """The worker could not answer: it is presumed dead."""


class _JobTimeout(RuntimeError):
    """The job did not finish inside its client-side deadline."""
