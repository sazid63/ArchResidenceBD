"""The compliance reports (W3.6): the audit and the Deviation Register, for a reader."""

from __future__ import annotations

import json
import pathlib

from archres_core.compliance import evaluate_spec, load_pack
from archres_core.compliance.report import (
    BN_DIGITS,
    FONT_STACK,
    audit_sections,
    bn_number,
    register_entries,
    render_audit_html,
    render_audit_markdown,
    render_register_html,
    render_register_markdown,
)

from archres_core.spec import apply_patch

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _verdict_set() -> dict:
    """A project the engine can judge: the example plus the design inputs a v0 run needs."""
    spec = json.loads((ROOT / "spec" / "examples" / "new-project.json").read_text(encoding="utf-8"))
    spec = apply_patch(
        spec,
        [
            {"op": "add", "path": "/phases/0/data/setbackFrontM", "value": 1.2},
            {"op": "add", "path": "/phases/0/data/setbackRearM", "value": 2.0},
            {"op": "add", "path": "/phases/0/data/setbackSideLeftM", "value": 1.25},
            {"op": "add", "path": "/phases/0/data/setbackSideRightM", "value": 1.25},
            {"op": "add", "path": "/phases/0/data/plannedTotalFloorAreaSqm", "value": 1400},
            {"op": "add", "path": "/phases/0/data/parkingSpaces", "value": 1},
            {"op": "add", "path": "/building/typicalUnitAreaSqm", "value": 150},
        ],
        provenance={"source": "user"},
        at="2026-10-21T00:00:00+00:00",
    )
    pack = load_pack(PACK)
    return evaluate_spec(spec, pack, pack_path=PACK, evaluated_at="2026-10-21T00:00:00+00:00")


def test_the_audit_carries_every_verdict_and_every_declared_gap() -> None:
    verdict_set = _verdict_set()
    markdown = render_audit_markdown(verdict_set)
    for verdict in verdict_set["verdicts"]:
        assert verdict["ruleRef"] in markdown, verdict["ruleRef"]
    for item in verdict_set["unevaluated"]:
        assert item["ruleRef"] in markdown, item["ruleRef"]
    # The pack's identity travels with the report.
    assert verdict_set["pack"]["id"] in markdown
    assert verdict_set["pack"]["sha256"][:12] in markdown
    assert verdict_set["pack"]["status"] in markdown


def test_the_audit_counts_agree_with_the_verdicts() -> None:
    verdict_set = _verdict_set()
    summary = verdict_set["summary"]
    for status in ("compliant", "deviation", "impossible"):
        found = sum(1 for item in verdict_set["verdicts"] if item["status"] == status)
        assert summary[status] == found


def test_the_sections_group_the_verdicts() -> None:
    sections = audit_sections(_verdict_set(), "en")
    assert set(sections) >= {"compliant", "deviation", "impossible", "notEvaluated"}
    assert len(sections["compliant"]) + len(sections["deviation"]) + len(sections["impossible"]) == len(
        _verdict_set()["verdicts"]
    )


def test_the_bangla_report_uses_the_fonts_the_plan_names_and_bangla_numerals() -> None:
    html = render_audit_html(_verdict_set(), lang="bn")
    assert "Noto Sans Bengali" in html
    assert FONT_STACK.split(",")[0] in html
    assert 'lang="bn"' in html
    assert bn_number(3) == "৩"
    assert bn_number(119599.7) == "১১৯৫৯৯.৭"
    assert "".join(sorted(BN_DIGITS)) == "".join(sorted("০১২৩৪৫৬৭৮৯"))


def test_the_bangla_report_carries_the_packs_own_bangla() -> None:
    """The Bangla is the pack's text, not a translation of ours."""
    verdict_set = _verdict_set()
    html = render_audit_html(verdict_set, lang="bn")
    bangla_titles = [
        verdict["title"]["bn"] for verdict in verdict_set["verdicts"] if verdict.get("title", {}).get("bn")
    ]
    assert bangla_titles, "the pack must carry Bangla titles"
    assert any(title in html for title in bangla_titles)


def test_the_register_carries_every_entry_with_its_tier() -> None:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    markdown = render_register_markdown(spec)
    for entry in register_entries(spec):
        assert entry["id"] in markdown
        assert entry["ruleRef"] in markdown
        assert entry["riskTier"] in markdown


def test_the_register_shows_the_price_deviation_as_a_cost_risk() -> None:
    from archres_core.pricing import apply_override, apply_pricing, pricing_block, resolve_card

    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    card = json.loads(
        (ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json").read_text(
            encoding="utf-8"
        )
    )
    priced = apply_pricing(spec, pricing_block(resolve_card(card, "dhaka")))
    overridden = apply_override(
        priced, priced["pricing"], card, "cement-opc-43", 575.0, reason="local mill quote"
    )
    markdown = render_register_markdown(overridden)
    assert "price-cement-opc-43" in markdown
    assert "cost_risk" in markdown
    assert "local mill quote" in markdown
    assert "575.00 BDT/bag" in markdown


def test_the_html_escapes_what_it_prints() -> None:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    spec.setdefault("deviations", []).append(
        {
            "id": "dev-x",
            "ruleRef": "rajuk@2008.1#x",
            "ruleTitle": "<script>alert(1)</script>",
            "expected": "1",
            "actual": "2",
            "riskTier": "cosmetic",
            "acknowledged": True,
            "recordedAt": "2026-10-21T00:00:00+00:00",
        }
    )
    html = render_register_html(spec, lang="en")
    assert "<script>alert(1)</script>" not in html
    assert "&lt;script&gt;" in html
