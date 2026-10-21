"""The mesh probe (W2.8): what the engine measured, in the shape the workspace draws.

The NativeCAD workspace's viewport needs triangles (plan §5.3). This probe proves the bridge
end to end:

    Building Spec -> design -> macro + mesh export -> CAD worker pool -> mesh.json

and checks the two things that matter:

1. **the mesh matches the design** - the object count, the kinds, the phases, the measured
   volume and the measured position of every object come from the design, never from a number
   someone typed; and
2. **the same spec produces a byte-identical mesh on a re-run** (plan §9, "identical outputs").

The mesh document is written to ``data/cad/generated/`` - it is what the app's workspace draws
in the prototype (the live stream comes with the desktop bridge). ``--check`` verifies the
committed fixtures offline: the composed macro is fresh, and the committed mesh still agrees
with the design.

Usage (from the repo root):
  uv run --directory core python ../tools/cad/mesh_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/mesh_probe.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
from typing import Any

from archres_core.cad.mesh import MESH_ARTIFACT, merge_meshes, mesh_macro, summarize
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
GENERATED = ROOT / "data" / "cad" / "generated"
CASE = "two-storey-residential"
EXAMPLE = ROOT / "spec" / "examples" / f"{CASE}.json"
MESH_PATH = GENERATED / f"{CASE}.mesh.json"
MACRO_PATH = GENERATED / f"{CASE}.mesh-macro.py"
#: 1 % on a measured volume (the same declared tolerance the design probes use).
VOLUME_TOLERANCE = 0.01
POSITION_TOLERANCE_MM = 0.01


def _build() -> tuple[Any, Any, str, str]:
    """The design, the two macros (foundation, floor) and the composed mesh macros."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    foundation_macro = render_macro(foundation)
    floor_macro = render_floor_macro(floor)
    return foundation, floor, mesh_macro(foundation_macro), mesh_macro(floor_macro)


def _expected(design: Any) -> list[dict[str, Any]]:
    """Every object the design declares, with the numbers the mesh must agree with."""
    rows: list[dict[str, Any]] = []
    for item in design.expected_objects():
        rows.append(
            {
                "name": item["name"],
                "volumeM3": item["volumeM3"],
                "bboxZMm": item.get("bboxZMm"),
            }
        )
    return rows


def _compare(mesh: dict[str, Any], expected: list[dict[str, Any]]) -> list[str]:
    """The mesh must agree with the design (the engine measures; the app draws)."""
    problems: list[str] = []
    objects = {str(item.get("id")): item for item in mesh.get("objects") or []}
    for row in expected:
        actual = objects.get(row["name"])
        if actual is None:
            problems.append(f"the mesh has no object named {row['name']!r}")
            continue
        volume = float(actual.get("volumeMm3") or 0.0) / 1_000_000_000.0
        target = float(row["volumeM3"])
        if abs(volume - target) > VOLUME_TOLERANCE * max(target, 1e-9):
            problems.append(
                f"{row['name']}: the mesh says {volume:g} m3, the design says {target:g} m3"
            )
        wanted_z = row.get("bboxZMm")
        if wanted_z:
            low = (actual.get("bboxMinMm") or [0, 0, 0])[2]
            high = (actual.get("bboxMaxMm") or [0, 0, 0])[2]
            if abs(low - wanted_z[0]) > POSITION_TOLERANCE_MM:
                problems.append(
                    f"{row['name']}: the mesh's base is {low:g} mm, the design says {wanted_z[0]:g} mm"
                )
            if abs(high - wanted_z[1]) > POSITION_TOLERANCE_MM:
                problems.append(
                    f"{row['name']}: the mesh's top is {high:g} mm, the design says {wanted_z[1]:g} mm"
                )
        if not actual.get("positions"):
            problems.append(f"{row['name']}: the mesh carries no triangles")
    extra = sorted(set(objects) - {row["name"] for row in expected})
    if extra:
        problems.append(f"the mesh holds objects the design does not declare: {extra}")
    return problems


