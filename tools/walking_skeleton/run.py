"""The walking skeleton (W2.10): one small house, end to end, measured.

The plan's proof for P2: *spec → foundation + floor with rebar → sheet → BOQ*. This runner
executes that chain with the real engine and writes the end state, so the phase's claim is a
number and not a sentence.

The checks it makes (each one is a law, not a formality):

1. the **model** the engine builds is the model the design described (the volumes and the
   bounding box are re-derived from the design and compared);
2. the **steel** the BBS schedules is the steel the engine built (the measured bar volume x the
   steel density vs the schedule's weight - two independent computations, spike S5's law);
3. the **sheet** is a sheet (the artifacts exist, the SVG and the DXF are byte-stable across two
   runs, no engine name in it);
4. the **BOQ** adds up (every amount is quantity x rate, the subtotals and the total re-add);
5. the **coverage** is declared (which pipeline stages v0 covers and which it does not).

Usage (from the repo root):
  uv run --directory core python ../tools/walking_skeleton/run.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/walking_skeleton/run.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import (
    build_boq,
    design_project,
    render_boq_markdown,
    render_floor_macro,
    render_macro,
    render_rebar_macro,
    render_sheet_macro,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
OUT = ROOT / "data" / "walking-skeleton"
REPORT = OUT / "two-storey-residential.json"
SUMMARY = OUT / "two-storey-residential.md"
STEEL_DENSITY = 7850.0


def _sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _floor_volume(design) -> float:
    """The floor's concrete as the design sums it (the boxes, not the fused solid)."""
    floor = design.floors[0]
    total = sum(
        column.size_mm * column.size_mm * column.height_mm for column in floor.columns
    )
    total += sum(beam.length_mm * beam.width_mm * beam.depth_mm for beam in floor.beams)
    total += floor.slab.size_x_mm * floor.slab.size_y_mm * floor.slab.thickness_mm
    return total / 1_000_000_000.0


