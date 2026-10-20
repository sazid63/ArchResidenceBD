"""Shared probe engine for the spec-driven generators (W2.2, W2.3).

Both generators have the same shape - *spec → design → macro → worker pool → measured
geometry* - so the probe lives here once and each generator supplies a small builder:

- ``foundation_probe.py`` - the site + foundation (W2.2)
- ``floor_probe.py`` - the typical floor (W2.3)

The probe checks the two things that make a generator a product generator:

1. the measurement matches the **design** (the expectations are computed from the design, never
   copied from a number someone typed), and
2. the same spec produces **byte-identical** artifacts on a re-run (plan §9, "identical
   outputs").

The generated macro and the design are written to ``data/cad/generated/`` so a human can read
exactly what the engine will build; ``--check`` proves the committed fixtures are fresh (no
engine needed, so CI can run it).
"""

from __future__ import annotations

import json
import pathlib
import time
from dataclasses import dataclass
from typing import Any, Callable

from archres_core.cad.pool import WorkerConfig, WorkerPool

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
GENERATED = ROOT / "data" / "cad" / "generated"
VOLUME_TOLERANCE = 0.001
POSITION_TOLERANCE_MM = 0.01


@dataclass(frozen=True)
class Generator:
    """One generator: how to design it, how to name its artefacts, how to check the result."""

    name: str
    case: str
    build: Callable[[], tuple[Any, str]]
    expected_objects: Callable[[Any], list[dict[str, Any]]]

    @property
    def macro_path(self) -> pathlib.Path:
        return GENERATED / f"{self.name}-{self.case}.py"

    @property
    def design_path(self) -> pathlib.Path:
        return GENERATED / f"{self.name}-{self.case}.design.json"

    @property
    def manifest_path(self) -> pathlib.Path:
        return GENERATED / "manifest.json"

    def write_fixtures(self, design: Any, macro: str) -> None:
        GENERATED.mkdir(parents=True, exist_ok=True)
        self.macro_path.write_text(macro, encoding="utf-8", newline="\n")
        self.design_path.write_text(
            json.dumps(design.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        manifest_path = self.manifest_path
        existing: dict[str, Any] = {}
        if manifest_path.is_file():
            existing = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = dict(existing.get("files") or {})
        files[self.macro_path.name] = {"bytes": self.macro_path.stat().st_size}
        files[self.design_path.name] = {"bytes": self.design_path.stat().st_size}
        entries = set()
        cases = existing.get("cases")
        if isinstance(cases, dict):
            entries.update(str(item) for item in (cases.get("entries") or []))
        elif isinstance(cases, list):
            entries.update(str(item) for item in cases)
        entries.add(f"{self.name}:{self.case}")
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

    def check_fixtures(self, design: Any, macro: str) -> list[str]:
        problems: list[str] = []
        for path in (self.macro_path, self.design_path):
            if not path.is_file():
                problems.append(f"missing {path.relative_to(ROOT).as_posix()}")
        if problems:
            return problems
        if self.macro_path.read_text(encoding="utf-8") != macro:
            problems.append(f"{self.macro_path.relative_to(ROOT).as_posix()} is stale")
        expected = json.dumps(design.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        if self.design_path.read_text(encoding="utf-8") != expected:
            problems.append(f"{self.design_path.relative_to(ROOT).as_posix()} is stale")
        return problems


def compare_measurement(measured: dict, expected_objects: list[dict[str, Any]]) -> list[str]:
    """The measurement must match the design (computed expectations, never copied numbers)."""
    problems: list[str] = []
    objects = {item.get("name"): item for item in measured.get("objects") or []}
    for expected in expected_objects:
        actual = objects.get(expected["name"])
        if actual is None:
            problems.append(f"the document has no object named {expected['name']!r}")
            continue
        volume = float(actual.get("volumeM3") or 0.0)
        target = float(expected["volumeM3"])
        if abs(volume - target) > VOLUME_TOLERANCE * max(target, 1e-9):
            problems.append(
                f"{expected['name']}: measured {volume:g} m3, the design says {target:g} m3"
            )
        if not actual.get("valid"):
            problems.append(f"{expected['name']}: the measured shape is not valid")
        wanted_z = expected.get("bboxZMm")
        if wanted_z:
            measured_min = (actual.get("bboxMinMm") or [0, 0, 0])[2]
            measured_max = (actual.get("bboxMaxMm") or [0, 0, 0])[2]
            if abs(measured_min - wanted_z[0]) > POSITION_TOLERANCE_MM:
                problems.append(
                    f"{expected['name']}: the measured base is {measured_min:g} mm, "
                    f"the design says {wanted_z[0]:g} mm"
                )
            if abs(measured_max - wanted_z[1]) > POSITION_TOLERANCE_MM:
                problems.append(
                    f"{expected['name']}: the measured top is {measured_max:g} mm, "
                    f"the design says {wanted_z[1]:g} mm"
                )
    extra = sorted(set(objects) - {item["name"] for item in expected_objects})
    if extra:
        problems.append(f"the document holds objects the design does not declare: {extra}")
    return problems


def run_probe(
    generator: Generator,
    *,
    engine: pathlib.Path,
    workdir: pathlib.Path,
) -> dict:
    """Build, run twice through the pool, compare with the design, and write the fixtures."""
    design, macro = generator.build()
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
    report: dict = {"case": generator.case, "generator": generator.name}
    failures: list[str] = []
    started = time.monotonic()
    try:
        pool.start()
        hashes: list[Any] = []
        for attempt in (1, 2):
            job_id = f"{generator.name}-{attempt}"
            result = pool.submit(
                kind="geometry.build",
                params={"script": macro},
                job_id=job_id,
            )
            if result.get("status") != "ok":
                failures.append(f"run {attempt}: the job failed: {result.get('error')}")
                break
            hashes.append(next(
                (item.get("sha256") for item in result.get("artifacts") or []
                 if item.get("name") == "geometry.json"),
                None,
            ))
            report[f"run{attempt}Ms"] = round((time.monotonic() - started) * 1000.0, 1)
            if attempt == 1:
                report["artifactSha256"] = hashes[-1]
            path = pool.artifact_path(job_id, "geometry.json")
            if path is None or not path.is_file():
                failures.append(f"run {attempt}: the geometry artifact is missing")
                break
            measured = json.loads(path.read_text(encoding="utf-8"))
            if attempt == 1:
                report["measuredObjects"] = measured.get("objects")
                failures.extend(
                    compare_measurement(measured, generator.expected_objects(design))
                )
        if len(hashes) == 2 and hashes[0] != hashes[1]:
            failures.append(f"the two runs produced different geometry: {hashes}")
    finally:
        pool.stop()
    report["elapsedSeconds"] = round(time.monotonic() - started, 3)

    generator.write_fixtures(design, macro)
    failures.extend(generator.check_fixtures(design, macro))
    report["ok"] = not failures
    report["failures"] = failures
    return report
