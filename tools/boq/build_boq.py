"""Build the BOQ for a project: the quantities we measured, priced from a rate card.

The BOQ is *data* (plan §6: per phase, four cost types, subtotals and a grand total); the xlsx
and PDF renderers are P3's job. This tool writes the document and a readable markdown rendering
of it, and refuses to write a BOQ whose arithmetic does not add up.

Usage (from the repo root):
  uv run --directory core python ../tools/boq/build_boq.py --write
  uv run --directory core python ../tools/boq/build_boq.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import (
    build_boq,
    design_foundation,
    design_rebar,
    design_takeoff,
    design_typical_floor,
    render_boq_markdown,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
OUT = ROOT / "data" / "boq"
DOCUMENT = OUT / "two-storey-residential.boq.json"
MARKDOWN = OUT / "two-storey-residential.boq.md"
SCHEMA = ROOT / "spec" / "schemas" / "boq.schema.json"


def build() -> tuple[dict, str]:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)
    card = json.loads(CARD.read_text(encoding="utf-8"))
    boq = build_boq(takeoff, card)
    return boq, render_boq_markdown(boq)


def _check(boq: dict, markdown: str) -> list[str]:
    problems: list[str] = []
    try:
        import jsonschema

        schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
        jsonschema.Draft202012Validator(schema).validate(boq)
    except Exception as exc:  # noqa: BLE001 - a broken document must be reported, not raised
        problems.append(f"the BOQ does not validate against the schema: {exc}")
    priced = [entry for entry in boq["lines"] if entry["priced"]]
    total = round(sum(entry["amountBdt"] for entry in priced), 2)
    if boq["totals"]["amountBdt"] != total:
        problems.append(f"the total {boq['totals']['amountBdt']} is not the sum of the lines {total}")
    for phase, amount in boq["subtotals"]["byPhase"].items():
        own = round(
            sum(
                entry["amountBdt"]
                for entry in priced
                if entry["phase"] == phase
            ),
            2,
        )
        if amount != own:
            problems.append(f"the {phase} subtotal {amount} is not the sum of its lines {own}")
    for entry in priced:
        expected = round(entry["quantity"] * entry["rateBdt"], 2)
        if abs(entry["amountBdt"] - expected) > 0.01:
            problems.append(f"{entry['key']}: the amount is not quantity x rate")
    card = json.loads(CARD.read_text(encoding="utf-8"))
    units = {line["key"]: line["unit"] for line in card.get("lines") or []}
    for entry in boq["lines"]:
        rate_key = entry.get("rateKey")
        if entry["priced"] and rate_key and units.get(rate_key) != entry["unit"]:
            problems.append(
                f"{entry['key']}: priced with a rate per {units.get(rate_key)} but measured per "
                f"{entry['unit']}"
            )
    return problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the BOQ for the example project.")
    parser.add_argument("--write", action="store_true", help="write the committed document")
    parser.add_argument("--check", action="store_true", help="verify the committed document")
    args = parser.parse_args()

    boq, markdown = build()
    problems = _check(boq, markdown)
    for problem in problems:
        print(f"FAIL {problem}", file=sys.stderr)
    if problems:
        return 1

    if args.write:
        OUT.mkdir(parents=True, exist_ok=True)
        DOCUMENT.write_text(
            json.dumps(boq, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        MARKDOWN.write_text(markdown, encoding="utf-8", newline="\n")
        print(
            f"wrote {DOCUMENT.relative_to(ROOT).as_posix()}: {len(boq['lines'])} lines, "
            f"{boq['totals']['amountBdt']:,.2f} BDT "
            f"({boq['totals']['pricedLines']} priced, {len(boq['totals']['unpricedLines'])} unpriced)"
        )
        return 0

    if args.check:
        if not DOCUMENT.is_file() or not MARKDOWN.is_file():
            print("the committed BOQ is missing", file=sys.stderr)
            return 1
        if DOCUMENT.read_text(encoding="utf-8") != json.dumps(
            boq, ensure_ascii=False, indent=2, sort_keys=True
        ) + "\n":
            print("the committed BOQ is stale", file=sys.stderr)
            return 1
        if MARKDOWN.read_text(encoding="utf-8") != markdown:
            print("the committed BOQ markdown is stale", file=sys.stderr)
            return 1
        print("the committed BOQ is fresh")
        return 0

    print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
