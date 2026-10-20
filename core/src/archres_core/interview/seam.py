"""The escalation seam's law: what a model-parsed value may become (W1.10 / W1.6 follow-up).

The chat model is wrong on 9 of the 60 gated ``model.parse`` cases - and 5 of those are
*value* errors, the failure mode the eval suite exists to catch ("accepting the wrong value is
the worst failure mode this suite exists to catch"). The app may not write a value the user
did not say.

Three rules, all machine-checkable:

1. **The value must fit the question.** A choice answer must be one of the option ids, a
   yes/no answer a boolean, an integer a whole number, a number positive.
2. **A text answer is the user's text.** A model that returns "project-1" for "Project 1" has
   replaced the answer, not read it.
3. **The unit the model names must be the unit the user used.** The app converts, the model
   reads: naming "m2" for "০.২৫ বিঘা" (or "m" for a bare "৬") is a misread, and a misread must
   not become a written area or a written road width.

A refusal is visible (``ask_again`` with ``model_invalid``); a wrong write is not. The
function is public because the eval harness replays the recorded model replies through it: a
model mistake must become a visible refusal, never a written value.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from .flow import Question
from .parse import (
    CANONICAL_DIMENSION,
    DIMENSION,
    INTEGER_RANGES,
    ParseResult,
    canonical_value,
    is_dont_know,
    number_in_text,
    units_in_text,
)


def value_from_text(question: Question, answer_text: str) -> float | None:
    """The value the user's own words say (canonical), or ``None`` when the text has no number.

    This is the yardstick the escalation seam measures the model's reading against: a written
    value must be the value the user gave, converted with the unit the user used. It is also
    what the eval harness re-derives on its own, so a bug in the seam cannot hide a wrong write.
    """
    numbers = number_in_text(answer_text)
    if numbers is None:
        return None
    used = units_in_text(answer_text)
    unit = question.unit_code
    dimension = CANONICAL_DIMENSION.get(question.unit_code or "")
    for code in sorted(used):
        if DIMENSION.get(code) == dimension:
            unit = code
            break
    return canonical_value(question, numbers, unit or "")


def _check_model_unit(question: Question, unit: str | None, answer_text: str) -> None:
    """The unit the model names must be the unit the user used."""
    if not answer_text.strip():
        return
    used = units_in_text(answer_text)
    named = (unit or "").strip()
    if named:
        if not used:
            raise ValueError(f"the model named the unit {named!r}, which the answer does not use")
        same = any(
            canonical_value(question, Decimal(1), named) == canonical_value(question, Decimal(1), code)
            for code in used
        )
        if not same:
            raise ValueError(
                f"the model named the unit {named!r}, which is not the unit the answer uses"
            )
    elif used:
        raise ValueError("the model ignored the unit in the answer")


def _check_against_the_users_words(
    question: Question, written: float, answer_text: str
) -> None:
    """The written value must be the value the user's words say."""
    if not answer_text.strip():
        return
    if is_dont_know(answer_text):
        raise ValueError("the user said they do not know; no value may be written")
    said = value_from_text(question, answer_text)
    if said is None:
        raise ValueError("the user's answer holds no number; the model may not invent one")
    if abs(written - said) > 0.005:
        raise ValueError(f"the model wrote {written:g}, but the user's answer says {said:g}")


def validate_external_answer(
    question: Question,
    value: Any,
    unit: str | None = None,
    *,
    answer_text: str = "",
) -> ParseResult:
    """Validate a model-parsed value for a question; raise ``ValueError`` when it does not fit."""
    kind = question.type
    as_entered = f"{value}" if unit is None else f"{value} {unit}"
    if answer_text.strip() and is_dont_know(answer_text):
        # "I don't know" is an answer in its own right: it becomes a skip or a re-ask, never a
        # value the user did not give.
        raise ValueError("the user said they do not know; no value may be written")
    if kind == "choice":
        if not isinstance(value, str):
            raise ValueError("choice answer must be a string option value")
        option = question.option(value)
        if option is None:
            hits = [item for item in question.options if item["value"].casefold() == value.casefold()]
            if not hits:
                raise ValueError(f"{value!r} is not an option of {question.id}")
            option = hits[0]
        return ParseResult("accept", value=option["value"], as_entered=as_entered)
    if kind == "multi_choice":
        if not isinstance(value, list):
            raise ValueError("multi-choice answer must be a list")
        picked = []
        for item in value:
            option = question.option(str(item))
            if option is None:
                raise ValueError(f"{item!r} is not an option of {question.id}")
            if option["value"] not in picked:
                picked.append(option["value"])
        return ParseResult("accept", value=picked, as_entered=as_entered)
    if kind == "yes_no":
        if isinstance(value, bool):
            return ParseResult("accept", value=value, as_entered=as_entered)
        text = str(value).strip().casefold()
        if text in ("yes", "true", "ha", "হ্যাঁ", "1"):
            return ParseResult("accept", value=True, as_entered=as_entered)
        if text in ("no", "false", "na", "না", "0"):
            return ParseResult("accept", value=False, as_entered=as_entered)
        raise ValueError(f"{value!r} is not a yes/no answer")
    if kind == "integer":
        if isinstance(value, bool):
            raise ValueError("integer expected, got a boolean")
        number = Decimal(str(value))
        if number != number.to_integral_value():
            raise ValueError(f"{value!r} is not a whole number")
        bounds = INTEGER_RANGES.get(question.maps_to)
        if bounds and not (bounds[0] <= int(number) <= bounds[1]):
            raise ValueError(f"{value!r} is outside the range {question.id} allows")
        if int(number) <= 0:
            raise ValueError(f"{value!r} must be positive")
        return ParseResult("accept", value=int(number), as_entered=str(value))
    if kind == "number":
        if isinstance(value, bool):
            raise ValueError("number expected, got a boolean")
        number = Decimal(str(value))
        if number <= 0:
            raise ValueError(f"{value!r} must be positive")
        _check_model_unit(question, unit, answer_text)
        entered_unit = unit or question.unit_code
        canonical = canonical_value(question, number, entered_unit or "")
        _check_against_the_users_words(question, canonical, answer_text)
        return ParseResult(
            "accept",
            value=canonical,
            unit=entered_unit,
            as_entered=as_entered,
        )
    if kind in ("text", "file"):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("a non-empty text answer is required")
        if answer_text.strip() and value.strip() != answer_text.strip():
            raise ValueError(
                f"the model changed the user's answer ({value.strip()!r} != {answer_text.strip()!r})"
            )
        return ParseResult("accept", value=value.strip(), as_entered=as_entered)
    raise ValueError(f"{question.id}: unsupported question type {kind!r}")
