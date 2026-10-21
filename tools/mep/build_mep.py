"""Build the MEP design and its schedules (W3.1) - and check the committed one is fresh.

The MEP is a design and a set of schedules, not geometry: it has **no solids** (the plan's
§5.7 puts the full 3D routing in v2 ✓), so it needs **no engine** ✓ - the check is the
deterministic half ✓ (the same input gives the same document ✓).

    uv run --directory core python ../tools/mep/build_mep.py --write
    uv run --directory core python ../tools/mep/build_mep.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.commons import design_common_services
from archres_core.design.mep import design_mep
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
OUT = ROOT / "data" / "cad" / "generated" / "mep-design.json"


def build() -> dict:
    """The MEP design for the example building, one storey at a time."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    storeys = []
    for index in range(2):
        floor = design_typical_floor(spec, foundation, storey_index=index)
        commons = design_common_services(spec, floor, storey_index=index)
        lift = commons.lifts[0] if commons.lifts else None
        mep = design_mep(spec, floor, storey_index=index, lift=lift)
        storeys.append(mep)
    return {
        "schemaVersion": "0.1.0",
        "case": EXAMPLE.name,
        "storeys": [mep.as_dict() for mep in storeys],
        "totals": {
            "points": sum(len(mep.points) for mep in storeys),
            "circuits": sum(len(mep.circuits) for mep in storeys),
            "scheduleRows": sum(len(mep.schedules) for mep in storeys),
            "loadW": sum(mep.total_load_w() for mep in storeys),
            "fixtureUnits": sum(mep.total_fixture_units() for mep in storeys),
            "gasLoadM3PerH": sum(mep.total_gas_load_m3_per_h() for mep in storeys),
        },
    }


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the MEP design and its schedules.")
    parser.add_argument("--write", action="store_true", help="write the committed artefact")
    parser.add_argument("--check", action="store_true", help="check the committed artefact is fresh")
    args = parser.parse_args()

    document = build()
    text = json.dumps(document, ensure_ascii=False, indent=1, sort_keys=True) + "\n"

    if args.check:
        if not OUT.is_file():
            print(f"FAIL {OUT.name} is missing", file=sys.stderr)
            return 1
        committed = OUT.read_text(encoding="utf-8")
        if committed != text:
            print(
                f"FAIL {OUT.name} is stale: the committed document differs from the one the "
                "design produces now",
                file=sys.stderr,
            )
            return 1
        totals = document["totals"]
        print(
            f"the committed MEP design is fresh: {totals['points']} points, "
            f"{totals['circuits']} circuits, {totals['scheduleRows']} schedule rows, "
            f"{totals['loadW']:g} W, {totals['fixtureUnits']:g} FU, "
            f"{totals['gasLoadM3PerH']:g} m³/h"
        )
        return 0

    if args.write:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text, encoding="utf-8", newline="\n")
        totals = document["totals"]
        print(
            f"wrote {OUT.relative_to(ROOT).as_posix()}: {totals['points']} points, "
            f"{totals['circuits']} circuits, {totals['scheduleRows']} schedule rows, "
            f"{totals['loadW']:g} W, {totals['fixtureUnits']:g} FU, "
            f"{totals['gasLoadM3PerH']:g} m³/h"
        )
        return 0

    print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
