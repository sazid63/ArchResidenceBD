"""The transcribed candidate card (W2.7 follow-up): the official rates, with their pages.

The card is built from the official list by `tools/prices/transcribe_card.py`; these tests pin
what it must produce, so a drift in the reader or in the transcription is caught rather than
quietly shipped.
"""

from __future__ import annotations

import json
import pathlib

import jsonschema
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
CARD = ROOT / "data" / "prices" / "cards" / "pwd-sor-2022-civil-works-candidate.json"
FETCH_REPORT = ROOT / "data" / "prices" / "fetch-report.json"
SCHEMA = ROOT / "spec" / "schemas" / "rate-card.schema.json"

#: What the book says (PWD SoR 2022 (Revised), Part A: Civil Works), page by page.
EXPECTED = {
    "cement-opc-43": (520.0, "bag", 20),
    "rod-60g": (89_000.0, "ton", 23),
    "sand-fine": (1_900.0, "cft", 21),
    "brick-1st": (13.0, "each", 19),
    "mason": (700.0, "day", 14),
    "rod-binder": (700.0, "day", 14),
    "machine-operator": (700.0, "day", 14),
    "mixer-diesel": (1_200.0, "day", 15),
    "vibrator": (550.0, "day", 15),
}


def _card() -> dict:
    return json.loads(CARD.read_text(encoding="utf-8"))


def test_the_card_satisfies_the_frozen_rate_card_interface() -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema).validate(_card())


def test_the_card_is_a_candidate_and_says_where_it_came_from() -> None:
    card = _card()
    assert card["status"] == "candidate", "a fetched list is unverified until a human says so"
    assert card["cardId"] == "pwd-sor-2022-civil-works"
    assert card["region"] == "dhaka"
    source = card["source"]
    assert source["kind"] == "official_list"
    assert "Schedule of Rates 2022" in source["name"]
    assert len(source["sha256"]) == 64
    report = json.loads(FETCH_REPORT.read_text(encoding="utf-8"))
    hashes = {artifact["sha256"] for artifact in report["artifacts"]}
    assert source["sha256"] in hashes, "the card must carry the hash the fetch recorded"


def test_every_line_carries_the_rate_and_the_page_the_book_gives_it() -> None:
    card = _card()
    lines = {line["key"]: line for line in card["lines"]}
    assert set(lines) == set(EXPECTED)
    for key, (rate, unit, page) in EXPECTED.items():
        line = lines[key]
        assert line["rateBdt"] == rate, key
        assert line["unit"] == unit, key
        assert f"page {page}" in line["note"], key
        assert "PWD SoR 2022 (Revised) Part A" in line["note"], key


def test_the_zone_multipliers_are_the_books_own_zone_ratios() -> None:
    lines = {line["key"]: line for line in _card()["lines"]}
    # The cement is the same in every zone; the sand and the labour are not.
    assert lines["cement-opc-43"]["regionalMultipliers"] == {
        "chattogram": 1.0,
        "khulna": 1.0,
        "rajshahi": 1.0,
    }
    assert lines["sand-fine"]["regionalMultipliers"]["chattogram"] == pytest.approx(1915 / 1900)
    assert lines["sand-fine"]["regionalMultipliers"]["khulna"] == pytest.approx(1845 / 1900)
    assert lines["mason"]["regionalMultipliers"]["khulna"] == pytest.approx(650 / 700)


def test_the_brick_is_the_books_per_thousand_rate_divided() -> None:
    line = {item["key"]: item for item in _card()["lines"]}["brick-1st"]
    assert line["rateBdt"] == 13.0
    assert "per-1,000 rate divided by 1,000" in line["note"]


def test_the_machinery_lines_say_what_the_row_does_not_say() -> None:
    lines = {item["key"]: item for item in _card()["lines"]}
    mixer = lines["mixer-diesel"]
    assert mixer["operatorIncluded"] is False
    assert "the row does not mention fuel" in mixer["note"]


def test_the_card_does_not_claim_a_rate_the_book_does_not_have() -> None:
    # The excavation has no official hire rate in the rates section, so the card does not
    # pretend to one (the study records where it would come from instead).
    keys = {line["key"] for line in _card()["lines"]}
    assert "excavator" not in keys
