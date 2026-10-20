"""Typical floor generator probe (W2.3): the storey rides the foundation's grid.

The chain is the one W2.2 established, one storey up:

    Building Spec -> FoundationDesign + FloorDesign -> generated macro -> CAD worker pool
    -> measured geometry

The measurement is compared with the **design's** computed expectations, and the same spec is
run twice so the artifacts must be byte-identical (plan §9). The generated macro and the
design land in `data/cad/generated/`; `--check` proves they are fresh without an engine.

Usage (from the repo root):
  uv run --directory core python ../tools/cad/floor_probe.py --engine "<freecadcmd>"
  uv run --directory core python ../tools/cad/floor_probe.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import design_foundation, design_typical_floor, render_floor_macro
from archres_core.stdio import utf8_stdio

from design_probe import ROOT, Generator, run_probe

CASE = "two-storey-residential"
STOREY = 1
EXAMPLES = ROOT / "spec" / "examples"


def _build():
    spec = json.loads((EXAMPLES / f"{CASE}.json").read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    design = design_typical_floor(spec, foundation, storey_index=STOREY)
    return design, render_floor_macro(design)


GENERATOR = Generator(
    name="floor",
    case=CASE,
    build=_build,
    expected_objects=lambda design: design.expected_objects(),
)


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the typical floor generator.")
    parser.add_argument("--engine", help="freecadcmd path (omit for a freshness check only)")
    parser.add_argument("--check", action="store_true", help="only check the committed fixtures")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    design, macro = GENERATOR.build()
    if args.check:
        problems = GENERATOR.check_fixtures(design, macro)
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the generated floor fixtures are fresh")
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
        workdir=ROOT / "data" / "tmp" / "floor-probe",
    )
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
    design = GENERATOR.build()[0]
    print(
        f"floor probe passed: {len(design.columns)} columns, {len(design.beams)} beams, "
        f"1 slab, artifact {report.get('artifactSha256', '')[:16]}, {report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
