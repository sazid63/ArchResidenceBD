"""Render the compliance reports (W3.6): the audit and the Deviation Register, for a reader.

The tool evaluates the example project against the rule pack, renders the four reports (the
audit and the register, each in markdown and in the HTML the plan prints to PDF) and checks
them against the verdict set — a report that does not carry every deviation is a report that
hides something.

The demo spec also carries **one price override** (the price service's own path, W2.7), so the
register shows both kinds of entry: the rule deviation the engine found and the `cost_risk`
price deviation the user acknowledged.

Usage (from the repo root):
  uv run --directory core python ../tools/compliance/render_reports.py --write
  uv run --directory core python ../tools/compliance/render_reports.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from typing import Any

from archres_core.compliance import apply_register, evaluate_spec, load_pack
from archres_core.compliance.report import (
    render_audit_html,
    render_audit_markdown,
    render_register_html,
    render_register_markdown,
)
from archres_core.pricing import apply_override, apply_pricing, pricing_block, resolve_card
from archres_core.spec import apply_patch
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
EXAMPLE = ROOT / "spec" / "examples" / "new-project.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
OUT = ROOT / "data" / "compliance"

#: The design inputs a v0 compliance run needs (the same set the rule engine's own test
#: uses): the setbacks, the planned floor area and the parking spaces.
DESIGN_INPUTS = [
    {"op": "add", "path": "/phases/0/data/setbackFrontM", "value": 1.2},
    {"op": "add", "path": "/phases/0/data/setbackRearM", "value": 2.0},
    {"op": "add", "path": "/phases/0/data/setbackSideLeftM", "value": 1.25},
    {"op": "add", "path": "/phases/0/data/setbackSideRightM", "value": 1.25},
    {"op": "add", "path": "/phases/0/data/plannedTotalFloorAreaSqm", "value": 1400},
    {"op": "add", "path": "/phases/0/data/parkingSpaces", "value": 1},
    {"op": "add", "path": "/building/typicalUnitAreaSqm", "value": 150},
]

#: The fixed moment the reports are stamped with (a committed report must be byte-stable).
AT = "2026-10-21T00:00:00+00:00"

AUDIT_MD = OUT / "audit.md"
AUDIT_HTML = OUT / "audit.bn.html"
REGISTER_MD = OUT / "deviation-register.md"
REGISTER_HTML = OUT / "deviation-register.bn.html"
VERDICTS = OUT / "verdict-set.json"


def _demo_spec() -> dict[str, Any]:
    """A project the engine can actually judge, priced, with one acknowledged price override.

    The example project carries no phase design data, so every rule would come back
    "not evaluated" - a true report, but a thin one. The demo therefore carries the design
    inputs a v0 compliance run needs (the same set the rule engine's own test uses), so the
    audit shows compliant rows and a deviation, and the register shows the engine's entry and
    the user's price override.
    """
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    spec = apply_patch(spec, DESIGN_INPUTS, provenance={"source": "user"}, at=AT)
    card = json.loads(CARD.read_text(encoding="utf-8"))
    region = str(((spec.get("site") or {}).get("address") or {}).get("district") or "dhaka").lower()
    resolved = resolve_card(card, region)
    priced = apply_pricing(spec, pricing_block(resolved), at=AT)
    priced = apply_override(
        priced,
        priced["pricing"],
        card,
        "cement-opc-43",
        575.0,
        reason="local mill quote",
        at=AT,
    )
    return priced


def _render(pack_path: pathlib.Path) -> tuple[dict[str, str], list[str]]:
    """Render the four reports and check them against the verdict set."""
    spec = _demo_spec()
    pack = load_pack(pack_path)
    verdict_set = evaluate_spec(spec, pack, pack_path=pack_path, evaluated_at=AT)
    # The register carries the engine's own entries (the sync) beside the user's price entry.
    spec = apply_register(spec, verdict_set, at=AT)

    audit_md = render_audit_markdown(verdict_set)
    audit_html = render_audit_html(verdict_set)
    register_md = render_register_markdown(spec)
    register_html = render_register_html(spec)

    problems: list[str] = []
    summary = verdict_set.get("summary") or {}
    for status in ("compliant", "deviation", "impossible"):
        count = int(summary.get(status, 0))
        found = sum(
            1 for verdict in verdict_set.get("verdicts") or [] if verdict.get("status") == status
        )
        if count != found:
            problems.append(f"the summary says {count} {status}, the verdicts hold {found}")
    for verdict in verdict_set.get("verdicts") or []:
        if verdict.get("status") != "deviation":
            continue
        if str(verdict.get("ruleRef")) not in audit_md:
            problems.append(f"the audit does not carry the deviation {verdict.get('ruleRef')}")
    for item in verdict_set.get("unevaluated") or []:
        if str(item.get("ruleRef")) not in audit_md:
            problems.append(f"the audit drops the declared gap {item.get('ruleRef')}")
    for entry in spec.get("deviations") or []:
        if str(entry.get("id")) not in register_md:
            problems.append(f"the register does not carry the entry {entry.get('id')}")
    if "cost_risk" not in register_md:
        problems.append("the register does not show the price deviation's risk tier")

    artefacts = {
        AUDIT_MD: audit_md,
        AUDIT_HTML: audit_html,
        REGISTER_MD: register_md,
        REGISTER_HTML: register_html,
        VERDICTS: json.dumps(verdict_set, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    }
    return artefacts, problems


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Render the compliance reports.")
    parser.add_argument("--pack", default=str(DEFAULT_PACK), help="rule pack YAML")
    parser.add_argument("--write", action="store_true", help="write the committed reports")
    parser.add_argument("--check", action="store_true", help="verify the committed reports")
    args = parser.parse_args()

    artefacts, problems = _render(pathlib.Path(args.pack))
    for problem in problems:
        print(f"FAIL {problem}", file=sys.stderr)
    if problems:
        return 1

    if args.write:
        for path, text in artefacts.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote {path.relative_to(ROOT).as_posix()}")
        return 0

    if args.check:
        stale = []
        for path, text in artefacts.items():
            if not path.is_file():
                stale.append(f"{path.relative_to(ROOT).as_posix()} is missing")
            elif path.read_text(encoding="utf-8") != text:
                stale.append(f"{path.relative_to(ROOT).as_posix()} is stale")
        for problem in stale:
            print(f"FAIL {problem}", file=sys.stderr)
        if stale:
            return 1
        print("the committed compliance reports are fresh")
        return 0

    print(artefacts[AUDIT_MD])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
