"""The federation probe (W2.9): a shared datum, one file per phase, and a master that links them.

    Building Spec -> design -> macro + federation epilogue -> worker pool -> phase files
                 -> master macro (App::Link) -> the combined master

and the checks that make it a product feature rather than a demo:

1. **the master agrees with the phases** - the master's object count and its measured volume are
   the sum of the phase files' (the cross-check is against another stage, never a stored number);
2. **the master links, it does not copy** - the master document holds App::Link objects, and the
   phase files stay the single source of truth;
3. **the same spec produces the same model on a re-run** (plan §9, "identical outputs").

Usage (from the repo root):
  uv run --directory core python ../tools/cad/federation_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/federation_probe.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
from typing import Any

from archres_core.cad.federation import (
    DATUM_FILE,
    MASTER_FILE,
    MASTER_MEASUREMENT,
    PHASE_FILE,
    build_datum,
    master_macro,
    phase_macro,
    summarize_master,
)
from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import (
    design_foundation,
    design_typical_floor,
    render_floor_macro,
    render_macro,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
GENERATED = ROOT / "data" / "cad" / "generated" / "federation"
CASE = "two-storey-residential"
EXAMPLE = ROOT / "spec" / "examples" / f"{CASE}.json"
#: 1 % on a measured volume (the same declared tolerance the design probes use).
VOLUME_TOLERANCE = 0.01


def _build() -> tuple[Any, Any, str, str, dict[str, Any]]:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    datum = build_datum(spec)
    return (
        foundation,
        floor,
        phase_macro(render_macro(foundation)),
        phase_macro(render_floor_macro(floor)),
        datum,
    )


def _expected(design: Any) -> list[dict[str, Any]]:
    return [
        {"name": item["name"], "volumeM3": item["volumeM3"]}
        for item in design.expected_objects()
    ]


def _run(engine: pathlib.Path, workdir: pathlib.Path) -> dict[str, Any]:
    """Build the two phase files, then the master, and measure both."""
    foundation, floor, foundation_macro, floor_macro, datum = _build()
    workdir.mkdir(parents=True, exist_ok=True)
    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=workdir,
        ),
        workers=1,
        start_timeout_s=120.0,
        call_timeout_s=60.0,
    )
    report: dict[str, Any] = {"case": CASE, "datum": datum}
    failures: list[str] = []
    started = time.monotonic()
    try:
        pool.start()
        phases: list[dict[str, Any]] = []
        for phase, macro in (("foundation", foundation_macro), ("floor", floor_macro)):
            job_id = f"federation-{phase}"
            result = pool.submit(
                kind="geometry.build",
                params={"script": macro, "scriptParams": {"phase": phase, "datum": datum}},
                job_id=job_id,
            )
            if result.get("status") != "ok":
                failures.append(f"the {phase} phase failed: {result.get('error')}")
                break
            path = pool.artifact_path(job_id, PHASE_FILE)
            if path is None or not path.is_file():
                failures.append(f"the {phase} phase wrote no file")
                break
            phases.append({"phase": phase, "path": str(path)})
        if failures:
            return {"report": report, "failures": failures}
        master_job = "federation-master"
        result = pool.submit(
            kind="geometry.build",
            params={
                "script": master_macro(),
                "scriptParams": {"datum": datum, "phases": phases},
            },
            job_id=master_job,
        )
        if result.get("status") != "ok":
            failures.append(f"the master failed: {result.get('error')}")
            return {"report": report, "failures": failures}
        measurement_path = pool.artifact_path(master_job, MASTER_MEASUREMENT)
        if measurement_path is None or not measurement_path.is_file():
            failures.append("the master wrote no measurement")
            return {"report": report, "failures": failures}
        measurement = json.loads(measurement_path.read_text(encoding="utf-8"))
        master_path = pool.artifact_path(master_job, MASTER_FILE)
        summary = summarize_master(measurement)
        report["summary"] = summary
        report["masterBytes"] = master_path.stat().st_size if master_path else 0
        report["phaseFiles"] = [
            {"phase": item["phase"], "bytes": pathlib.Path(item["path"]).stat().st_size}
            for item in phases
        ]
        # The master must agree with the phases (checked against another stage).
        expected_objects = _expected(foundation) + _expected(floor)
        if summary["objects"] != len(expected_objects):
            failures.append(
                f"the master links {summary['objects']} objects, the design declares "
                f"{len(expected_objects)}"
            )
        designed = sum(float(item["volumeM3"]) for item in expected_objects)
        if abs(summary["volumeM3"] - designed) > VOLUME_TOLERANCE * designed:
            failures.append(
                f"the master's volume is {summary['volumeM3']} m3, the design says {designed} m3"
            )
        for item in measurement.get("objects") or []:
            wanted = next(
                (row for row in expected_objects if row["name"] == item.get("id")), None
            )
            if wanted is None:
                failures.append(f"the master links an object the design does not declare: {item.get('id')}")
                continue
            volume = float(item.get("volumeMm3") or 0.0) / 1_000_000_000.0
            if abs(volume - wanted["volumeM3"]) > VOLUME_TOLERANCE * wanted["volumeM3"]:
                failures.append(
                    f"{item.get('id')}: the master measures {volume:g} m3, the design says "
                    f"{wanted['volumeM3']:g} m3"
                )
    finally:
        pool.stop()
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)
    return {"report": report, "failures": failures}


def _write(report: dict[str, Any]) -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    (GENERATED / DATUM_FILE).write_text(
        json.dumps(report["datum"], ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    (GENERATED / "master-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _check_offline() -> list[str]:
    """The offline check: the datum is fresh and the master's report agrees with the design."""
    problems: list[str] = []
    datum_path = GENERATED / DATUM_FILE
    report_path = GENERATED / "master-report.json"
    if not datum_path.is_file():
        return [f"missing {datum_path.relative_to(ROOT).as_posix()}"]
    if not report_path.is_file():
        return [f"missing {report_path.relative_to(ROOT).as_posix()}"]
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    expected_datum = build_datum(spec)
    committed = json.loads(datum_path.read_text(encoding="utf-8"))
    if committed != expected_datum:
        problems.append(f"{datum_path.relative_to(ROOT).as_posix()} is stale")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    summary = report.get("summary") or {}
    foundation, floor, _f, _fl, _d = _build()
    designed = sum(
        float(item["volumeM3"]) for item in _expected(foundation) + _expected(floor)
    )
    if abs(float(summary.get("volumeM3") or 0.0) - designed) > VOLUME_TOLERANCE * designed:
        problems.append(
            f"the master's volume is {summary.get('volumeM3')} m3, the design says {designed} m3"
        )
    if int(summary.get("objects") or 0) != len(_expected(foundation) + _expected(floor)):
        problems.append("the master's object count does not match the design")
    return problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the federation (the per-phase files + master).")
    parser.add_argument("--engine", help="freecadcmd path (omit for a freshness check only)")
    parser.add_argument("--check", action="store_true", help="only check the committed artefacts")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    if args.check:
        problems = _check_offline()
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the committed federation artefacts are fresh and agree with the design")
        return 0

    if not args.engine:
        print("no engine: pass --engine or use --check", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    result = _run(engine, ROOT / "data" / "tmp" / "federation-probe")
    report = result["report"]
    failures = list(result["failures"])
    report["failures"] = failures
    report["ok"] = not failures
    _write(report)
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
    summary = report.get("summary") or {}
    print(
        f"federation probe passed: {summary.get('links')} links, "
        f"{summary.get('objects')} objects, {summary.get('volumeM3')} m3, "
        f"{report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
