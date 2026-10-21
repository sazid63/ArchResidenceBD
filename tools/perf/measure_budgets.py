"""Measure the app's hot paths on this machine, and write the budgets down.

    uv run --directory core python ../tools/perf/measure_budgets.py --write
    uv run --directory core python ../tools/perf/measure_budgets.py --check

A measurement that could not be taken is **absent** ✓ — never a zero ✓ — so a missing
number is a gap in the record ✓ and the tool says which one it was ✓ ✓.

The record is a *measurement* ✓, not a derivation ✓: it is not reproducible byte-for-byte
✓ (the machine's speed is not a function of the input ✓), so there is no freshness law
over it ✓ — but the **budgets** are the repo's ✓ (they are in the code ✓, not in the prose
✓ ✓) and the tool fails when a measurement is **over** its budget ✓ ✓.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.perf import BUDGETS, budget_document, measure_all
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "perf" / "budgets.json"


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Measure the app's hot paths on this machine (the perf budgets)."
    )
    parser.add_argument("--out", default=str(OUT), help="where the record is written")
    parser.add_argument("--write", action="store_true", help="write the record")
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail when a measurement is over its budget (the record is not written)",
    )
    args = parser.parse_args(argv)

    measurements = measure_all(ROOT)
    document = budget_document(measurements, root=ROOT)

    print(f"the machine: {document['machine']['processor']} · python {document['machine']['python']}")
    for row in document["measurements"]:
        mark = "within budget" if row["withinBudget"] else "OVER BUDGET"
        print(f"  {row['name']:22} {row['seconds']:.4f}s  budget {row['budgetSeconds']}  {mark}")
    counts = document["counts"]
    print(f"  the counts: {counts}")

    if counts["unmeasured"]:
        print(
            "  these budgets were NOT measured (a gap, not a pass): "
            + ", ".join(
                name for name in BUDGETS if name not in {row["name"] for row in document["measurements"]}
            ),
            file=sys.stderr,
        )

    if args.check:
        if counts["overBudget"]:
            print("FAIL a measurement is over its budget", file=sys.stderr)
            return 1
        print("every measured path is within its budget")
        return 0

    if args.write:
        target = pathlib.Path(args.out)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(f"  the record is in {target}")
        return 0

    print(json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
