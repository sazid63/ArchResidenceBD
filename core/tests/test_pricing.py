"""The price service (W2.7): the registry, the regional resolution, the override, the fetch."""

from __future__ import annotations

import http.server
import json
import pathlib
import threading

import pytest

from archres_core.pricing import (
    ConsentRequired,
    CardRegistry,
    PriceServiceError,
    apply_override,
    apply_pricing,
    billable_quantity,
    fetch_card,
    parse_rates,
    pricing_block,
    region_for_district,
    region_for_spec,
    resolve_card,
    resolve_rate,
    restore_override,
)
from archres_core.spec import validate_spec

ROOT = pathlib.Path(__file__).resolve().parents[2]
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
SPEC = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _card() -> dict:
    return json.loads(CARD.read_text(encoding="utf-8"))


def _spec() -> dict:
    return json.loads(SPEC.read_text(encoding="utf-8"))


# ------------------------------------------------------------------- the registry


def test_the_registry_indexes_the_cards_it_holds() -> None:
    registry = CardRegistry.from_directories(ROOT / "spec" / "examples" / "interfaces")
    assert [entry.card_id for entry in registry.cards()] == ["dhaka-example-2026-10"]
    entry = registry.get("dhaka-example-2026-10")
    assert entry.region == "dhaka"
    assert entry.status == "candidate"
    assert entry.sha256 and len(entry.sha256) == 64


def test_a_file_that_is_not_a_card_is_skipped_and_reported() -> None:
    registry = CardRegistry.from_directories(ROOT / "spec" / "examples" / "interfaces")
    skipped = registry.skipped
    assert skipped, "the example interface folder holds files that are not cards"
    assert all(item["reason"] == "not a rate card" for item in skipped)


def test_a_broken_card_is_an_error_not_a_silent_skip(tmp_path: pathlib.Path) -> None:
    broken = json.loads(CARD.read_text(encoding="utf-8"))
    broken["lines"][0].pop("rateBdt")
    (tmp_path / "broken.json").write_text(json.dumps(broken), encoding="utf-8")
    with pytest.raises(PriceServiceError, match="rate-card interface"):
        CardRegistry.from_directories(tmp_path)


def test_two_cards_with_the_same_id_are_an_error(tmp_path: pathlib.Path) -> None:
    (tmp_path / "a.json").write_text(CARD.read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "b.json").write_text(CARD.read_text(encoding="utf-8"), encoding="utf-8")
    with pytest.raises(PriceServiceError, match="claim the id"):
        CardRegistry.from_directories(tmp_path)


def test_the_project_district_finds_the_card_region() -> None:
    assert region_for_district("Dhaka") == "dhaka"
    assert region_for_district("Chittagong") == "chattogram"
    assert region_for_spec(_spec()) == "dhaka"
    with pytest.raises(PriceServiceError, match="no card region"):
        region_for_district("Cox's Bazar")


# ------------------------------------------------------------------ the resolution


def test_the_cards_own_region_is_one_by_definition() -> None:
    rate = resolve_rate(_card(), "cement-opc-43", "dhaka")
    assert rate.rate_bdt == 550.0
    assert rate.multiplier == 1.0
    assert rate.multiplier_status == "own-region"


def test_a_published_multiplier_is_applied() -> None:
    rate = resolve_rate(_card(), "cement-opc-43", "chattogram")
    assert rate.rate_bdt == 583.0  # 550 * 1.06
    assert rate.multiplier_status == "published"
    assert "published by the card" in rate.note


def test_a_region_without_a_multiplier_is_assumed_and_says_so() -> None:
    rate = resolve_rate(_card(), "cement-opc-43", "rajshahi")
    assert rate.rate_bdt == 550.0
    assert rate.multiplier_status == "assumed"
    assert rate.source == "default", "an assumed regional rate is not a fetched price"
    assert "1.00 assumed" in rate.note


def test_a_line_multiplier_beats_the_cards_multiplier() -> None:
    card = _card()
    card["regionalMultipliers"]["chattogram"] = 1.06
    card["lines"][0]["regionalMultipliers"] = {"chattogram": 1.20}
    rate = resolve_rate(card, "cement-opc-43", "chattogram")
    assert rate.rate_bdt == 660.0  # 550 * 1.20, not * 1.06


