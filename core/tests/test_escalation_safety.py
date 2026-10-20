"""The escalation seam must not write a misreading (W1.10 / W1.6 follow-up).

The chat model is wrong on 9 of the 60 gated `model.parse` cases - and 5 of those are
*value* errors, the failure mode the eval suite exists to catch ("accepting the wrong value is
the worst failure mode this suite exists to catch"). The app may not write a value the user
did not say.

The laws the seam enforces (all machine-checkable):

1. **The value must fit the question** - a choice answer is one of the option ids, a yes/no
   answer a boolean, an integer a whole number inside the question's range, a number positive.
2. **"I don't know" is an answer, not a value.** It becomes a skip or a re-ask.
3. **A text answer is the user's text** - a model that returns "project-1" for "Project 1" has
   replaced the answer, not read it.
4. **A number answer is the number the user's words say**, converted with the unit they used -
   so a mis-conversion ("0.25 bigha" read as "100 sqm") can never be written.

A refusal is visible (``ask_again`` with ``model_invalid``); a wrong write is not.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.interview import Interview, load_book
from archres_core.interview.parse import number_in_text, units_in_text
from archres_core.interview.seam import value_from_text

ROOT = pathlib.Path(__file__).resolve().parents[2]
BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
SPEC = ROOT / "spec" / "examples" / "new-project.json"


def _interview() -> Interview:
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    return Interview(load_book(BOOK), spec, flows=["setup"], lang="bn")


def _at_plot_area(interview: Interview) -> None:
    """Walk the setup flow to the plot-area question (the first number question)."""
    interview.answer("Project 1")
    interview.answer("metric", choice="metric")
    interview.answer("dhaka", choice="dhaka")
    interview.answer("ঢাকা")
    interview.answer("ধানমন্ডি")


def test_the_numbers_and_units_in_the_text_are_found() -> None:
    assert "bigha" in units_in_text("০.২৫ বিঘা")
    assert "katha" in units_in_text("5 কাঠা")
    assert "ft" in units_in_text("20 ft")
    assert units_in_text("৬") == set()
    assert number_in_text("০.২৫ বিঘা") == pytest.approx(0.25)
    assert number_in_text("panch") == 5
    assert number_in_text("no idea") is None


def test_the_value_the_users_words_say() -> None:
    book = load_book(BOOK)
    question = book.question("plot-area")
    assert value_from_text(question, "5 কাঠা") == pytest.approx(334.45, abs=0.01)
    assert value_from_text(question, "০.২৫ বিঘা") == pytest.approx(334.45, abs=0.01)
    assert value_from_text(question, "no idea") is None


def test_a_model_may_not_rewrite_a_text_answer() -> None:
    interview = _interview()
    # The current step is the project name; the model reads the user's answer and returns a
    # different string - that is a replacement, not a reading.
    refused = interview.accept_external("project-1", answer_text="Project 1")
    assert refused.decision == "ask_again"


def test_the_own_text_of_the_user_is_accepted() -> None:
    interview = _interview()
    turn = interview.accept_external("Project 1", answer_text="Project 1")
    assert turn.decision == "accept"
    assert interview.spec["project"]["name"] == "Project 1"


def test_a_dont_know_answer_may_not_become_a_value() -> None:
    interview = _interview()
    refused = interview.accept_external(False, answer_text="don't know")
    assert refused.decision == "ask_again"


def test_a_model_may_not_name_a_unit_the_user_did_not_use() -> None:
    interview = _interview()
    _at_plot_area(interview)
    turn = interview.accept_external(100.0, unit="m2", answer_text="০.২৫ বিঘা")
    assert turn.decision == "ask_again"


def test_a_model_may_not_ignore_the_unit_the_user_did_use() -> None:
    interview = _interview()
    _at_plot_area(interview)
    turn = interview.accept_external(0.25, unit=None, answer_text="০.২৫ বিঘা")
    assert turn.decision == "ask_again"


def test_a_mis_converted_number_may_not_be_written() -> None:
    interview = _interview()
    _at_plot_area(interview)
    # The model read "0.25 bigha" as 100 (and named m2): the unit it named is not the unit the
    # answer uses, and the number is not the number the answer says.
    turn = interview.accept_external(100.0, unit="katha", answer_text="০.২৫ বিঘা")
    assert turn.decision == "ask_again"


def test_a_matching_unit_is_accepted() -> None:
    interview = _interview()
    _at_plot_area(interview)
    turn = interview.accept_external(5.0, unit="katha", answer_text="5 কাঠা")
    assert turn.decision == "accept"
    assert interview.spec["site"]["plot"]["areaSqm"] == pytest.approx(334.45, abs=0.01)


def test_a_bare_number_with_no_unit_in_the_text_is_accepted() -> None:
    interview = _interview()
    _at_plot_area(interview)
    turn = interview.accept_external(334.45, unit=None, answer_text="334.45")
    assert turn.decision == "accept"


def test_a_negative_integer_is_refused() -> None:
    interview = _interview()
    _at_plot_area(interview)
    interview.answer("৫ কাঠা")
    turn = interview.accept_external(-5, answer_text="-৫")
    assert turn.decision == "ask_again"
