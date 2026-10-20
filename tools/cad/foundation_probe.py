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

from archres_core.design import design_foundation, render_macro
from archres_core.stdio import utf8_stdio

from design_probe import ROOT, Generator, run_probe

CASE = "two-storey-residential"
EXAMPLES = ROOT / "spec" / "examples"


def _build():
    spec = json.loads((EXAMPLES / f"{CASE}.json").read_text(encoding="utf-8"))
    design = design_foundation(spec)
    return design, render_macro(design)


GENERATOR = Generator(
    name="foundation",
    case=CASE,
    build=_build,
    expected_objects=lambda design: design.expected_objects(),
)


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the foundation generator.")
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
        print("the generated foundation fixtures are fresh")
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
        workdir=ROOT / "data" / "tmp" / "foundation-probe",
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
        f"foundation probe passed: {len(design.footings)} footings, "
        f"{len(design.grade_beams)} grade beams, artifact "
        f"{report.get('artifactSha256', '')[:16]}, {report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