def test_a_rate_in_another_unit_does_not_price_a_line() -> None:
    rate = resolve_rate(_card(), "cement-opc-43", "dhaka")
    assert rate.prices_line("bag")
    assert not rate.prices_line("ton")


def test_the_resolved_card_still_satisfies_the_frozen_interface() -> None:
    import jsonschema

    from archres_core.interfaces import load_schema

    resolved = resolve_card(_card(), "chattogram")
    jsonschema.Draft202012Validator(load_schema("rate-card")).validate(resolved)
    assert resolved["region"] == "chattogram"
    assert resolved["cardId"] == "dhaka-example-2026-10"


def test_the_machinery_flags_travel_with_the_resolved_card() -> None:
    resolved = resolve_card(_card(), "dhaka")
    excavator = next(line for line in resolved["lines"] if line["key"] == "excavator")
    assert excavator["operatorIncluded"] is True
    assert excavator["fuelIncluded"] is False
    assert excavator["minimumChargeHours"] == 2
    cement = next(line for line in resolved["lines"] if line["key"] == "cement-opc-43")
    assert "operatorIncluded" not in cement


def test_a_minimum_charge_bills_the_minimum_and_says_why() -> None:
    rate = resolve_rate(_card(), "excavator", "dhaka")
    billed, note = billable_quantity(1.05, rate)
    assert billed == 2.0
    assert "minimum" in note
    billed, note = billable_quantity(24.49, rate)
    assert billed == 24.49
    assert note == ""


# ---------------------------------------------------------------- the spec's pricing


def test_the_pricing_block_carries_the_cards_identity() -> None:
    block = pricing_block(resolve_card(_card(), "chattogram"))
    assert block["currency"] == "BDT"
    assert block["card"]["cardId"] == "dhaka-example-2026-10"
    assert block["card"]["region"] == "chattogram"
    assert block["card"]["status"] == "candidate"
    cement = next(entry for entry in block["materials"] if entry["key"] == "cement-opc-43")
    assert cement["rateBdt"] == 583.0
    assert cement["source"] == "default", "a manual candidate card is not a fetched price"


def test_the_machinery_law_travels_into_the_pricing_block() -> None:
    block = pricing_block(resolve_card(_card(), "dhaka"))
    excavator = next(entry for entry in block["machinery"] if entry["key"] == "excavator")
    assert excavator["operatorIncluded"] is True
    assert excavator["fuelIncluded"] is False
    assert excavator["minimumChargeHours"] == 2
    assert "minimum" in excavator["note"]


def test_the_pricing_block_validates_against_the_spec_schema() -> None:
    spec = _spec()
    spec["pricing"] = pricing_block(resolve_card(_card(), "dhaka"))
    validate_spec(spec)


def test_the_pricing_push_records_its_provenance() -> None:
    spec = _spec()
    patched = apply_pricing(spec, pricing_block(resolve_card(_card(), "dhaka")))
    assert patched["pricing"]["card"]["cardId"] == "dhaka-example-2026-10"
    entry = patched["provenance"]["/pricing"]
    assert entry["source"] == "default"
    assert "dhaka-example-2026-10" in entry["detail"]


# --------------------------------------------------------------------- the override


def test_an_override_lands_in_the_pricing_and_in_the_register() -> None:
    spec = _spec()
    card = _card()
    block = pricing_block(resolve_card(card, "dhaka"))
    patched = apply_override(spec, block, card, "cement-opc-43", 575.0, reason="local mill quote")
    cement = next(entry for entry in patched["pricing"]["materials"] if entry["key"] == "cement-opc-43")
    assert cement["rateBdt"] == 575.0
    assert cement["source"] == "user"
    assert "local mill quote" in cement["note"]
    entry = next(item for item in patched["deviations"] if item["id"] == "price-cement-opc-43")
    assert entry["expected"] == "550.00 BDT/bag"
    assert entry["actual"] == "575.00 BDT/bag"
    assert entry["riskTier"] == "cost_risk"
    assert entry["acknowledged"] is True
    assert entry["rationale"] == "local mill quote"
    assert patched["provenance"]["/pricing"]["source"] == "user"


