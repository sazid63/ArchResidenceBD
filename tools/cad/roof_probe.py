"""The roof and boundary design probe (W2.13): roof slab and site boundary walls.

The chain the probe proves: the spec → the foundation → two storeys → **the roof and boundary** →
the measured geometry, with the two checks that make it a product generator rather than a demo:

1. the measurement matches the **design** (the expectations are computed from the design), and
2. the same spec produces **byte-identical** artifacts on a re-run (plan §9).

Usage (from the repo root):
  uv run --directory core python ../tools/cad/roof_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/roof_probe.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time
from typing import Any

from archres_core.cad.mesh import MESH_ARTIFACT, merge_meshes, mesh_macro
from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import (
    design_foundation,
    design_typical_floor,
    render_floor_macro,
    render_macro,
)
from archres_core.design.roof import design_roof_boundary, render_roof_macro
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
GENERATED = ROOT / "data" / "cad" / "generated"
CASE = "two-storey-residential"
EXAMPLE = ROOT / "spec" / "examples" / f"{CASE}.json"
#: 1 % on a measured volume (the same declared tolerance the design probes use).
VOLUME_TOLERANCE = 0.01


def _build() -> dict[str, Any]:
    """The spec → the foundation → two storeys → the roof and boundary."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    ground = design_typical_floor(spec, foundation, storey_index=0)
    first = design_typical_floor(spec, foundation, storey_index=1)
    roof = design_roof_boundary(spec, foundation, (ground, first))
    return {
        "spec": spec,
        "foundation": foundation,
        "ground": ground,
        "first": first,
        "roof": roof,
        "macros": {
            "foundation": mesh_macro(render_macro(foundation)),
            "ground": mesh_macro(render_floor_macro(ground)),
            "floor-1": mesh_macro(render_floor_macro(first)),
            "roof": mesh_macro(render_roof_macro(roof)),
        },
    }


def _expected(design: Any) -> list[dict[str, Any]]:
    return [
        {"name": item["name"], "volumeM3": item["volumeM3"]}
        for item in design.expected_objects()
    ]


def _compare(mesh: dict[str, Any], expected: list[dict[str, Any]]) -> list[str]:
    problems: list[str] = []
    objects = {str(item.get("id")): item for item in mesh.get("objects") or []}
    for row in expected:
        actual = objects.get(row["name"])
        if actual is None:
            problems.append(f"the mesh has no object named {row['name']!r}")
            continue
        volume = float(actual.get("volumeMm3") or 0.0) / 1_000_000_000.0
        if abs(volume - row["volumeM3"]) > VOLUME_TOLERANCE * max(row["volumeM3"], 1e-9):
            problems.append(
                f"{row['name']}: the mesh says {volume:g} m3, the design says {row['volumeM3']:g} m3"
            )
    extra = sorted(set(objects) - {row["name"] for row in expected})
    if extra:
        problems.append(f"the mesh holds objects the design does not declare: {extra}")
    return problems


def _run(engine: pathlib.Path, workdir: pathlib.Path) -> dict[str, Any]:
    built = _build()
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
        digests: list[str] = []
        merged: dict[str, Any] | None = None
        for attempt in (1, 2):
            meshes: list[dict[str, Any]] = []
            for phase, macro in built["macros"].items():
                job_id = f"roof-{phase}-{attempt}"
                result = pool.submit(kind="geometry.build", params={"script": macro}, job_id=job_id)
                if result.get("status") != "ok":
                    failures.append(f"run {attempt} ({phase}): {result.get('error')}")
                    break
                path = pool.artifact_path(job_id, MESH_ARTIFACT)
                if path is None or not path.is_file():
                    failures.append(f"run {attempt} ({phase}): the mesh artifact is missing")
                    break
                meshes.append(json.loads(path.read_text(encoding="utf-8")))
            if failures:
                break
            merged = merge_meshes(meshes)
            digests.append(
                json.dumps(merged, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            )
        if len(digests) == 2 and digests[0] != digests[1]:
            failures.append("the two runs produced different meshes")
        if merged is not None:
            report["objects"] = len(merged.get("objects") or [])
            report["triangles"] = sum(
                len(item.get("indices") or []) // 3 for item in merged.get("objects") or []
            )
    finally:
        pool.stop()
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)
    return {"report": report, "failures": failures, "mesh": merged, "built": built}


def _write(report: dict[str, Any], built: dict[str, Any]) -> None:
    GENERATED.mkdir(parents=True, exist_ok=True)
    (GENERATED / "roof-boundary-design.json").write_text(
        json.dumps(built["roof"].as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    (GENERATED / "roof-boundary-macro.py").write_text(
        built["macros"]["roof"], encoding="utf-8", newline="\n"
    )
    (GENERATED / "roof-boundary-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    _manifest_entry()


def _manifest_entry() -> None:
    """The generated-files manifest lists every macro the pool runs (the roof macro too)."""
    manifest_path = GENERATED / "manifest.json"
    existing: dict[str, Any] = {}
    if manifest_path.is_file():
        existing = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = dict(existing.get("files") or {})
    for name in ("roof-boundary-design.json", "roof-boundary-macro.py", "roof-boundary-report.json"):
        path = GENERATED / name
        if path.is_file():
            files[name] = {"bytes": path.stat().st_size}
    cases = existing.get("cases")
    entries = set()
    if isinstance(cases, dict):
        entries.update(str(item) for item in (cases.get("entries") or []))
    elif isinstance(cases, list):
        entries.update(str(item) for item in cases)
    entries.add(f"roof:{CASE}")
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
    problems: list[str] = []
    built = _build()
    design_path = GENERATED / "roof-boundary-design.json"
    macro_path = GENERATED / "roof-boundary-macro.py"
    if not design_path.is_file():
        problems.append(f"missing {design_path.relative_to(ROOT).as_posix()}")
    else:
        expected = json.dumps(
            built["roof"].as_dict(), ensure_ascii=False, indent=2, sort_keys=True
        ) + "\n"
        if design_path.read_text(encoding="utf-8") != expected:
            problems.append(f"{design_path.relative_to(ROOT).as_posix()} is stale")
    if not macro_path.is_file():
        problems.append(f"missing {macro_path.relative_to(ROOT).as_posix()}")
    elif macro_path.read_text(encoding="utf-8") != built["macros"]["roof"]:
        problems.append(f"{macro_path.relative_to(ROOT).as_posix()} is stale")
    return problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the roof and boundary design (W2.13).")
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
        print("the generated roof-boundary fixtures are fresh")
        return 0

    if not args.engine:
        print("no engine: pass --engine or use --check", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    result = _run(engine, ROOT / "data" / "tmp" / "roof-probe")
    built = result["built"]
    report = result["report"]
    failures = list(result["failures"])
    mesh = result["mesh"]
    if mesh is not None:
        expected = (
            _expected(built["foundation"])
            + _expected(built["ground"])
            + _expected(built["first"])
            + _expected(built["roof"])
        )
        failures.extend(_compare(mesh, expected))
    report["failures"] = failures
    report["ok"] = not failures
    _write(report, built)
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
        f"roof probe passed: {report.get('objects')} objects, "
        f"{report.get('triangles')} triangles, {report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
