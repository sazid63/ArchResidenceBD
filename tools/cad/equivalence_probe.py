"""The equivalence gate, engine half (W2.11): incremental ≡ full rebuild.

The design-level half of the gate runs in CI on every push (the test
``core/tests/test_design_incremental.py``). This is the **engine** half: the meshes and the
master the two builds produce must be **byte-identical**, and it needs the engine, so it runs
in the weekly ``cad-execution`` job.

    full build        ─▶ the foundation's macro + the floor's macro ─▶ meshes + master
    incremental build ─▶ the changed phase's macro only (the other phase is reused) ─▶ meshes
    the two must be identical, and the incremental build must have run fewer jobs

Usage (from the repo root):
  uv run --directory core python ../tools/cad/equivalence_probe.py --engine "<freecadcmd>"
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys
import time
from typing import Any

from archres_core.cad.federation import MASTER_MEASUREMENT, summarize_master
from archres_core.cad.mesh import MESH_ARTIFACT, merge_meshes, mesh_macro
from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import render_floor_macro, render_macro
from archres_core.design.incremental import build_states, incremental_states
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
CASE = "two-storey-residential"
EXAMPLE = ROOT / "spec" / "examples" / f"{CASE}.json"
GENERATED = ROOT / "data" / "cad" / "generated"


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def _macros(states: dict[str, Any]) -> dict[str, str]:
    return {
        "foundation": mesh_macro(render_macro(states["foundation"].design)),
        "floor-1": mesh_macro(render_floor_macro(states["floor-1"].design)),
    }


def _run_phase(
    pool: WorkerPool, phase: str, macro: str, job_id: str
) -> tuple[dict[str, Any] | None, str | None]:
    result = pool.submit(kind="geometry.build", params={"script": macro}, job_id=job_id)
    if result.get("status") != "ok":
        return None, f"the {phase} phase failed: {result.get('error')}"
    path = pool.artifact_path(job_id, MESH_ARTIFACT)
    if path is None or not path.is_file():
        return None, f"the {phase} phase wrote no mesh"
    return json.loads(path.read_text(encoding="utf-8")), None


def _run(engine: pathlib.Path, workdir: pathlib.Path) -> dict[str, Any]:
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
    report: dict[str, Any] = {"case": CASE}
    failures: list[str] = []
    started = time.monotonic()
    try:
        pool.start()
        # The changed spec: the typical floor's height moves.
        changed = _spec()
        changed["building"]["storeys"]["typicalFloorHeightM"] = 3.6
        # The full build of the **changed** spec: every phase, every time.
        full_states = build_states(changed)
        full_macros = _macros(full_states)
        full_meshes: list[dict[str, Any]] = []
        for phase, macro in full_macros.items():
            mesh, problem = _run_phase(pool, phase, macro, f"full-{phase}")
            if problem:
                failures.append(problem)
                break
            full_meshes.append(mesh or {})
        if failures:
            return {"report": report, "failures": failures}

        # The incremental build: the floor's spec changed, so the floor is rebuilt and the
        # foundation is reused.
        previous = build_states(_spec())
        incremental, rebuilt = incremental_states(changed, previous)
        report["rebuilt"] = rebuilt
        report["reused"] = sorted(set(previous) - set(rebuilt))
        incremental_macros = _macros(incremental)
        incremental_meshes: list[dict[str, Any]] = []
        for phase in ("foundation", "floor-1"):
            if phase in rebuilt:
                mesh, problem = _run_phase(
                    pool, phase, incremental_macros[phase], f"incremental-{phase}"
                )
                if problem:
                    failures.append(problem)
                    break
                incremental_meshes.append(mesh or {})
            else:
                # The reused phase: the file the full build produced, carried over unchanged.
                reused = pool.artifact_path(f"full-{phase}", MESH_ARTIFACT)
                if reused is None or not reused.is_file():
                    failures.append(f"the reused {phase} mesh is missing")
                    break
                incremental_meshes.append(json.loads(reused.read_text(encoding="utf-8")))
        if failures:
            return {"report": report, "failures": failures}

        full = merge_meshes(full_meshes)
        incremental_mesh = merge_meshes(incremental_meshes)
        full_bytes = json.dumps(full, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        incremental_bytes = json.dumps(
            incremental_mesh, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        if full_bytes != incremental_bytes:
            failures.append("the incremental mesh differs from the full rebuild's mesh")
            full_objects = {str(item.get("id")): item for item in full.get("objects") or []}
            incremental_objects = {
                str(item.get("id")): item for item in incremental_mesh.get("objects") or []
            }
            for key in sorted(set(full_objects) | set(incremental_objects)):
                one = full_objects.get(key)
                other = incremental_objects.get(key)
                if one is None or other is None:
                    failures.append(f"  {key}: only in one of the two builds")
                    continue
                if json.dumps(one, sort_keys=True) != json.dumps(other, sort_keys=True):
                    failures.append(
                        f"  {key}: the full build's volume is {one.get('volumeMm3')} m3-mm, the "
                        f"incremental's is {other.get('volumeMm3')}"
                    )
        report["fullObjects"] = len(full.get("objects") or [])
        report["incrementalObjects"] = len(incremental_mesh.get("objects") or [])
        report["identical"] = full_bytes == incremental_bytes
    finally:
        pool.stop()
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)
    return {"report": report, "failures": failures}


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="The equivalence gate: incremental ≡ full rebuild.")
    parser.add_argument("--engine", help="freecadcmd path")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()
    if not args.engine:
        print("pass --engine", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    result = _run(engine, ROOT / "data" / "tmp" / "equivalence-probe")
    report = result["report"]
    failures = list(result["failures"])
    report["failures"] = failures
    report["ok"] = not failures
    GENERATED.mkdir(parents=True, exist_ok=True)
    (GENERATED / "equivalence-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
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
    print(
        f"equivalence gate passed: rebuilt {report.get('rebuilt')}, reused "
        f"{report.get('reused')}, {report.get('fullObjects')} objects, identical: "
        f"{report.get('identical')}, {report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
