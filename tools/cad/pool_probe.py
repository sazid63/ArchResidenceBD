"""Live probe for the CAD worker pool (W2.1): two real FreeCAD workers, one crash.

The pool's contract is engine-independent, so the unit tests drive a stub. This probe drives
the **real engine** and measures what the interfaces doc promises:

1. two workers start, each on its own free port, and answer a ping;
2. the same geometry job on both workers produces **identical measurements** (determinism
   across workers - plan §9, "identical outputs");
3. a worker killed **mid-job** fails that job with the clean code ``worker_restarted`` while
   the other worker keeps serving;
4. the pool replaces the dead worker and serves the next job again;
5. every worker is closed cleanly at the end.

Usage (from the repo root):
  uv run --directory core python ../tools/cad/pool_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/pool_probe.py --engine "<freecadcmd>" \
      --json "C:\\...\\data\\tmp\\pool-probe.json"

Exit codes: 0 = every check passed; 1 = a check failed.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
CANDIDATE = ROOT / "tools" / "cad" / "candidates" / "geometry_build.py"

SCRIPT_PARAMS = {"pads": 1, "columnsPerPad": 1, "padMm": [1200, 1200, 300], "columnMm": [300, 300, 2700]}


def _measurement(result: dict) -> dict:
    """The measured geometry the worker returned (from its JSON artifact)."""
    for artifact in result.get("artifacts") or []:
        if artifact.get("name") == "geometry.json":
            return {"sha256": artifact["sha256"], "sizeBytes": artifact["sizeBytes"]}
    return {}


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Live probe of the CAD worker pool.")
    parser.add_argument("--engine", required=True, help="freecadcmd path")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--workdir", default=str(ROOT / "data" / "tmp" / "pool-probe"))
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1
    workdir = pathlib.Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    script = CANDIDATE.read_text(encoding="utf-8")

    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=workdir,
        ),
        workers=args.workers,
        start_timeout_s=120.0,
        watchdog_interval_s=1.0,
        call_timeout_s=5.0,
    )
    report: dict = {"workers": args.workers, "engine": str(engine)}
    failures: list[str] = []
    started = time.monotonic()
    try:
        pool.start()
        report["startupSeconds"] = round(time.monotonic() - started, 3)
        report["workers"] = pool.stats()
        print(f"pool up: {report['startupSeconds']}s, {len(pool.stats())} workers")

        # 1 + 2: the same job on every worker must measure identically.
        measurements: list[dict] = []
        for index, worker in enumerate(pool.workers):
            job_started = time.monotonic()
            result = pool.submit(
                kind="geometry.build",
                params={"script": script, "scriptParams": SCRIPT_PARAMS},
                job_id=f"probe-{index}",
            )
            elapsed = round((time.monotonic() - job_started) * 1000.0, 1)
            if result.get("status") != "ok":
                failures.append(f"worker {worker.name}: the job failed: {result.get('error')}")
                continue
            measurement = _measurement(result)
            measurement["worker"] = worker.name
            measurement["ms"] = elapsed
            measurements.append(measurement)
            print(f"  {worker.name}: {elapsed} ms, artifact {measurement.get('sha256', '')[:16]}")
        report["measurements"] = measurements
        hashes = {item.get("sha256") for item in measurements}
        if len(hashes) != 1 or None in hashes:
            failures.append(f"the workers measured different geometry: {hashes}")

        # 3: kill a worker mid-job; the other one must keep serving.
        victim = pool.workers[0]
        survivor = pool.workers[1] if len(pool.workers) > 1 else pool.workers[0]
        victim.process.kill() if victim.process else None
        crashed = pool.submit(
            kind="geometry.build",
            params={"script": script, "scriptParams": SCRIPT_PARAMS},
            job_id="probe-crash",
        )
        if crashed.get("status") != "error" or (crashed.get("error") or {}).get("code") not in {
            "worker_restarted",
            "worker_down",
        }:
            failures.append(f"a killed worker did not fail the job cleanly: {crashed}")
        report["crashJob"] = crashed
        print(f"  crash job: {crashed.get('status')} / {(crashed.get('error') or {}).get('code')}")

        # 4: the pool replaces the dead worker and serves again.
        deadline = time.monotonic() + 60
        recovered = None
        while time.monotonic() < deadline:
            candidate = pool.submit(
                kind="geometry.build",
                params={"script": script, "scriptParams": SCRIPT_PARAMS},
                job_id="probe-recovered",
            )
            if candidate.get("status") == "ok":
                recovered = candidate
                break
            time.sleep(0.5)
        if recovered is None:
            failures.append("the pool did not recover after the crash")
        else:
            report["recovered"] = {"status": recovered["status"]}
            print("  recovered: the pool serves jobs again")
        report["workersAfter"] = pool.stats()

        # 5: the survivor kept working all along.
        survivor_job = pool.submit(
            kind="geometry.build",
            params={"script": script, "scriptParams": SCRIPT_PARAMS},
            job_id="probe-survivor",
        )
        if survivor_job.get("status") != "ok":
            failures.append(f"the surviving worker stopped serving: {survivor_job}")
        report["survivor"] = {"name": survivor.name, "status": survivor_job.get("status")}
    finally:
        pool.stop()
        report["elapsedSeconds"] = round(time.monotonic() - started, 3)

    report["ok"] = not failures
    report["failures"] = failures
    if args.json:
        path = pathlib.Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    if failures:
        return 1
    print(f"pool probe passed in {report['elapsedSeconds']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