def _run(engine: pathlib.Path, workdir: pathlib.Path) -> dict[str, Any]:
    """Run both macros through the pool, twice, and merge the meshes."""
    _foundation, _floor, foundation_macro, floor_macro = _build()
    workdir.mkdir(parents=True, exist_ok=True)
    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=workdir,
        ),
        workers=1,
        start_timeout_s=120.0,
        call_timeout_s=30.0,
    )
    report: dict[str, Any] = {"case": CASE}
    failures: list[str] = []
    started = time.monotonic()
    try:
        pool.start()
        digests: list[str] = []
        merged: dict[str, Any] | None = None
        for attempt in (1, 2):
            meshes: list[dict[str, Any]] = []
            for name, macro in (("foundation", foundation_macro), ("floor", floor_macro)):
                job_id = f"mesh-{name}-{attempt}"
                result = pool.submit(kind="geometry.build", params={"script": macro}, job_id=job_id)
                if result.get("status") != "ok":
                    failures.append(f"run {attempt} ({name}): the job failed: {result.get('error')}")
                    break
                path = pool.artifact_path(job_id, MESH_ARTIFACT)
                if path is None or not path.is_file():
                    failures.append(f"run {attempt} ({name}): the mesh artifact is missing")
                    break
                meshes.append(json.loads(path.read_text(encoding="utf-8")))
            if failures:
                break
            merged = merge_meshes(meshes)
            digests.append(
                json.dumps(merged, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            )
            report[f"run{attempt}Ms"] = round((time.monotonic() - started) * 1000.0, 1)
        if len(digests) == 2 and digests[0] != digests[1]:
            failures.append("the two runs produced different meshes")
        if merged is not None:
            report["summary"] = summarize(merged)
    finally:
        pool.stop()
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)
    return {"report": report, "failures": failures, "mesh": merged}


def _write(mesh: dict[str, Any], macro: str) -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    MESH_PATH.write_text(
        json.dumps(mesh, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    MACRO_PATH.write_text(macro, encoding="utf-8", newline="\n")
    _manifest_entry()


def _manifest_entry() -> None:
    """The generated-files manifest lists every macro the pool runs (the mesh macro included)."""
    manifest_path = GENERATED / "manifest.json"
    existing: dict[str, Any] = {}
    if manifest_path.is_file():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = dict(existing.get("files") or {})
    for path in (MESH_PATH, MACRO_PATH):
        files[path.name] = {"bytes": path.stat().st_size}
    cases = existing.get("cases")
    entries = set()
    if isinstance(cases, dict):
        entries.update(str(item) for item in (cases.get("entries") or []))
    elif isinstance(cases, list):
        entries.update(str(item) for item in cases)
    entries.add(f"mesh:{CASE}")
    manifest = {
        "manifestVersion": "1",
        "cases": {"entries": sorted(entries)},
        "files": files,
        "notes": (
            "The generated macros are the exact sources the CAD worker pool runs. They are "
            "committed so a reviewer can read what the engine will build; regenerate them "
            "with the matching tools/cad/*_probe.py --check."
        ),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _check_offline() -> list[str]:
    """The offline check: the composed macro is fresh and the committed mesh agrees with the design."""
    problems: list[str] = []
    foundation, floor, foundation_macro, floor_macro = _build()
    if not MACRO_PATH.is_file():
        problems.append(f"missing {MACRO_PATH.relative_to(ROOT).as_posix()}")
    else:
        committed = MACRO_PATH.read_text(encoding="utf-8")
        expected = foundation_macro + "\n" + floor_macro
        if committed != expected:
            problems.append(f"{MACRO_PATH.relative_to(ROOT).as_posix()} is stale")
    if not MESH_PATH.is_file():
        problems.append(f"missing {MESH_PATH.relative_to(ROOT).as_posix()}")
        return problems
    mesh = json.loads(MESH_PATH.read_text(encoding="utf-8"))
    expected_rows = _expected(foundation) + _expected(floor)
    problems.extend(_compare(mesh, expected_rows))
    manifest_path = GENERATED / "manifest.json"
    if manifest_path.is_file():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = manifest.get("files") or {}
        for path in (MESH_PATH, MACRO_PATH):
            if path.name not in files:
                problems.append(f"the manifest does not list {path.name}")
    return problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the mesh export (the workspace's view).")
    parser.add_argument("--engine", help="freecadcmd path (omit for a freshness check only)")
    parser.add_argument("--check", action="store_true", help="only check the committed fixtures")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    if args.check:
        problems = _check_offline()
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the committed mesh is fresh and agrees with the design")
        return 0

    if not args.engine:
        print("no engine: pass --engine or use --check", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    foundation, floor, foundation_macro, floor_macro = _build()
    result = _run(engine, ROOT / "data" / "tmp" / "mesh-probe")
    failures = list(result["failures"])
    mesh = result["mesh"]
    if mesh is not None:
        failures.extend(_compare(mesh, _expected(foundation) + _expected(floor)))
        _write(mesh, foundation_macro + "\n" + floor_macro)
    report = result["report"]
    report["failures"] = failures
    report["ok"] = not failures
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
        f"mesh probe passed: {summary.get('objects')} objects, "
        f"{summary.get('triangles')} triangles, {summary.get('volumeM3')} m3, "
        f"{report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
