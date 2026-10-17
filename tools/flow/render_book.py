"""Render the Phase Flow Book from its YAML source (plan 5.5).

Source (edited by hand):  spec/flows/phase-flow-book.yaml
Schema:                   spec/schemas/flow-book.schema.json
Rendered (committed):     docs/flow/phase-flow-book-v0.md

Usage (from the repo root):
  uv run --directory core python ../tools/flow/render_book.py          # render in place
  uv run --directory core python ../tools/flow/render_book.py --check  # verify freshness (CI)

The render fails loudly if the YAML does not satisfy the schema.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
SCHEMA = ROOT / "spec" / "schemas" / "flow-book.schema.json"
OUT = ROOT / "docs" / "flow" / "phase-flow-book-v0.md"

BANNER = (
    "<!-- AUTO-GENERATED from spec/flows/phase-flow-book.yaml - do not edit. -->\n"
    "<!-- Regenerate: uv run --directory core python ../tools/flow/render_book.py -->\n"
    "<!-- Check freshness: uv run --directory core python ../tools/flow/render_book.py --check -->"
)

FALLBACK_LABEL = {
    "default": "fixed default",
    "registry": "Source Registry",
    "area_default": "conservative area default",
    "derive": "derived from other fields",
    "omit": "field left empty",
}

REPEATS_LABEL = {
    "once": "once",
    "per_storey": (
        "per storey - asked once for each floor (`floor-0` ... `floor-<n-1>`; "
        "storeyIndex 0 = ground floor). Phase payloads write to `/phases/floor-<n>/data/...`"
    ),
}


def _load_book() -> dict:
    if not BOOK.exists():
        sys.exit(f"error: flow book not found at {BOOK}")
    data = yaml.safe_load(BOOK.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    errors = sorted(Draft202012Validator(schema).iter_errors(data), key=lambda e: list(e.absolute_path))
    if errors:
        for err in errors:
            print(f"schema error at {list(err.absolute_path)}: {err.message}", file=sys.stderr)
        sys.exit("error: flow book fails spec/schemas/flow-book.schema.json - fix spec/flows/phase-flow-book.yaml")
    return data


def _fmt_value(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _flow_stats(flow: dict) -> tuple[int, int, int, list[str]]:
    questions = flow["questions"]
    conditional = sum(1 for q in questions if "when" in q)
    essential = sum(1 for q in questions if q.get("essential"))
    units: list[str] = []
    for q in questions:
        unit = (q.get("unit") or {}).get("canonical")
        if unit and unit not in units:
            units.append(unit)
    return len(questions), conditional, essential, units


def render(data: dict) -> str:
    flows = data["flows"]
    version = data["bookVersion"]
    status = data["status"]

    totals = [0, 0, 0]
    for flow in flows:
        count, conditional, essential, _ = _flow_stats(flow)
        totals[0] += count
        totals[1] += conditional
        totals[2] += essential

    lines: list[str] = []
    lines.append(BANNER)
    lines.append("")
    lines.append(f"# Phase Flow Book — v{version}")
    lines.append("")
    status_note = {
        "draft": 'first pass; wording is ours — engineer review pending (ADR-0001, label: "engineer validation pending — Launch Plan")',
        "review": "in review",
        "frozen": "frozen",
    }[status]
    lines.append(
        f"**Status:** {status} — {status_note}  ·  "
        "**Languages:** বাংলা + English (hand-authored — never machine-translated)"
    )
    lines.append("")
    lines.append(
        "The authored BN/EN question sets for every phase (plan §5.5). The machine-readable "
        "source of truth is `spec/flows/phase-flow-book.yaml`, validated against "
        "`spec/schemas/flow-book.schema.json` in CI. This rendered book is for reading and review. "
        "To add or change a question: edit the YAML (a data edit), run the tests, then regenerate "
        "this file with `uv run --directory core python ../tools/flow/render_book.py`."
    )
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append("| Flow | Phase kind | Repeats | Questions | Conditional | Essential | Units in play |")
    lines.append("|---|---|---|---|---|---|---|")
    for flow in flows:
        count, conditional, essential, units = _flow_stats(flow)
        phase_kind = f"`{flow['phaseKind']}`" if flow.get("phaseKind") else "—"
        repeats = "once" if flow["repeats"] == "once" else "per storey"
        units_cell = ", ".join(f"`{u}`" for u in units) if units else "—"
        lines.append(
            f"| {flow['id']} — {flow['name']['en']} | {phase_kind} | {repeats} | "
            f"{count} | {conditional} | {essential} | {units_cell} |"
        )
    lines.append(
        f"| **Total** | | | **{totals[0]}** | **{totals[1]}** | **{totals[2]}** | |"
    )
    lines.append("")
    lines.append("---")

    for flow in flows:
        lines.append("")
        lines.append(f"## {flow['id']} — {flow['name']['en']} / {flow['name']['bn']}")
        lines.append("")
        meta_bits = []
        if flow.get("phaseKind"):
            meta_bits.append(f"**Phase kind:** `{flow['phaseKind']}`")
        meta_bits.append(f"**Repeats:** {REPEATS_LABEL[flow['repeats']]}")
        _, _, _, units = _flow_stats(flow)
        meta_bits.append(
            "**Units in play:** " + (", ".join(f"`{u}`" for u in units) if units else "—")
        )
        lines.append(" · ".join(meta_bits))
        lines.append("")
        lines.append(f"**Goal (EN):** {flow['goal']['en']}")
        lines.append("")
        lines.append(f"**লক্ষ্য (বাংলা):** {flow['goal']['bn']}")

        for index, question in enumerate(flow["questions"], start=1):
            lines.append("")
            tags = [question["type"]]
            if question.get("essential"):
                tags.append("essential")
            lines.append(f"### {index}. `{question['id']}` — {', '.join(tags)}")
            lines.append("")
            lines.append(f"- **Ask (EN):** {question['ask']['en']}")
            lines.append(f"- **জিজ্ঞাসা (বাংলা):** {question['ask']['bn']}")
            if "why" in question:
                lines.append(f"- **Why:** {question['why']['en']}")
                lines.append(f"- **কেন:** {question['why']['bn']}")
            maps = f"- **Maps to:** `{question['maps_to']}`"
            if question.get("source"):
                maps += f" · **Source:** {question['source']}"
            lines.append(maps)
            if "unit" in question:
                display = question["unit"].get("display")
                display_text = ", ".join(display) if display else "(canonical only)"
                lines.append(f"- **Units:** canonical `{question['unit']['canonical']}` · display: {display_text}")
            if question.get("options"):
                lines.append("- **Options:**")
                for option in question["options"]:
                    lines.append(
                        f"  - `{option['value']}` — {option['label']['en']} · {option['label']['bn']}"
                    )
            if "when" in question:
                lines.append(f"- **When:** `{question['when']}`")
            if question.get("essential"):
                lines.append(
                    "- **If unanswered:** cannot be assumed — the interview keeps it open "
                    "(other work proceeds with its own flags; nothing stalls)"
                )
            if question.get("fallback"):
                fallback = question["fallback"]
                text = f"- **If unanswered:** {FALLBACK_LABEL[fallback['kind']]}"
                if "value" in fallback:
                    text += f" → `{_fmt_value(fallback['value'])}`"
                lines.append(text)
                if fallback.get("assumption"):
                    lines.append(f"  - **Assumption (EN):** {fallback['assumption']['en']}")
                    lines.append(f"  - **অনুমান (বাংলা):** {fallback['assumption']['bn']}")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the Phase Flow Book (or verify freshness).")
    parser.add_argument("--check", action="store_true", help="verify the committed render is fresh; write nothing")
    args = parser.parse_args()

    text = render(_load_book())

    if args.check:
        if not OUT.exists() or OUT.read_bytes().replace(b"\r\n", b"\n") != text.encode("utf-8"):
            print(
                "STALE docs/flow/phase-flow-book-v0.md - regenerate: "
                "uv run --directory core python ../tools/flow/render_book.py",
                file=sys.stderr,
            )
            return 1
        print("flow book render is fresh")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    print(f"rendered {OUT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
