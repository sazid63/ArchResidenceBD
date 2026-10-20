"""Foundation generator probe (W2.2): the spec becomes geometry, and the engine measures it.

The chain the probe proves, end to end:

    Building Spec -> FoundationDesign -> generated macro -> CAD worker pool -> measured geometry

and then the two things that make it a *product* generator rather than a demo:

1. the measurement matches the **design** (the expectations are computed from the design, not
   copied from a number someone typed), and
2. the same spec produces **byte-identical** artifacts on a re-run (plan §9, "identical
   outputs").

The generated macro and the design are written to `data/cad/generated/` so a human can read
exactly what the engine will build; `--check` proves the committed fixtures are fresh (no
engine needed, so CI can run it).

Usage (from the repo root):
  uv run --directory core python ../tools/cad/foundation_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/foundation_probe.py --check

Exit codes: 0 = the measurement matched the design and the fixtures are fresh; 1 = not.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import design_foundation, render_macro
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
EXAMPLES = ROOT / "spec" / "examples"
GENERATED = ROOT / "data" / "cad" / "generated"
CASE = "two-storey-residential"
VOLUME_TOLERANCE = 0.001


def _spec_path() -> pathlib.Path:
    return EXAMPLES / f"{CASE}.json"


def _build() -> tuple[dict, str]:
    spec = json.loads(_spec_path().read_text(encoding="utf-8"))
    design = design_foundation(spec)
    return design, render_macro(design)


def _fixture_paths() -> tuple[pathlib.Path, pathlib.Path, pathlib.Path]:
    return (
        GENERATED / f"foundation-{CASE}.py",
        GENERATED / f"foundation-{CASE}.design.json",
        GENERATED / "manifest.json",
    )


def _write_fixtures(design, macro: str) -> None:
    macro_path, design_path, manifest_path = _fixture_paths()
    GENERATED.mkdir(parents=True, exist_ok=True)
    macro_path.write_text(macro, encoding="utf-8", newline="\n")
    design_path.write_text(
        json.dumps(design.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    manifest = {
        "manifestVersion": "1",
        "generator": "archres_core.design.foundation-0.1.0",
        "case": CASE,
        "spec": {
            "path": f"spec/examples/{CASE}.json",
        },
        "files": {
            macro_path.name: {"bytes": macro_path.stat().st_size},
            design_path.name: {"bytes": design_path.stat().st_size},
        },
        "notes": (
            "The generated macro is the exact source the CAD worker pool runs. It is committed "
            "so a reviewer can read what the engine will build; regenerate it with "
            "tools/cad/foundation_probe.py --check."
        ),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _check_fixtures(design, macro: str) -> list[str]:
    problems: list[str] = []
    macro_path, design_path, manifest_path = _fixture_paths()
    for path in (macro_path, design_path, manifest_path):
        if not path.is_file():
            problems.append(f"missing {path.relative_to(ROOT).as_posix()}")
    if problems:
        return problems
    if macro_path.read_text(encoding="utf-8") != macro:
        problems.append(f"{macro_path.relative_to(ROOT).as_posix()} is stale")
    expected_design = json.dumps(design.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if design_path.read_text(encoding="utf-8") != expected_design:
        problems.append(f"{design_path.relative_to(ROOT).as_posix()} is stale")
    return problems


def _measured(result: dict) -> dict:
    """The measured geometry the worker returned (from its JSON artifact)."""
    for artifact in result.get("artifacts") or []:
        if artifact.get("name") == "geometry.json":
            path = artifact.get("path")
            if path:
                return {"sha256": artifact.get("sha256"), "sizeBytes": artifact.get("sizeBytes")}
    return {}


def _compare(measured: dict, design) -> list[str]:
    """The measurement must match the design (computed expectations, never copied numbers)."""
    problems: list[str] = []
    objects = {item.get("name"): item for item in measured.get("objects") or []}
    for expected in design.expected_objects():
        actual = objects.get(expected["name"])
        if actual is None:
            problems.append(f"the document has no object named {expected['name']!r}")
            continue
        volume = float(actual.get("volumeM3") or 0.0)
        if abs(volume - expected["volumeM3"]) > VOLUME_TOLERANCE * max(expected["volumeM3"], 1e-9):
            problems.append(
                f"{expected['name']}: measured {volume:g} m3, the design says {expected['volumeM3']:g} m3"
            )
        if not actual.get("valid"):
            problems.append(f"{expected['name']}: the measured shape is not valid")
    extra = sorted(set(objects) - {item["name"] for item in design.expected_objects()})
    if extra:
        problems.append(f"the document holds objects the design does not declare: {extra}")
    return problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the foundation generator.")
    parser.add_argument("--engine", help="freecadcmd path (omit for a freshness check only)")
    parser.add_argument("--check", action="store_true", help="only check the committed fixtures")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    design, macro = _build()
    if args.check:
        problems = _check_fixtures(design, macro)
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the generated foundation fixtures are fresh")
        return 0

    if not args.engine:
        print("no engine: pass --engine or use --check", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    workdir = ROOT / "data" / "tmp" / "foundation-probe"
    workdir.mkdir(parents=True, exist_ok=True)
    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=workdir,
        ),
        workers=1,
        start_timeout_s=120.0,
        call_timeout_s=10.0,
    )
    report: dict = {"case": CASE, "footings": len(design.footings)}
    failures: list[str] = []
    started = time.monotonic()
    try:
        pool.start()
        hashes = []
        for attempt in (1, 2):
            job_id = f"foundation-{attempt}"
            result = pool.submit(
                kind="geometry.build",
                params={"script": macro},
                job_id=job_id,
            )
            if result.get("status") != "ok":
                failures.append(f"run {attempt}: the job failed: {result.get('error')}")
                break
            measurement = _measured(result)
            hashes.append(measurement.get("sha256"))
            report[f"run{attempt}Ms"] = round((time.monotonic() - started) * 1000.0, 1)
            if attempt == 1:
                report["artifactSha256"] = measurement.get("sha256")
            # The measured geometry is read back from the artifact the worker wrote: the wire
            # result carries the name and hash, the bytes stay in the worker's job directory.
            path = pool.artifact_path(job_id, "geometry.json")
            if path is None or not path.is_file():
                failures.append(f"run {attempt}: the geometry artifact is missing")
                break
            measured = json.loads(path.read_text(encoding="utf-8"))
            if attempt == 1:
                report["measuredObjects"] = measured.get("objects")
                failures.extend(_compare(measured, design))
        if len(hashes) == 2 and hashes[0] != hashes[1]:
            failures.append(f"the two runs produced different geometry: {hashes}")
    finally:
        pool.stop()
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)

    _write_fixtures(design, macro)
    problems = _check_fixtures(design, macro)
    failures.extend(problems)
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
    print(
        f"foundation probe passed: {len(design.footings)} footings, "
        f"{len(design.grade_beams)} grade beams, artifact {report.get('artifactSha256', '')[:16]}, "
        f"{report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
