"""Rebar generator probe (W2.4): the steel the engine builds, and the BBS that prices it.

The chain is the one W2.2/W2.3 established, one layer up:

    Building Spec -> FoundationDesign + FloorDesign -> RebarDesign -> generated macro
    -> CAD worker pool -> measured steel

and then the cross-check that makes the schedule trustworthy: the **BBS computes** the steel
weight from the design (length x pi/4 d^2 x density), while the **engine measures** the same
steel from the geometry (spike S5's law). Two independent computations of the same quantity
must agree - that is the whole point of measuring.

The BBS document is committed next to the macro, so a reviewer can read the schedule the BOQ
will cost.

Usage (from the repo root):
  uv run --directory core python ../tools/cad/rebar_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/rebar_probe.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import (
    STEEL_DENSITY_KG_PER_M3,
    build_bbs,
    design_foundation,
    design_rebar,
    design_typical_floor,
    render_rebar_macro,
)
from archres_core.stdio import utf8_stdio

from design_probe import ROOT, Generator, run_probe

CASE = "two-storey-residential"
STOREY = 1
EXAMPLES = ROOT / "spec" / "examples"
GENERATED = ROOT / "data" / "cad" / "generated"
BBS_PATH = GENERATED / f"rebar-{CASE}.bbs.json"
#: 2 % between the schedule and the measurement: a welded link measures slightly less than its
#: centreline length (the corners overlap) - the same effect spike S5 measured (1.8 %).
STEEL_TOLERANCE = 0.02


def _build():
    spec = json.loads((EXAMPLES / f"{CASE}.json").read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=STOREY)
    design = design_rebar(spec, foundation, floor)
    return design, render_rebar_macro(design)


GENERATOR = Generator(
    name="rebar",
    case=CASE,
    build=_build,
    expected_objects=lambda design: design.expected_objects(),
)


def _bbs_text() -> str:
    design, _macro = _build()
    return json.dumps(build_bbs(design), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _check_bbs() -> list[str]:
    if not BBS_PATH.is_file():
        return [f"missing {BBS_PATH.relative_to(ROOT).as_posix()}"]
    if BBS_PATH.read_text(encoding="utf-8") != _bbs_text():
        return [f"{BBS_PATH.relative_to(ROOT).as_posix()} is stale"]
    return []


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the rebar generator and the BBS.")
    parser.add_argument("--engine", help="freecadcmd path (omit for a freshness check only)")
    parser.add_argument("--check", action="store_true", help="only check the committed fixtures")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    if args.check:
        design, macro = _build()
        problems = GENERATOR.check_fixtures(design, macro)
        problems.extend(_check_bbs())
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the generated rebar fixtures are fresh")
        return 0

    if not args.engine:
        print("no engine: pass --engine or use --check", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    report = run_probe(
        GENERATOR,
        engine=engine,
        workdir=ROOT / "data" / "tmp" / "rebar-probe",
    )
    design, _macro = _build()
    bbs = build_bbs(design)
    GENERATED.mkdir(parents=True, exist_ok=True)
    BBS_PATH.write_text(
        json.dumps(bbs, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    report["bbs"] = {
        "path": BBS_PATH.relative_to(ROOT).as_posix(),
        "marks": len(bbs["items"]),
        "barCount": bbs["totals"]["barCount"],
        "weightKg": bbs["totals"]["weightKg"],
    }

    # The cross-check: the engine's measurement and the schedule must agree.
    measured_volume = sum(
        float(item.get("volumeM3") or 0.0) for item in (report.get("measuredObjects") or [])
    )
    measured_kg = measured_volume * STEEL_DENSITY_KG_PER_M3
    scheduled_kg = float(bbs["totals"]["weightKg"])
    report["steel"] = {
        "measuredM3": round(measured_volume, 9),
        "measuredKg": round(measured_kg, 4),
        "scheduledKg": scheduled_kg,
        "differenceKg": round(measured_kg - scheduled_kg, 4),
        "differencePct": round(
            100.0 * (measured_kg - scheduled_kg) / scheduled_kg if scheduled_kg else 0.0, 4
        ),
    }
    if scheduled_kg and abs(measured_kg - scheduled_kg) / scheduled_kg > STEEL_TOLERANCE:
        report.setdefault("failures", []).append(
            f"the measured steel ({measured_kg:.3f} kg) and the schedule "
            f"({scheduled_kg:.3f} kg) differ by more than {STEEL_TOLERANCE * 100:.1f} %"
        )
        report["ok"] = False

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
    if report["failures"]:
        return 1
    steel = report["steel"]
    print(
        f"rebar probe passed: {len(bbs['items'])} marks, {bbs['totals']['barCount']} bars, "
        f"schedule {scheduled_kg:.1f} kg vs measured {steel['measuredKg']:.1f} kg "
        f"({steel['differencePct']:+.2f} %), {report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
