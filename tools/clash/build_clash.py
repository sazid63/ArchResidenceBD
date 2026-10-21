"""Build the clash and coordination report (W3.2) - and check the committed one is fresh.

The check is on the **design** ✓, so it needs **no engine** ✓: the members come from the same
design objects the engine builds from ✓ and the MEP's points come from W3.1 ✓, all in the
shared datum W2.9 established ✓.

    uv run --directory core python ../tools/clash/build_clash.py --write
    uv run --directory core python ../tools/clash/build_clash.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.clash import (
    clash_report,
    members_from_commons,
    members_from_floor,
    members_from_foundation,
    render_clash_markdown,
)
from archres_core.design.commons import design_common_services
from archres_core.design.mep import design_mep
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
OUT_JSON = ROOT / "data" / "cad" / "generated" / "clash-report.json"
OUT_MARKDOWN = ROOT / "data" / "cad" / "generated" / "clash-report.md"

#: The stair flight is a sloped slab, so its box is not its shape - it is not checked.
DECLARED_ABSENT = (
    "the stair flight: it is a sloped slab, so its box is not the member's shape, and a box "
    "that is not the member's shape invents clashes",
    "the members of one phase against each other: inside a phase the members join (a beam "
    "lands on a column), and a box overlap at a junction is not a clash",
    "the MEP's own runs (the conduit, the water pipe and the gas pipe): the v0 runs are "
    "W2.12's assumed sizes, and the MEP sizes the branches that come off them",
    "the 3D routing between the MEP's points: the plan's §5.7 puts full 3D routing in v2",
)


def build() -> tuple[dict, str]:
    """The clash report for the example building."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    members = list(members_from_foundation(foundation))
    points = []
    for index in range(2):
        floor = design_typical_floor(spec, foundation, storey_index=index)
        commons = design_common_services(spec, floor, storey_index=index)
        lift = commons.lifts[0] if commons.lifts else None
        mep = design_mep(spec, floor, storey_index=index, lift=lift)
        members.extend(members_from_floor(floor))
        members.extend(members_from_commons(commons))
        points.extend(mep.points)
    report = clash_report(tuple(members), tuple(points), declared_absent=DECLARED_ABSENT)
    document = report.as_dict()
    document["case"] = EXAMPLE.name
    return document, render_clash_markdown(report)


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the clash and coordination report.")
    parser.add_argument("--write", action="store_true", help="write the committed artefacts")
    parser.add_argument("--check", action="store_true", help="check the committed artefacts are fresh")
    args = parser.parse_args()

    document, markdown = build()
    text = json.dumps(document, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    summary = document["summary"]

    if args.check:
        problems = []
        if not OUT_JSON.is_file():
            problems.append(f"{OUT_JSON.name} is missing")
        elif OUT_JSON.read_text(encoding="utf-8") != text:
            problems.append(f"{OUT_JSON.name} is stale")
        if not OUT_MARKDOWN.is_file():
            problems.append(f"{OUT_MARKDOWN.name} is missing")
        elif OUT_MARKDOWN.read_text(encoding="utf-8") != markdown:
            problems.append(f"{OUT_MARKDOWN.name} is stale")
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print(
            f"the committed clash report is fresh: {summary['members']} members, "
            f"{summary['points']} points, {summary['clashes']} clash(es) "
            f"({', '.join(f'{count} {name}' for name, count in summary['bySeverity'].items()) or 'none'})"
        )
        return 0

    if args.write:
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(text, encoding="utf-8", newline="\n")
        OUT_MARKDOWN.write_text(markdown, encoding="utf-8", newline="\n")
        print(
            f"wrote {OUT_JSON.relative_to(ROOT).as_posix()} and "
            f"{OUT_MARKDOWN.relative_to(ROOT).as_posix()}: {summary['members']} members, "
            f"{summary['points']} points, {summary['clashes']} clash(es)"
        )
        return 0

    print(markdown, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