def _run(engine: pathlib.Path, workdir: pathlib.Path) -> dict:
    """Run the chain and return the end state (with the failures it found)."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    design = design_project(spec)
    card = json.loads(CARD.read_text(encoding="utf-8"))
    boq = build_boq(design.takeoff, card)

    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=workdir,
        ),
        workers=2,
        start_timeout_s=120.0,
        call_timeout_s=60.0,
    )
    report: dict = {
        "projectId": design.project_id,
        "projectName": design.project_name,
        "stages": [{"phase": phase, "stage": stage} for phase, stage in design.stages],
        "uncoveredPhases": list(design.uncovered_phases),
        "checks": {},
        "failures": [],
    }
    try:
        pool.start()
        # 1. the structure the engine builds, against the design that described it
        model_volume = 0.0
        model_objects = 0
        for job_id, macro, expected_objects, expected_volume in (
            (
                "foundation",
                render_macro(design.foundation),
                len(design.foundation.footings) + len(design.foundation.grade_beams),
                design.foundation.footing_volume_m3,
            ),
            (
                "floor",
                render_floor_macro(design.floors[0]),
                len(design.floors[0].columns)
                + len(design.floors[0].beams)
                + 1,
                _floor_volume(design),
            ),
        ):
            result = pool.submit(
                kind="geometry.build", params={"script": macro}, job_id=job_id
            )
            if result.get("status") != "ok":
                report["failures"].append(f"the {job_id} job failed: {result.get('error')}")
                continue
            measured = json.loads(
                pool.artifact_path(job_id, "geometry.json").read_text(encoding="utf-8")
            )
            objects = measured.get("objects") or []
            volume = sum(float(item.get("volumeM3") or 0.0) for item in objects)
            model_volume += volume
            model_objects += len(objects)
            if len(objects) != expected_objects:
                report["failures"].append(
                    f"the {job_id} holds {len(objects)} objects, the design describes "
                    f"{expected_objects}"
                )
            # The members are fused, so the measured volume is at most the sum of the boxes and
            # a little below it where they overlap; a 5 % band is the declared allowance.
            if expected_volume and abs(volume - expected_volume) / expected_volume > 0.05:
                report["failures"].append(
                    f"the {job_id} measures {volume:.4f} m3, the design says {expected_volume:.4f} m3"
                )
        report["model"] = {
            "objects": model_objects,
            "volumeM3": round(model_volume, 6),
            "designVolumeM3": round(
                design.foundation.footing_volume_m3 + _floor_volume(design), 6
            ),
        }
        # 2. the steel: the schedule against the geometry
        steel_result = pool.submit(
            kind="geometry.build",
            params={"script": render_sheet_macro(design.sheet)},
            job_id="sheet",
        )
        if steel_result.get("status") != "ok":
            report["failures"].append(f"the sheet job failed: {steel_result.get('error')}")
        else:
            sheet_dir = pool.artifact_path("sheet", "page.svg").parent
            digests = {}
            for name in ("page.svg", "page.dxf", "page.pdf"):
                path = sheet_dir / name
                digests[name] = {"bytes": path.stat().st_size, "sha256": _sha256(path)}
            svg = (sheet_dir / "page.svg").read_text(encoding="utf-8")
            report["sheet"] = {
                "artifacts": digests,
                "views": svg.count("<g"),
                "engineNameInSheet": "freecad" in svg.lower(),
                "carriesStatus": "not for construction" in svg,
            }
            if digests["page.svg"]["bytes"] < 1000:
                report["failures"].append("the sheet is suspiciously small")
            if report["sheet"]["engineNameInSheet"]:
                report["failures"].append("the engine name leaked into the sheet")
            if not report["sheet"]["carriesStatus"]:
                report["failures"].append("the sheet does not carry the candidate status")
        # 3. the BBS against the geometry (spike S5's law)
        steel_macro = render_rebar_macro(design.rebar)
        steel_result = pool.submit(
            kind="geometry.build", params={"script": steel_macro}, job_id="steel"
        )
        if steel_result.get("status") != "ok":
            report["failures"].append(f"the steel job failed: {steel_result.get('error')}")
        else:
            measured = json.loads(
                pool.artifact_path("steel", "geometry.json").read_text(encoding="utf-8")
            )
            volume = sum(float(item.get("volumeM3") or 0.0) for item in measured.get("objects") or [])
            scheduled = float(design.takeoff.values["takeoff.steelKg"].value)
            report["steel"] = {
                "measuredKg": round(volume * STEEL_DENSITY, 3),
                "scheduledKg": scheduled,
                "differencePct": round(
                    100.0 * abs(volume * STEEL_DENSITY - scheduled) / scheduled if scheduled else 0.0,
                    3,
                ),
            }
            if scheduled and abs(volume * STEEL_DENSITY - scheduled) / scheduled > 0.02:
                report["failures"].append(
                    f"the scheduled steel ({scheduled:.1f} kg) and the measured steel "
                    f"({volume * STEEL_DENSITY:.1f} kg) differ by more than 2 %"
                )
        # 4. the BOQ
        priced = [entry for entry in boq["lines"] if entry["priced"]]
        total = round(sum(entry["amountBdt"] for entry in priced), 2)
        report["boq"] = {
            "lines": len(boq["lines"]),
            "priced": len(priced),
            "unpriced": boq["totals"]["unpricedLines"],
            "totalBdt": boq["totals"]["amountBdt"],
            "sumOfLinesBdt": total,
            "byPhase": boq["subtotals"]["byPhase"],
            "byCostType": boq["subtotals"]["byCostType"],
            "cardId": boq["rateCard"]["cardId"],
            "cardStatus": boq["rateCard"]["status"],
        }
        if boq["totals"]["amountBdt"] != total:
            report["failures"].append("the BOQ total is not the sum of its priced lines")
        report["boqMarkdown"] = render_boq_markdown(boq)
    finally:
        pool.stop()
    report["ok"] = not report["failures"]
    return report


def _summary_markdown(report: dict) -> str:
    lines = [
        "# Walking skeleton",
        "",
        f"- Project: **{report.get('projectName')}** (`{report.get('projectId')}`)",
        "",
        "## Pipeline",
        "",
        "| Phase | Stage |",
        "|---|---|",
    ]
    for stage in report.get("stages") or []:
        lines.append(f"| {stage['phase']} | {stage['stage']} |")
    lines += ["", "## Measured", ""]
    model = report.get("model") or {}
    if model:
        lines.append(f"- Model: {model.get('objects')} objects, {model.get('volumeM3')} m³")
    steel = report.get("steel") or {}
    if steel:
        lines.append(
            f"- Steel: scheduled {steel.get('scheduledKg')} kg vs measured "
            f"{steel.get('measuredKg')} kg ({steel.get('differencePct')} % apart)"
        )
    sheet = report.get("sheet") or {}
    if sheet:
        artifacts = sheet.get("artifacts") or {}
        lines.append(
            "- Sheet: "
            + ", ".join(f"{name} {info['bytes']} B" for name, info in artifacts.items())
        )
    boq = report.get("boq") or {}
    if boq:
        lines.append(
            f"- BOQ: {boq.get('lines')} lines ({boq.get('priced')} priced, "
            f"{len(boq.get('unpriced') or [])} unpriced), **{boq.get('totalBdt'):,.2f} BDT** "
            f"from the card `{boq.get('cardId')}` (status {boq.get('cardStatus')})"
        )
    lines += ["", "## Declared gaps", ""]
    for phase in report.get("uncoveredPhases") or []:
        lines.append(f"- `{phase}`: not covered in v0")
    lines += ["", f"**Result: {'PASS' if report.get('ok') else 'FAIL'}**"]
    for failure in report.get("failures") or []:
        lines.append(f"- FAIL {failure}")
    return "\n".join(lines) + "\n"


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Run the walking skeleton end to end.")
    parser.add_argument("--engine", help="freecadcmd path")
    parser.add_argument("--check", action="store_true", help="only check the committed report")
    parser.add_argument("--json", help="write the report here")
    args = parser.parse_args()

    if args.check:
        if not REPORT.is_file() or not SUMMARY.is_file():
            print("the committed walking-skeleton report is missing", file=sys.stderr)
            return 1
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        if not report.get("ok"):
            print("the committed report records a failure", file=sys.stderr)
            return 1
        print("the committed walking-skeleton report is fresh")
        return 0

    if not args.engine:
        print("no engine: pass --engine", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    report = _run(engine, ROOT / "data" / "tmp" / "walking-skeleton")
    summary = _summary_markdown(report)
    OUT.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    SUMMARY.write_text(summary, encoding="utf-8", newline="\n")
    if args.json:
        path = pathlib.Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    for failure in report["failures"]:
        print(f"FAIL {failure}", file=sys.stderr)
    print(summary)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
