"""Sloppy-input operators (W1.5) - deterministic, seeded, never stalling."""

from __future__ import annotations

import pytest

from archres_core.training import mutations


def _question(**overrides) -> dict:
    question = {
        "id": "plot-area",
        "phase_id": "setup",
        "type": "number",
        "maps_to": "/site/plot/areaSqm",
        "display": ["sqm", "katha", "shotok", "bigha"],
        "unit": {"canonical": "m2", "display": ["sqm", "katha", "shotok", "bigha"]},
        "fallback": None,
        "options": [],
    }
    question.update(overrides)
    return question


def _base(**overrides) -> dict:
    base = {"kind": "number", "value": 334.450944, "unit": "m2", "text": "334.45 sqm"}
    base.update(overrides)
    return base


def test_bangla_digits_translate_only_digits() -> None:
    assert mutations.bn_digits("12.5 m") == "১২.৫ m"


def test_unit_alt_is_reproducible_and_converts_back() -> None:
    question = _question()
    result = mutations.apply_operator(
        "unit_alt", question=question, base=_base(), lang="en", seed="s", unit_target="katha"
    )
    assert result["decision"] == "accept"
    assert result["detail"]["unit"] == "katha"
    assert result["detail"]["raw"] == "5"
    assert result["text"] == "5 katha"
    assert result["detail"]["canonical"] == 334.45
    again = mutations.apply_operator(
        "unit_alt", question=question, base=_base(), lang="en", seed="s", unit_target="katha"
    )
    assert again == result


def test_unit_alt_bangla_uses_a_hand_authored_unit_word() -> None:
    result = mutations.apply_operator(
        "unit_alt", question=_question(), base=_base(), lang="bn", seed="s", unit_target="katha"
    )
    assert result["text"] == "৫ কাঠা"


def test_alternative_units_exclude_the_canonical_display_equivalent() -> None:
    assert mutations.alternative_units(_question(), _base()) == ["katha", "shotok", "bigha"]
    assert mutations.alternative_units(
        _question(display=["m"], unit={"canonical": "m"}), _base(unit="m", value=10, text="10 m")
    ) == []


def test_unit_alt_rejects_an_unknown_target() -> None:
    with pytest.raises(mutations.OperatorNotApplicable):
        mutations.apply_operator(
            "unit_alt", question=_question(), base=_base(), lang="en", seed="s", unit_target="acre"
        )


def test_banglish_integer_and_yes_no() -> None:
    integer = mutations.apply_operator(
        "banglish",
        question=_question(type="integer", display=[], unit=None),
        base={"kind": "integer", "value": 5, "unit": None, "text": "5"},
        lang="bn",
        seed="s",
    )
    assert (integer["text"], integer["decision"]) == ("panch", "accept")
    yes = mutations.apply_operator(
        "banglish",
        question=_question(type="yes_no", display=[], unit=None),
        base={"kind": "yes_no", "value": True, "unit": None, "text": "Yes"},
        lang="en",
        seed="s",
    )
    assert (yes["text"], yes["decision"]) == ("ha", "accept")


def test_banglish_refuses_numbers_outside_the_word_table() -> None:
    with pytest.raises(mutations.OperatorNotApplicable):
        mutations.apply_operator(
            "banglish",
            question=_question(type="integer", display=[], unit=None),
            base={"kind": "integer", "value": 12, "unit": None, "text": "12"},
            lang="en",
            seed="s",
        )


def test_dont_know_uses_a_fallback_or_asks_again() -> None:
    with_fallback = mutations.apply_operator(
        "dont_know",
        question=_question(fallback={"kind": "omit"}),
        base=_base(),
        lang="en",
        seed="s",
    )
    assert with_fallback["decision"] == "fallback"
    assert with_fallback["detail"]["fallbackKind"] == "omit"
    without = mutations.apply_operator(
        "dont_know", question=_question(), base=_base(), lang="en", seed="s"
    )
    assert without["decision"] == "ask_again"


def test_off_topic_escalates() -> None:
    result = mutations.apply_operator(
        "off_topic", question=_question(), base=_base(), lang="en", seed="s"
    )
    assert result["decision"] == "escalate"


def test_typo_is_seeded_and_reproducible() -> None:
    first = mutations.apply_operator(
        "typo", question=_question(), base=_base(text="334.45 sqm"), lang="en", seed="seed"
    )
    second = mutations.apply_operator(
        "typo", question=_question(), base=_base(text="334.45 sqm"), lang="en", seed="seed"
    )
    assert first == second
    assert first["text"] != "334.45 sqm"


def test_whitespace_and_as_given_record_their_expected_value() -> None:
    text_question = _question(type="text", display=[], unit=None, fallback=None)
    whitespace = mutations.apply_operator(
        "whitespace",
        question=text_question,
        base={"kind": "text", "value": "Green View", "unit": None, "text": "Green View"},
        lang="en",
        seed="s",
    )
    assert whitespace["text"] == "  Green View  "
    assert whitespace["detail"]["trimmed"] == "Green View"
    given = mutations.apply_operator(
        "as_given",
        question=text_question,
        base={"kind": "text", "value": "Green View", "unit": None, "text": "Green View"},
        lang="en",
        seed="s",
    )
    assert given["detail"]["asGiven"] == given["text"]


def test_omit_unit_and_absurd_ask_again() -> None:
    omitted = mutations.apply_operator(
        "omit_unit", question=_question(), base=_base(), lang="en", seed="s"
    )
    assert omitted["decision"] == "ask_again"
    assert omitted["text"] == "334.45"
    absurd = mutations.apply_operator(
        "absurd", question=_question(), base=_base(), lang="en", seed="s"
    )
    assert absurd["decision"] == "ask_again"


def test_operators_do_not_apply_to_the_wrong_answer_kind() -> None:
    with pytest.raises(mutations.OperatorNotApplicable):
        mutations.apply_operator(
            "unit_alt",
            question=_question(type="yes_no", display=[], unit=None),
            base={"kind": "yes_no", "value": True, "unit": None, "text": "Yes"},
            lang="en",
            seed="s",
        )
    with pytest.raises(mutations.OperatorNotApplicable):
        mutations.apply_operator("banglish", question=_question(), base=_base(), lang="en", seed="s")