def test_the_register_entry_survives_the_compliance_sync() -> None:
    # The compliance engine owns the "dev-" entries; a price entry is the user's and stays.
    from archres_core.compliance import register_ops

    spec = _spec()
    card = _card()
    block = pricing_block(resolve_card(card, "dhaka"))
    patched = apply_override(spec, block, card, "cement-opc-43", 575.0, reason="local mill quote")
    entry = next(item for item in patched["deviations"] if item["id"] == "price-cement-opc-43")
    assert entry["id"].startswith("price-")

    # A compliance sync (engine-owned entries only) leaves the price entry alone.
    ops = register_ops(patched, {"verdicts": []})
    index = next(
        position
        for position, item in enumerate(patched["deviations"])
        if item.get("id") == "price-cement-opc-43"
    )
    removed = [op for op in ops if op["op"] == "remove"]
    assert not [op for op in removed if op["path"] == f"/deviations/{index}"], (
        "the price entry is the user's - the compliance sync must not remove it"
    )


def test_restoring_a_price_puts_the_card_rate_back() -> None:
    spec = _spec()
    card = _card()
    block = pricing_block(resolve_card(card, "dhaka"))
    patched = apply_override(spec, block, card, "cement-opc-43", 575.0, reason="local mill quote")
    restored = restore_override(patched, patched["pricing"], card, "cement-opc-43")
    cement = next(entry for entry in restored["pricing"]["materials"] if entry["key"] == "cement-opc-43")
    assert cement["rateBdt"] == 550.0
    assert cement["source"] == "default"
    assert not [item for item in restored["deviations"] if item["id"] == "price-cement-opc-43"]


# ------------------------------------------------------------------ the official list


CSV_LIST = """Item,Description,Description EN,Unit,Rate
cement-opc-43,সিমেন্ট ওপিসি ৪৩,Cement OPC 43,bag,552
rod-60g,রড ৬০ গ্রেড,Rod 60 grade,ton,89500
broken-row,কোনো দর নেই,No rate here,bag,
"""

CSV_RECIPE = {
    "kind": "csv",
    "columns": {
        "key": "Item",
        "labelBn": "Description",
        "labelEn": "Description EN",
        "unit": "Unit",
        "rate": "Rate",
    },
    "costType": "material",
}


def test_the_parser_uses_the_recipe_and_reports_the_rows_it_could_not_use(tmp_path: pathlib.Path) -> None:
    artifact = tmp_path / "list.csv"
    artifact.write_text(CSV_LIST, encoding="utf-8")
    lines, skipped = parse_rates(artifact, CSV_RECIPE)
    assert [line["key"] for line in lines] == ["cement-opc-43", "rod-60g"]
    assert lines[0]["label"] == {"bn": "সিমেন্ট ওপিসি ৪৩", "en": "Cement OPC 43"}
    assert lines[0]["rateBdt"] == 552.0
    assert len(skipped) == 1
    assert skipped[0]["reason"] == "no readable rate"


def test_a_row_without_a_reviewed_label_is_not_a_rate_line(tmp_path: pathlib.Path) -> None:
    artifact = tmp_path / "list.csv"
    artifact.write_text("Item,Description,Unit,Rate\ncement-opc-43,সিমেন্ট,bag,552\n", encoding="utf-8")
    lines, skipped = parse_rates(artifact, CSV_RECIPE)
    assert lines == []
    assert skipped[0]["reason"] == "no reviewed label (bn + en)"


