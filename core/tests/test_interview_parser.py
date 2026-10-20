"""Deterministic answer parser (W1.4): units, BN/EN/Banglish, choices, escalation."""

from __future__ import annotations

import pytest

from archres_core.interview import Question, normalize, parse_answer


def parse(book, qid: str, text: str, *, area: str = "katha", length: str = "ft"):
    return parse_answer(book.question(qid), text, area_display=area, length_display=length)


@pytest.mark.parametrize(
    ("text", "value", "area_display"),
    [
        ("5 katha", 334.45, "katha"),
        ("৫ কাঠা", 334.45, "katha"),
        ("five katha", 334.45, "katha"),
        ("panch katha", 334.45, "katha"),
        ("পাঁচ কাঠা", 334.45, "katha"),
        ("1200 sqft", 111.48, "katha"),
        ("1200 sft", 111.48, "katha"),
        ("2 bigha", 2675.61, "katha"),
        ("10 shotok", 404.69, "katha"),
        ("40 gonda", 133.78, "katha"),
        ("500", 46.45, "sqft"),
        ("500", 500.0, "sqm"),
    ],
)
def test_area_answers_convert_to_canonical_m2(book, text, value, area_display) -> None:
    result = parse(book, "plot-area", text, area=area_display)
    assert result.decision == "accept"
    assert result.value == pytest.approx(value)
    assert result.unit in ("katha", "sqft", "bigha", "shotok", "gonda", "sqm")


def test_a_bare_number_uses_the_project_display_unit(book) -> None:
    katha = parse(book, "plot-area", "5", area="katha")
    sqm = parse(book, "plot-area", "5", area="sqm")
    assert katha.value == pytest.approx(334.45)
    assert katha.used_display_unit
    assert sqm.value == pytest.approx(5.0)
    assert sqm.used_display_unit


def test_an_explicit_unit_beats_the_display_unit(book) -> None:
    result = parse(book, "plot-area", "500 sqft", area="katha")
    assert result.value == pytest.approx(46.45)
    assert not result.used_display_unit


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("40 ft", 12.192),
        ("12 ft 6 in", 3.81),
        ("12'6\"", 3.81),
        ("3 m", 3.0),
        ("36 inch", 0.914),
    ],
)
def test_length_answers_convert_to_metres(book, text, value) -> None:
    result = parse(book, "plot-frontage", text)
    assert result.decision == "accept"
    assert result.value == pytest.approx(value)


def test_pressure_and_money_are_canonical(book) -> None:
    sbc = parse(book, "soil-sbc", "95 kPa")
    assert sbc.decision == "accept" and sbc.value == 95.0
    bare = parse(book, "soil-sbc", "95")
    assert bare.value == 95.0 and bare.used_display_unit


def test_wrong_dimension_is_reasked_not_guessed(book) -> None:
    result = parse(book, "plot-area", "5 ft")
    assert result.decision == "ask_again"
    assert result.reason == "wrong_dimension"
    assert result.unit == "ft"

    length = parse(book, "plot-frontage", "2 katha")
    assert length.decision == "ask_again"
    assert length.reason == "wrong_dimension"


@pytest.mark.parametrize(
    ("text", "value", "as_entered"),
    [("G+2", 3, "3 floors"), ("৩", 3, "3"), ("three", 3, "3"), ("tin tala", 3, "3")],
)
def test_storey_count_accepts_floor_shorthand(book, text, value, as_entered) -> None:
    result = parse(book, "storeys-count", text)
    assert result.decision == "accept"
    assert result.value == value
    assert result.as_entered == as_entered


def test_integer_negatives(book) -> None:
    assert parse(book, "storeys-count", "25").reason == "out_of_range"
    assert parse(book, "storeys-count", "2.5").reason == "whole_number"
    assert parse(book, "storeys-count", "3 ft").reason == "unexpected_unit"


def test_zero_and_negative_numbers_are_refused(book) -> None:
    zero = parse(book, "plot-area", "0 katha")
    assert zero.decision == "ask_again" and zero.reason == "out_of_range"
    negative = parse(book, "plot-area", "-5 katha")
    assert negative.decision == "ask_again" and negative.reason == "out_of_range"


def test_ambiguous_numbers_are_reasked(book) -> None:
    result = parse(book, "plot-area", "10 by 20")
    assert result.decision == "ask_again"
    assert result.reason == "multiple_numbers"


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("সাড়ে ৫ কাঠা", 367.90),
        ("প্রায় সাড়ে ৫ কাঠা", 367.90),
        ("সাড়ে ৫ কাঠা", 367.90),
        ("sare panch katha", 367.90),
        ("দেড় কাঠা", 100.34),
        ("dedh katha", 100.34),
        ("আড়াই কাঠা", 167.23),
        ("সোয়া ৫ কাঠা", 351.17),
        ("পৌনে ৫ কাঠা", 317.73),
        ("5 and a half katha", 367.90),
        ("five and a half katha", 367.90),
        ("half katha", 33.45),
    ],
)
def test_fractional_quantifiers_are_expanded_not_truncated(book, text, value) -> None:
    result = parse(book, "plot-area", text)
    assert result.decision == "accept"
    assert result.value == pytest.approx(value)


