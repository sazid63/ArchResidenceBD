"""The BOQ (W2.6): the quantities we measured, priced from a rate card."""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.design import (
    build_boq,
    design_foundation,
    design_rebar,
    design_takeoff,
    design_typical_floor,
    render_boq_markdown,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
SCHEMA = ROOT / "spec" / "schemas" / "boq.schema.json"


def _boq():
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)
    card = json.loads(CARD.read_text(encoding="utf-8"))
    return takeoff, build_boq(takeoff, card), card


def test_the_takeoff_comes_from_the_design() -> None:
    takeoff, _boq_doc, _card = _boq()
    keys = {line.key: line for line in takeoff.lines}
    assert keys["cement-foundation"].provenance == "assumed"
    assert keys["steel"].provenance == "derived"
    assert keys["steel"].source.startswith("BBS")
    assert keys["excavation"].quantity > 0
    assert takeoff.values["takeoff.steelKg"].provenance == "derived"


def test_the_boq_validates_against_the_frozen_schema() -> None:
    import jsonschema

    _takeoff, boq, _card = _boq()
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema).validate(boq)


def test_the_totals_are_the_sum_of_the_priced_lines() -> None:
    _takeoff, boq, _card = _boq()
    total = round(sum(entry["amountBdt"] for entry in boq["lines"] if entry["priced"]), 2)
    assert boq["totals"]["amountBdt"] == total
    for phase, amount in boq["subtotals"]["byPhase"].items():
        own = round(
            sum(
                entry["amountBdt"]
                for entry in boq["lines"]
                if entry["phase"] == phase and entry["priced"]
            ),
            2,
        )
        assert amount == own
    for cost_type, amount in boq["subtotals"]["byCostType"].items():
        own = round(
            sum(
                entry["amountBdt"]
                for entry in boq["lines"]
                if entry["costType"] == cost_type and entry["priced"]
            ),
            2,
        )
        assert amount == own


def test_a_line_the_card_cannot_price_stays_visible() -> None:
    _takeoff, boq, _card = _boq()
    unpriced = boq["totals"]["unpricedLines"]
    assert unpriced, "the v0 card has no formwork rate - the line must stay visible"
    for entry in boq["lines"]:
        if entry["key"] in unpriced:
            assert entry["amountBdt"] is None
            assert entry["rateBdt"] is None
            assert entry["priced"] is False


def test_the_rate_card_travels_with_the_document() -> None:
    _takeoff, boq, card = _boq()
    assert boq["rateCard"]["cardId"] == card["cardId"]
    assert boq["rateCard"]["status"] == card["status"]
    assert boq["rateCard"]["source"]["name"] == card["source"]["name"]


def test_a_candidate_card_says_so_on_the_document() -> None:
    _takeoff, boq, card = _boq()
    assert card["status"] == "candidate"
    markdown = render_boq_markdown(boq)
    assert "not a quotation" in markdown
    assert "Total" in markdown
    assert f"{boq['totals']['amountBdt']:,.2f}" in markdown