def test_the_json_recipe_is_read_the_same_way(tmp_path: pathlib.Path) -> None:
    artifact = tmp_path / "list.json"
    artifact.write_text(
        json.dumps(
            {
                "items": [
                    {
                        "code": "cement-opc-43",
                        "bn": "সিমেন্ট ওপিসি ৪৩",
                        "en": "Cement OPC 43",
                        "unit": "bag",
                        "rate": "552",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    recipe = {
        "kind": "json",
        "path": "items",
        "columns": {
            "key": "code",
            "labelBn": "bn",
            "labelEn": "en",
            "unit": "unit",
            "rate": "rate",
        },
    }
    lines, skipped = parse_rates(artifact, recipe)
    assert [line["key"] for line in lines] == ["cement-opc-43"]
    assert skipped == []


def test_a_fetch_without_consent_is_refused(tmp_path: pathlib.Path) -> None:
    entry = {"id": "test-list", "url": "http://127.0.0.1:9/list.csv", "title": {"en": "Test"}}
    with pytest.raises(ConsentRequired, match="consent"):
        fetch_card(
            entry,
            CSV_RECIPE,
            card_store=tmp_path / "cards",
            cache_root=tmp_path / "cache",
            card_id="test-list",
            region="dhaka",
            consent=False,
        )


def test_a_fetched_list_becomes_a_candidate_card_with_its_provenance(tmp_path: pathlib.Path) -> None:
    served = tmp_path / "list.csv"
    served.write_text(CSV_LIST, encoding="utf-8")

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - the stdlib's name
            body = served.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: object) -> None:  # keep the test output quiet
            return

    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/list.csv"
        entry = {
            "id": "test-list",
            "url": url,
            "title": {"en": "Test official list"},
            "kind": "http-csv",
        }
        result = fetch_card(
            entry,
            CSV_RECIPE,
            card_store=tmp_path / "cards",
            cache_root=tmp_path / "cache",
            card_id="test-list",
            region="dhaka",
            consent=True,
        )
    finally:
        server.shutdown()
        server.server_close()

    card = result["card"]
    assert card["status"] == "candidate", "a fetched list is a candidate until a human says so"
    assert card["source"]["url"] == url
    assert len(card["source"]["sha256"]) == 64
    assert card["source"]["retrievedAt"]
    assert [line["key"] for line in card["lines"]] == ["cement-opc-43", "rod-60g"]
    assert result["path"].is_file()

    # The artifact is hashed in the source cache manifest - the provenance chain's first hop.
    manifest = (tmp_path / "cache" / "manifest.jsonl").read_text(encoding="utf-8").strip()
    row = json.loads(manifest)
    assert row["sha256"] == card["source"]["sha256"]
    assert row["url"] == url

    # And the card it produced is a card the registry accepts.
    registry = CardRegistry.from_directories(tmp_path / "cards")
    assert [entry.card_id for entry in registry.cards()] == ["test-list"]


# ------------------------------------------------------- the BOQ priced from the service


def test_the_boq_priced_from_the_pricing_block_is_the_same_boq() -> None:
    """The price service must not change a price: the same BOQ, from the same card."""
    from archres_core.design import (
        build_boq,
        design_foundation,
        design_rebar,
        design_takeoff,
        design_typical_floor,
    )

    spec = _spec()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)

    card = _card()
    from_card = build_boq(takeoff, card)
    block = pricing_block(resolve_card(card, "dhaka"))
    from_pricing = build_boq(takeoff, block)

    assert from_pricing["totals"] == from_card["totals"]
    assert from_pricing["rateCard"]["cardId"] == from_card["rateCard"]["cardId"]
    for priced, original in zip(from_pricing["lines"], from_card["lines"], strict=True):
        assert priced["amountBdt"] == original["amountBdt"]
        assert priced["priced"] == original["priced"]


def test_a_machinery_line_is_billed_at_the_cards_minimum() -> None:
    from archres_core.design import (
        build_boq,
        design_foundation,
        design_rebar,
        design_takeoff,
        design_typical_floor,
    )

    spec = _spec()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)

    card = _card()
    excavator = next(line for line in card["lines"] if line["key"] == "excavator")
    excavator["minimumChargeHours"] = 40  # a mobilization minimum above the measured hours
    boq = build_boq(takeoff, card)
    line = next(entry for entry in boq["lines"] if entry["key"] == "excavation")
    assert line["quantity"] == 40
    assert line["amountBdt"] == round(40 * line["rateBdt"], 2)
    assert "minimum" in line["note"]