@pytest.mark.parametrize("text", ["সাড়ে কাঠা", "সাড়ে"])
def test_fraction_without_a_base_number_still_escalates(book, text) -> None:
    result = parse(book, "plot-area", text)
    assert result.decision == "escalate"
    assert result.reason == "unparseable_fraction"


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("yes", True),
        ("Yes", True),
        ("হ্যাঁ", True),
        ("ha", True),
        ("no", False),
        ("না", False),
        ("na", False),
        ("করব না", False),
        ("nope", False),
    ],
)
def test_yes_no_bn_en_banglish(book, text, value) -> None:
    result = parse(book, "corner-plot", text)
    assert result.decision == "accept"
    assert result.value is value


def test_yes_no_ambiguity_doubt_and_delegation(book) -> None:
    assert parse(book, "corner-plot", "no, yes").reason == "ambiguous_yesno"
    assert parse(book, "corner-plot", "ha na").value is False  # trailing negation wins
    assert parse(book, "corner-plot", "jani na").decision == "skip"
    assert parse(book, "corner-plot", "you decide").decision == "default"
    escalated = parse(book, "corner-plot", "maybe")
    assert escalated.decision == "escalate"
    assert escalated.reason == "unrecognised_yesno"


@pytest.mark.parametrize(
    ("qid", "text", "value"),
    [
        ("division", "Dhaka", "dhaka"),
        ("division", "ঢাকা", "dhaka"),
        ("division", "sylhet division", "sylhet"),
        ("division", "Chattogram", "chattogram"),
        ("authority", "rajuk", "rajuk"),
        ("authority", "রাজউক", "rajuk"),
        ("authority", "not sure", "not-sure"),
        ("display-units", "bangla land", "bangla-land"),
        ("display-units", "feet inch", "feet-inch"),
        ("ground-floor-usage", "parking", "parking"),
    ],
)
def test_choice_values_labels_and_partial_text(book, qid, text, value) -> None:
    result = parse(book, qid, text)
    assert result.decision == "accept", (qid, text, result)
    assert result.value == value


def test_ambiguous_choice_returns_candidate_chips(book) -> None:
    result = parse(book, "authority", "Chattogram")
    assert result.decision == "ask_again"
    assert result.reason == "ambiguous_choice"
    assert set(result.candidates) == {"ccc", "cda"}


def test_choice_doubt_delegation_and_escalation(book) -> None:
    assert parse(book, "division", "not sure").decision == "skip"
    assert parse(book, "division", "আপনি ঠিক করুন").decision == "default"
    assert parse(book, "division", "কিছু একটা").decision == "escalate"


def test_text_answers_are_trimmed_and_bounded(book) -> None:
    assert parse(book, "project-name", "  Green Villa  ").value == "Green Villa"
    too_long = parse(book, "project-name", "x" * 121)
    assert too_long.decision == "ask_again" and too_long.reason == "too_long"
    assert parse(book, "project-name", "জানি না").decision == "skip"


def test_file_answers_are_references(book) -> None:
    assert parse(book, "soil-report-file", "soil-report.pdf").value == "soil-report.pdf"
    assert parse(book, "soil-report-file", "").reason == "empty"


def test_empty_input_is_never_accepted(book) -> None:
    for qid in ("project-name", "plot-area", "division"):
        result = parse(book, qid, "   ")
        assert result.decision == "ask_again" and result.reason == "empty"


def test_multi_choice_splits_and_validates(book) -> None:
    question = Question(
        id="rooms",
        flow_id="test",
        type="multi_choice",
        maps_to="/phases/floor-0/data/rooms",
        ask={"en": "Rooms", "bn": "রুম"},
        options=(
            {"value": "east", "label": {"en": "East", "bn": "পূর্ব"}},
            {"value": "west", "label": {"en": "West", "bn": "পশ্চিম"}},
            {"value": "north", "label": {"en": "North", "bn": "উত্তর"}},
        ),
    )
    result = parse_answer(question, "east and west")
    assert result.decision == "accept" and result.value == ["east", "west"]
    unknown = parse_answer(question, "east and nowhere")
    assert unknown.decision == "escalate"
    assert unknown.reason == "unrecognised_choice"


def test_normalize_folds_bengali_digits_case_and_quotes() -> None:
    assert normalize("  ৫ কাঠা  ") == "5 কাঠা"
    assert normalize("Dhaka, Bangladesh.") == "dhaka, bangladesh"
    assert normalize("don’t know") == "don't know"
