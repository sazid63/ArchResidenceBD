"""The CAD worker pool (W2.1): spawn, dispatch, crash, restart, deadline, shutdown.

The pool's contract is engine-independent, so these tests drive a **stub worker** that speaks
the same XML-RPC protocol (``core/tests/stub_worker.py``) - no FreeCAD, no engine, fast and
deterministic in CI. The real engine path is the live probe in ``tools/cad/pool_probe.py``.
"""

from __future__ import annotations

import pathlib
import sys
import threading
import time

import pytest

from archres_core.cad.pool import PoolError, WorkerConfig, WorkerPool

ROOT = pathlib.Path(__file__).resolve().parents[2]
STUB = pathlib.Path(__file__).with_name("stub_worker.py")
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"


def _pool(tmp_path: pathlib.Path, workers: int = 2) -> WorkerPool:
    pool = WorkerPool(
        WorkerConfig(
            command=[sys.executable, str(STUB)],
            launcher_path=LAUNCHER,
            workdir=tmp_path / "work",
        ),
        workers=workers,
        start_timeout_s=30.0,
        watchdog_interval_s=0.2,
        restart_backoff_s=0.05,
        call_timeout_s=2.0,
    )
    pool.start()
    return pool


def test_a_started_pool_has_ready_workers(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path)
    try:
        stats = pool.stats()
        assert len(stats) == 2
        assert all(entry["ready"] for entry in stats)
        assert len({entry["port"] for entry in stats}) == 2, "each worker owns its own port"
        assert all(entry["engine"]["name"] == entry["name"] for entry in stats)
        assert all(entry["engine"]["jobs"] == 0 for entry in stats)
    finally:
        pool.stop()


def test_a_job_returns_the_frozen_result_shape(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path, workers=1)
    try:
        result = pool.submit(
            kind="geometry.build",
            params={"script": "print('hello')", "scriptParams": {"pads": 1}},
            job_id="job-1",
        )
        assert result["messageType"] == "job.result"
        assert result["protocolVersion"] == "0.1.0"
        assert result["jobId"] == "job-1"
        assert result["kind"] == "geometry.build"
        assert result["status"] == "ok"
        assert result["artifacts"], "a job must return its artifacts"
        artifact = result["artifacts"][0]
        assert artifact["name"] == "geometry.json"
        assert artifact["kind"] == "json"
        assert len(artifact["sha256"]) == 64
        assert result["metrics"]["durationMs"] >= 0
    finally:
        pool.stop()


def test_two_workers_serve_in_parallel(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path, workers=2)
    results: list[dict] = []
    errors: list[Exception] = []

    def run(index: int) -> None:
        try:
            results.append(pool.submit(kind="geometry.build", params={"script": "pass"}))
        except Exception as exc:  # noqa: BLE001 - the test reports it
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(index,)) for index in range(2)]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        assert not errors, errors
        assert len(results) == 2
        assert all(item["status"] == "ok" for item in results)
    finally:
        pool.stop()


def test_a_worker_that_dies_mid_job_fails_the_job_cleanly(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path, workers=1)
    try:
        result = pool.submit(kind="geometry.build", params={"script": "CRASH_WORKER"})
        assert result["status"] == "error"
        assert result["error"]["code"] == "worker_restarted"
        assert result["artifacts"] == []
        # The pool replaces the dead worker, so the next job is served again.
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            follow_up = pool.submit(kind="geometry.build", params={"script": "pass"})
            if follow_up["status"] == "ok":
                break
            time.sleep(0.2)
        assert follow_up["status"] == "ok", follow_up
        assert pool.stats()[0]["restarts"] >= 1
    finally:
        pool.stop()


def test_a_job_that_outlives_its_deadline_is_a_timeout(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path, workers=1)
    try:
        result = pool.submit(
            {
                "messageType": "job.request",
                "protocolVersion": "0.1.0",
                "jobId": "job-hang",
                "kind": "geometry.build",
                "params": {"script": "HANG_WORKER"},
                "deadlineMs": 1500,
            }
        )
        assert result["status"] == "error"
        assert result["error"]["code"] == "timeout"
        assert result["jobId"] == "job-hang"
    finally:
        pool.stop()


def test_the_watchdog_restarts_a_worker_that_dies_while_idle(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path, workers=1)
    try:
        victim = pool.workers[0]
        assert victim.process is not None
        victim.process.kill()
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            snapshot = pool.stats()[0]
            if snapshot["ready"] and (snapshot["restarts"] or 0) >= 1:
                break
            time.sleep(0.2)
        entry = pool.stats()[0]
        assert not pool.watchdog_error, pool.watchdog_error
        assert entry["ready"] is True, entry
        assert not entry["lastError"], entry
        assert entry["restarts"] >= 1, entry
        assert pool.submit(kind="geometry.build", params={"script": "pass"})["status"] == "ok"
    finally:
        pool.stop()


def test_stopping_the_pool_closes_every_worker(tmp_path: pathlib.Path) -> None:
    pool = _pool(tmp_path, workers=2)
    processes = [worker.process for worker in pool.workers]
    pool.stop()
    for process in processes:
        assert process is not None
        assert process.poll() is not None, "a worker was left running after stop()"


def test_a_pool_that_cannot_start_says_so(tmp_path: pathlib.Path) -> None:
    pool = WorkerPool(
        WorkerConfig(
            command=[sys.executable, "-c", "raise SystemExit(3)"],
            launcher_path=LAUNCHER,
            workdir=tmp_path / "work",
        ),
        workers=1,
        start_timeout_s=10.0,
        call_timeout_s=1.0,
    )
    with pytest.raises(PoolError, match="exited"):
        pool.start()
    pool.stop()
