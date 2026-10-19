"""Interview (question) engine v0 — W1.4.

Plan §5.5 + §8 + Appendix C: chips, a deterministic parser, escalation to the model and
provenance on every patch. One ``Interview`` walks the Phase Flow Book (W0.4) against one
Building Spec (W1.3), turns answers into schema-valid ``add`` patches and never advances
silently:

- **Chips** are shortcuts, never constraints — free text is always parsed.
- **Every write is a spec patch** through ``apply_patch`` with provenance (user / default /
  assumption / engine) and, for fallbacks with an authored statement, an entry in the
  spec's ``/assumptions`` list (plan §2.5, §5.10).
- **Essential questions cannot be assumed**: "I don't know" keeps the question open and
  lists it in ``progress()["open"]``.
- **Fallbacks are resolved, declared or pending** — never dropped. ``registry`` and
  ``area_default`` values that the book states symbolically (e.g. ``derived-from-location``)
  are not invented: they become ``pending`` items for W1.10/W2.7, and the authored
  assumption is still recorded.
- **Parse failures escalate** (W1.10 calls the model); the engine accepts the result via
  ``accept_external`` with ``confidence: low``. There is no model call in core.
- **Coverage is counted, not implied**: ``coverage()`` reports one outcome per visited
  question (answered / fallback / omitted / skipped / open).

Spec law: the engine refuses to start on an invalid spec, and a value that fails the
Building Spec schema becomes a visible re-ask (``reason: schema``), not a partial write.
"""

from __future__ import annotations

import copy
import dataclasses
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Iterable, Iterator, Sequence

from .. import units
from ..spec import (
    PointerError,
    SpecPatchError,
    SpecValidationError,
    apply_patch,
    escape_token,
    parse_pointer,
    resolve,
    validate_spec,
)
from .flow import (
    SKIP_CHIP_ID,
    ConditionError,
    FlowBook,
    Question,
    chips as flow_chips,
    condition_holds,
    pointer_for,
)
from .parse import CANONICAL_DIMENSION, DIMENSION, ParseResult, bn_digits, canonical_value, parse_answer

ENGINE_ID = "question-engine@0.1.0"

#: Flow-book display-unit choice -> (displayUnits.area, displayUnits.length) spec values.
#: These are the only answer values that are not written verbatim; the flow-book option
#: ids are UI vocabulary, the spec has its own enums (schema-first, plan §5.4).
DISPLAY_UNITS: dict[str, tuple[str, str]] = {
    "metric": ("sqm", "m"),
    "feet-inch": ("sqft", "ft"),
    "bangla-land": ("katha", "ft"),
}

#: Enum-valued yes/no questions (the book asks a question, the spec stores a state).
#: ``False`` on both runs the authored registry/area_default fallback instead — "I don't
#: have prices/soil data" is not a fetched value, it is a plan to fetch one.
SOIL_STATUS = "/site/soil/status"
PRICING_SOURCE = "/pricing/source"

#: Option ids that mean "use this question's fallback" (UI vocabulary, not spec values).
FALLBACK_OPTIONS: dict[str, frozenset[str]] = {
    "/site/jurisdiction/authority": frozenset({"not-sure"}),
}

#: Fallback kinds from spec/schemas/flow-book.schema.json.
FALLBACK_KINDS = ("default", "registry", "area_default", "derive", "omit")

_DIMENSION_LABEL = {
    "area": {"en": "area", "bn": "ক্ষেত্রফল"},
    "length": {"en": "length", "bn": "দৈর্ঘ্য"},
    "pressure": {"en": "pressure", "bn": "চাপ"},
    "money": {"en": "money", "bn": "টাকা"},
}

REPLY_ACCEPTED = {"en": "Noted: {value}.", "bn": "নোট করা হলো: {value}।"}
REPLY_DEFAULT = {"en": "Okay — using {value} for now.", "bn": "ঠিক আছে — আপাতত {value} ধরে নিচ্ছি।"}
REPLY_DERIVED = {"en": "Derived from the project: {value}.", "bn": "প্রকল্পের তথ্য থেকে নেওয়া হলো: {value}।"}
REPLY_OMITTED = {
    "en": "Okay — leaving this out; it can be added later.",
    "bn": "ঠিক আছে — এটি বাদ রাখছি; পরে যোগ করা যাবে।",
}
REPLY_ESSENTIAL = {
    "en": "This one can't be assumed — please answer it. {ask}",
    "bn": "এটি অনুমান করা যাবে না — উত্তরটি দরকার। {ask}",
}
REPLY_ESCALATE = {
    "en": "Let me read that answer more carefully.",
    "bn": "উত্তরটি একটু ভালোভাবে বুঝে নিচ্ছি।",
}
REPLY_DONE = {"en": "All questions are done.", "bn": "সব প্রশ্ন শেষ হয়েছে।"}
REPLY_PENDING = {
    "en": "I'll fetch or derive this in the next step.",
    "bn": "এটি পরের ধাপে এনে বা হিসাব করে নেওয়া হবে।",
}

ASK_AGAIN = {
    "empty": {"en": "Please type an answer.", "bn": "উত্তরটি লিখুন।"},
    "ambiguous_choice": {
        "en": "Which one do you mean?",
        "bn": "কোনটি বোঝাচ্ছেন?",
    },
    "ambiguous_yesno": {
        "en": "I heard both yes and no — please pick one.",
        "bn": "হ্যাঁ আর না দুটোই পাচ্ছি — একটি বেছে নিন।",
    },
    "multiple_numbers": {
        "en": "I found more than one number — please give just the one.",
        "bn": "একাধিক সংখ্যা পাচ্ছি — শুধু একটি সংখ্যা বলুন।",
    },
    "whole_number": {
        "en": "Please give a whole number.",
        "bn": "পূর্ণ সংখ্যা বলুন।",
    },
    "out_of_range": {
        "en": "That value can't be used here — please give a positive number.",
        "bn": "এই মানটি এখানে ব্যবহার করা যাবে না — ধনাত্মক সংখ্যা দিন।",
    },
    "out_of_range_bounds": {
        "en": "Please give a value between {lo} and {hi}.",
        "bn": "{lo} থেকে {hi}-এর মধ্যে একটি মান দিন।",
    },
    "wrong_dimension": {
        "en": "That's a {given} unit; this answer needs {expected}.",
        "bn": "এটি {given} একক — এখানে {expected} লাগবে।",
    },
    "unexpected_unit": {
        "en": "Please give a plain count, without a unit.",
        "bn": "একক ছাড়া শুধু একটি সংখ্যা দিন।",
    },
    "too_long": {
        "en": "Please keep it shorter ({limit} characters max).",
        "bn": "একটু ছোট করুন (সর্বোচ্চ {limit} অক্ষর)।",
    },
    "schema": {
        "en": "That value isn't valid for this field — please try another.",
        "bn": "এই মানটি এই ঘরে গ্রহণযোগ্য নয় — অন্য মান দিন।",
    },
    "model_invalid": {
        "en": "That answer didn't fit this question — please answer again.",
        "bn": "উত্তরটি এই প্রশ্নের সাথে মেলেনি — আবার উত্তর দিন।",
    },
    "unknown_choice": {
        "en": "Please pick one of the options.",
        "bn": "অপশনগুলোর একটি বেছে নিন।",
    },
    "essential_open": {
        "en": "This one can't be assumed — please answer it.",
        "bn": "এটি অনুমান করা যাবে না — উত্তরটি দরকার।",
    },
}

ESCALATION_INSTRUCTION = {
    "en": (
        "Parse the user's answer for one interview question. Reply with JSON only: "
        '{{"value": <typed value>, "unit": <entered unit or null>}}. '
        "Use the canonical unit {unit}. Never invent a value; if the answer cannot be read, "
        'reply {{"value": null}}.'
    ),
    "bn": (
        "একটি ইন্টারভিউ প্রশ্নের উত্তরটি বুঝে শুধু JSON ফেরত দিন: "
        '{{"value": <মান>, "unit": <একক বা null>}}। '
        "ক্যানোনিকাল একক {unit}। কোনো মান অনুমান করবেন না; না বুঝলে "
        '{{"value": null}} দিন।'
    ),
}

_ASSUMPTION_BASIS = {
    "registry": "external_source",
    "area_default": "area_default",
    "derive": "conservative_default",
    "default": "conservative_default",
}


class InterviewError(RuntimeError):
    """The interview cannot run (invalid spec, book/structure mismatch) — a bug, not an answer."""


@dataclass(frozen=True)
class Step:
    question: Question
    storey_index: int | None
    pointer: str

    @property
    def key(self) -> str:
        return f"{self.question.id}#{self.storey_index}" if self.storey_index is not None else self.question.id


@dataclass(frozen=True)
class Writes:
    """Spec writes for one answer; ``use_fallback`` means the answer must run the fallback."""

    pairs: tuple[tuple[str, Any], ...] = ()
    use_fallback: bool = False


@dataclass
class Turn:
    decision: str
    question_id: str | None = None
    pointer: str | None = None
    reply: dict[str, str] = field(default_factory=dict)
    value: Any = None
    ops: tuple[dict[str, Any], ...] = ()
    reason: str = ""
    chips: tuple[dict[str, Any], ...] = ()
    pending: tuple[dict[str, Any], ...] = ()
    assumption_id: str | None = None
    escalation: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)


def answer_writes(question: Question, pointer: str, value: Any) -> Writes:
    """Map one answered value to spec writes (the UI-vocabulary → spec-vocabulary layer)."""
    if pointer == "/project/displayUnits/area" and isinstance(value, str) and value in DISPLAY_UNITS:
        area, length = DISPLAY_UNITS[value]
        return Writes(((pointer, area), ("/project/displayUnits/length", length)))
    if isinstance(value, str) and value in FALLBACK_OPTIONS.get(pointer, frozenset()):
        return Writes(use_fallback=True)
    if isinstance(value, bool) and pointer == PRICING_SOURCE:
        return Writes(((pointer, "user"),)) if value else Writes(use_fallback=True)
    if pointer == SOIL_STATUS and isinstance(value, bool):
        if value:
            return Writes(((pointer, "user_report"),))
        return Writes(use_fallback=True)
    return Writes(((pointer, value),))


def _fmt_number(text: str, lang: str) -> str:
    return bn_digits(text) if lang == "bn" else text


class Interview:
    """One deterministic interview walk over a flow book and a Building Spec."""

    def __init__(
        self,
        book: FlowBook,
        spec: dict[str, Any],
        *,
        flows: Sequence[str] | None = None,
        storey_index: int | None = None,
        lang: str = "en",
        at: str | None = None,
        skip_answered: bool = False,
    ) -> None:
        try:
            validate_spec(spec)
        except SpecValidationError as exc:
            raise InterviewError(f"cannot interview against an invalid spec: {exc}") from exc
        if lang not in ("en", "bn"):
            raise InterviewError(f"unknown language {lang!r}")
        if flows:
            for flow_id in flows:
                book.flow(flow_id)
        if storey_index is not None:
            flow = book.flow("floor")
            if not flow.per_storey:
                raise InterviewError("storey_index is only valid for a per-storey flow")
            if storey_index < 0:
                raise InterviewError(f"storey_index must be >= 0, got {storey_index}")
        self.book = book
        self.spec = copy.deepcopy(spec)
        self.lang = lang
        self.at = at
        self.skip_answered = skip_answered
        self._flows = tuple(flows) if flows else None
        self._storey_index = storey_index
        self._values: dict[str, Any] = self._seed_values(book)
        self._outcomes: dict[str, dict[str, Any]] = {}
        self._meta: dict[str, Step] = {}
        self._pending: list[dict[str, Any]] = []
        self._open: list[str] = []
        self._assumptions: list[str] = []
        self._log: list[dict[str, Any]] = []
        self._seq = self._iter_steps()
        self._current: Step | None = None
        self._next_step()

    # ------------------------------------------------------------------ helpers

    def _iter_steps(self) -> Iterator[Step]:
        wanted = self._flows
        for flow in self.book.flows:
            if wanted is not None and flow.id not in wanted:
                continue
            if flow.per_storey:
                if self._storey_index is not None:
                    indices: Iterable[int] = (self._storey_index,)
                else:
                    indices = range(self._storey_count())
                for index in indices:
                    for question in flow.questions:
                        if question.flow_id == flow.id:
                            yield Step(question, index, pointer_for(question, index))
            else:
                for question in flow.questions:
                    yield Step(question, None, pointer_for(question))
        return

    def _storey_count(self) -> int:
        value = self._values.get("storeys-count")
        if isinstance(value, int) and not isinstance(value, bool):
            return value
        try:
            count = resolve(self.spec, "/building/storeys/count")
        except PointerError as exc:
            raise InterviewError(
                "the floor flow needs /building/storeys/count (answer setup first)"
            ) from exc
        if not isinstance(count, int) or count < 1:
            raise InterviewError(f"/building/storeys/count must be a positive integer, got {count!r}")
        return count

    def _area_display(self) -> str:
        try:
            return str(resolve(self.spec, "/project/displayUnits/area"))
        except PointerError:
            return "sqm"

    def _length_display(self) -> str:
        try:
            return str(resolve(self.spec, "/project/displayUnits/length"))
        except PointerError:
            return "m"

    def _seed_values(self, book: FlowBook) -> dict[str, Any]:
        """Answer table starts from the current spec, so conditions work on resume/scoped runs."""
        values: dict[str, Any] = {}
        for question in book.questions:
            if "<n>" in question.maps_to or not self._exists(question.maps_to):
                continue
            values[question.id] = self._semantic_from_spec(
                question, resolve(self.spec, question.maps_to)
            )
        return values

    def _semantic_from_spec(self, question: Question, value: Any) -> Any:
        """Reverse the answer→spec mappings for resuming (skip_answered)."""
        pointer = question.maps_to
        if question.type == "yes_no":
            if pointer == SOIL_STATUS:
                return value == "user_report"
            if pointer == PRICING_SOURCE:
                return value == "user"
            return bool(value)
        if pointer == "/project/displayUnits/area":
            for option, (area, _length) in DISPLAY_UNITS.items():
                if area == value:
                    return option
        return value

    def _exists(self, pointer: str) -> bool:
        try:
            resolve(self.spec, pointer)
        except PointerError:
            return False
        return True

    def _record(self, step: Step, outcome: str, reason: str = "", detail: str = "") -> None:
        self._meta[step.key] = step
        self._outcomes[step.key] = {"outcome": outcome, "reason": reason, "detail": detail}
        self._log.append(
            {
                "question": step.question.id,
                "storeyIndex": step.storey_index,
                "pointer": step.pointer,
                "outcome": outcome,
                "reason": reason,
                "detail": detail,
            }
        )

    def _next_step(self) -> Step | None:
        while True:
            try:
                step = next(self._seq)
            except StopIteration:
                self._current = None
                return None
            if step.key in self._outcomes:
                continue
            if self.skip_answered and self._exists(step.pointer):
                self._record(step, "skipped", "already_answered")
                continue
            if step.question.when:
                try:
                    holds = condition_holds(step.question.when, self._values, step.storey_index)
                except ConditionError as exc:
                    self._record(step, "skipped", "condition_unresolved", str(exc))
                    continue
                if not holds:
                    self._record(step, "skipped", "condition")
                    continue
            self._current = step
            return step

    def _advance(self) -> None:
        self._current = None
        self._next_step()

    @property
    def current(self) -> Step | None:
        return self._current

    @property
    def done(self) -> bool:
        return self._current is None

    # ------------------------------------------------------------- presentation

    def prompt(self, lang: str | None = None) -> dict[str, Any]:
        """What the chat shows now: question, why, chips and progress (no model needed)."""
        lang = lang or self.lang
        step = self._current
        if step is None:
            return {"done": True, "reply": REPLY_DONE[lang], "progress": self.progress()}
        question = step.question
        return {
            "done": False,
            "questionId": question.id,
            "flow": question.flow_id,
            "storeyIndex": step.storey_index,
            "pointer": step.pointer,
            "type": question.type,
            "ask": question.prompt(lang),
            "why": question.explain(lang),
            "chips": flow_chips(question, lang),
            "progress": self.progress(),
        }

    def chips(self, lang: str | None = None, candidates: Iterable[str] | None = None) -> list[dict[str, Any]]:
        step = self._current
        if step is None:
            return []
        lang = lang or self.lang
        if candidates is None:
            return flow_chips(step.question, lang)
        wanted = list(candidates)
        out = []
        for value in wanted:
            option = step.question.option(value)
            if option is not None:
                out.append(
                    {
                        "id": value,
                        "label": option["label"][lang],
                        "kind": "option",
                        "option": value,
                    }
                )
        return out

    # ------------------------------------------------------------------ answers

    def answer(self, text: str, *, choice: str | None = None, lang: str | None = None) -> Turn:
        """Answer the current question with free text or a chip id."""
        lang = lang or self.lang
        step = self._current
        if step is None:
            return Turn("done", reply=dict(REPLY_DONE))
        if choice is not None:
            parsed = self._chip_result(step.question, choice)
            raw = choice
        else:
            parsed = parse_answer(
                step.question,
                text,
                area_display=self._area_display(),
                length_display=self._length_display(),
            )
            raw = text
        return self._handle(step, parsed, raw=raw, lang=lang)

    def skip(self, lang: str | None = None) -> Turn:
        """Explicit "I don't know" (same as the skip reply / ``skip`` chip)."""
        step = self._current
        if step is None:
            return Turn("done", reply=dict(REPLY_DONE))
        return self._fallback(step, lang=lang or self.lang, trigger="dont_know")

    def use_default(self, lang: str | None = None) -> Turn:
        """Explicit "you decide" — runs the authored fallback, never an invented value."""
        step = self._current
        if step is None:
            return Turn("done", reply=dict(REPLY_DONE))
        return self._fallback(step, lang=lang or self.lang, trigger="user_delegated")

    def accept_external(
        self,
        value: Any,
        *,
        unit: str | None = None,
        lang: str | None = None,
        detail: str = "model-parsed (escalation)",
    ) -> Turn:
        """Accept a model-parsed value for the current question (the escalation seam).

        The value is re-validated here; nothing is written if it does not fit. Provenance is
        ``source: user`` with ``confidence: low`` — the content is the user's, the reading
        was a model's.
        """
        lang = lang or self.lang
        step = self._current
        if step is None:
            return Turn("done", reply=dict(REPLY_DONE))
        try:
            parsed = self._external_result(step.question, value, unit)
        except (ValueError, ArithmeticError) as exc:
            return self._ask_again(step, "model_invalid", unit_hint=str(exc), lang=lang)
        return self._store(
            step,
            parsed,
            lang=lang,
            source="user",
            confidence="low",
            detail=detail,
        )

    def escalation(self, text: str, *, lang: str | None = None) -> dict[str, Any]:
        """Everything W1.10 needs to ask a model to read the unparsed answer."""
        lang = lang or self.lang
        step = self._current
        if step is None:
            raise InterviewError("nothing is being asked — no escalation to build")
        question = step.question
        unit = question.unit_code or "none"
        return {
            "engine": ENGINE_ID,
            "questionId": question.id,
            "pointer": step.pointer,
            "type": question.type,
            "unit": question.unit_code,
            "storeyIndex": step.storey_index,
            "ask": dict(question.ask),
            "options": [
                {"value": option["value"], "label": dict(option["label"])}
                for option in question.options
            ],
            "answer": text,
            "instruction": ESCALATION_INSTRUCTION[lang].format(question_id=question.id, unit=unit),
            "contract": {"json": {"value": "<typed value>", "unit": "<unit or null>"}},
        }

    def finish(self, lang: str | None = None) -> list[Turn]:
        """Apply fallbacks for everything left; essential questions stay open and are listed."""
        lang = lang or self.lang
        turns: list[Turn] = []
        while self._current is not None:
            step = self._current
            if step.question.fallback and not step.question.essential:
                turns.append(self._fallback(step, lang=lang, trigger="finish"))
                continue
            self._record(step, "open", "essential")
            if step.question.id not in self._open:
                self._open.append(step.question.id)
            turns.append(
                Turn(
                    "ask_again",
                    question_id=step.question.id,
                    pointer=step.pointer,
                    reply=_essential_reply(step.question),
                    reason="essential_open",
                    chips=tuple(flow_chips(step.question, lang)),
                )
            )
            self._advance()
        return turns

    # ------------------------------------------------------------------ internals

    def _chip_result(self, question: Question, choice: str) -> ParseResult:
        if choice == SKIP_CHIP_ID:
            return ParseResult("skip", reason="dont_know", as_entered=choice)
        option = question.option(choice)
        if option is None:
            return ParseResult(
                "ask_again",
                reason="unknown_choice",
                candidates=tuple(item["value"] for item in question.options),
                as_entered=choice,
            )
        return ParseResult("accept", value=option["value"], as_entered=choice)

    def _external_result(self, question: Question, value: Any, unit: str | None) -> ParseResult:
        kind = question.type
        as_entered = f"{value}" if unit is None else f"{value} {unit}"
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
            return ParseResult("accept", value=int(number), as_entered=str(value))
        if kind == "number":
            if isinstance(value, bool):
                raise ValueError("number expected, got a boolean")
            number = Decimal(str(value))
            if number <= 0:
                raise ValueError(f"{value!r} must be positive")
            entered_unit = unit or question.unit_code
            canonical = canonical_value(question, number, entered_unit or "")
            return ParseResult(
                "accept",
                value=canonical,
                unit=entered_unit,
                as_entered=as_entered,
            )
        if kind in ("text", "file"):
            if not isinstance(value, str) or not value.strip():
                raise ValueError("a non-empty text answer is required")
            return ParseResult("accept", value=value.strip(), as_entered=as_entered)
        raise InterviewError(f"{question.id}: unsupported question type {kind!r}")

    def _handle(self, step: Step, parsed: ParseResult, *, raw: str, lang: str) -> Turn:
        if parsed.decision == "accept":
            writes = answer_writes(step.question, step.pointer, parsed.value)
            if writes.use_fallback:
                return self._fallback(step, lang=lang, trigger=parsed.reason or "answer")
            return self._store(step, parsed, lang=lang)
        if parsed.decision in ("skip", "default"):
            return self._fallback(step, lang=lang, trigger=parsed.reason or parsed.decision)
        if parsed.decision == "ask_again":
            return self._ask_again(
                step,
                parsed.reason,
                candidates=parsed.candidates,
                bounds=parsed.bounds,
                unit_hint=parsed.unit or "",
                lang=lang,
            )
        if parsed.decision == "escalate":
            return Turn(
                "escalate",
                question_id=step.question.id,
                pointer=step.pointer,
                reply=dict(REPLY_ESCALATE),
                reason=parsed.reason,
                escalation=self.escalation(raw, lang=lang),
            )
        raise InterviewError(f"unhandled parse decision {parsed.decision!r}")

    def _display(self, step: Step, value: Any, lang: str) -> str:
        question = step.question
        if isinstance(value, bool):
            if lang == "en":
                return "Yes" if value else "No"
            return "হ্যাঁ" if value else "না"
        if question.type == "choice" and isinstance(value, str):
            option = question.option(value)
            if option is not None:
                return option["label"][lang]
            return value
        if question.type == "multi_choice" and isinstance(value, list):
            labels = [self._display(step, item, lang) for item in value]
            return ", ".join(labels)
        if question.type in ("number", "integer") and isinstance(value, (int, float)):
            canonical = question.unit_code
            if canonical == "m2":
                unit = self._area_display() if self._area_display() in units.AREA_TO_M2 else "sqm"
                amount = units.area_from_m2(value, unit)
            elif canonical == "m":
                unit = self._length_display() if self._length_display() in units.LENGTH_TO_M else "m"
                amount = units.length_from_m(value, unit)
            elif canonical == "mm":
                unit = "mm"
                amount = Decimal(str(value))
            else:
                unit = canonical or ""
                amount = Decimal(str(value))
            text = units.format_number(amount, 2)
            word = units.UNIT_WORDS.get(unit, (unit, unit))[lang == "bn"]
            return f"{_fmt_number(text, lang)} {word}".strip()
        return str(value)

    def _closest_unit_word(self, unit: str | None, lang: str) -> str:
        if unit is None:
            return ""
        return units.UNIT_WORDS.get(unit, (unit, unit))[lang == "bn"]

    def _ask_again(
        self,
        step: Step,
        reason: str,
        *,
        candidates: Iterable[str] = (),
        bounds: tuple[int, int] | None = None,
        unit_hint: str = "",
        lang: str | None = None,
    ) -> Turn:
        lang = lang or self.lang
        message = dict(ASK_AGAIN.get(reason, ASK_AGAIN["schema"]))
        if reason == "out_of_range" and bounds is not None:
            message = dict(ASK_AGAIN["out_of_range_bounds"])
            for key in ("en", "bn"):
                message[key] = message[key].format(
                    lo=_fmt_number(str(bounds[0]), lang), hi=_fmt_number(str(bounds[1]), lang)
                )
        elif reason == "too_long" and bounds is not None:
            for key in ("en", "bn"):
                message[key] = message[key].format(limit=bounds[1])
        elif reason == "wrong_dimension":
            given = _DIMENSION_LABEL.get(DIMENSION.get(unit_hint, ""), _DIMENSION_LABEL["area"])
            expected = _DIMENSION_LABEL.get(CANONICAL_DIMENSION.get(step.question.unit_code or "", ""), _DIMENSION_LABEL["area"])
            for key in ("en", "bn"):
                message[key] = message[key].format(given=given[key], expected=expected[key])
        chips = tuple(self.chips(lang, candidates)) if candidates else ()
        return Turn(
            "ask_again",
            question_id=step.question.id,
            pointer=step.pointer,
            reply=message,
            reason=reason,
            chips=chips,
        )

    def _needed_containers(self, pointer: str) -> list[str]:
        out: list[str] = []
        if pointer.startswith("/phases/"):
            tokens = parse_pointer(pointer)
            if len(tokens) >= 3 and tokens[2] == "data":
                parent = "/" + "/".join(escape_token(token) for token in tokens[:3])
                if not self._exists(parent):
                    out.append(parent)
        elif pointer.startswith("/site/soil/") and not self._exists("/site/soil"):
            out.append("/site/soil")
        elif pointer.startswith("/site/jurisdiction/") and not self._exists("/site/jurisdiction"):
            out.append("/site/jurisdiction")
        elif pointer.startswith("/pricing/"):
            if not self._exists("/pricing"):
                # Pricing requires a currency; the schema fixes it to BDT.
                out.append("/pricing")
        return out

    def _apply(
        self, pairs: Iterable[tuple[str, Any]], provenance: dict[str, Any]
    ) -> tuple[dict[str, Any], ...]:
        ops: list[dict[str, Any]] = []
        seen: set[str] = set()
        for pointer, value in pairs:
            for parent in self._needed_containers(pointer):
                if parent not in seen:
                    container = {"currency": "BDT"} if parent == "/pricing" else {}
                    ops.append({"op": "add", "path": parent, "value": container})
                    seen.add(parent)
            ops.append({"op": "add", "path": pointer, "value": value})
        try:
            self.spec = apply_patch(self.spec, ops, provenance=provenance, at=self.at)
        except (SpecPatchError, PointerError) as exc:
            raise InterviewError(f"cannot write {[pair[0] for pair in pairs]}: {exc}") from exc
        return tuple(ops)

    def _record_assumption(
        self, question: Question, pointer: str, fallback: dict[str, Any]
    ) -> str | None:
        assumption = fallback.get("assumption") or {}
        statement = (assumption.get("en") or "").strip()
        if not statement:
            return None
        assumption_id = f"asm-{question.id}"
        try:
            existing = resolve(self.spec, "/assumptions")
        except PointerError:
            existing = []
        if any(entry.get("id") == assumption_id for entry in existing if isinstance(entry, dict)):
            return assumption_id
        entry = {
            "id": assumption_id,
            "subject": question.id,
            "statement": statement,
            "basis": _ASSUMPTION_BASIS.get(fallback.get("kind", ""), "conservative_default"),
            "verifyOnSite": fallback.get("kind") in ("area_default", "registry"),
            "relatedPath": pointer,
        }
        ops: list[dict[str, Any]] = []
        if not isinstance(existing, list):
            raise InterviewError("/assumptions must be an array")
        if not self._exists("/assumptions"):
            ops.append({"op": "add", "path": "/assumptions", "value": []})
        ops.append({"op": "add", "path": "/assumptions/-", "value": entry})
        provenance = {
            "source": "assumption",
            "detail": f"flow-book assumption: {question.id}",
            "confidence": "assumption",
        }
        try:
            self.spec = apply_patch(self.spec, ops, provenance=provenance, at=self.at)
        except (SpecPatchError, PointerError) as exc:
            raise InterviewError(f"cannot record assumption for {question.id}: {exc}") from exc
        self._assumptions.append(assumption_id)
        return assumption_id

    def _store(
        self,
        step: Step,
        parsed: ParseResult,
        *,
        lang: str,
        source: str = "user",
        confidence: str | None = None,
        detail: str | None = None,
    ) -> Turn:
        question = step.question
        writes = answer_writes(question, step.pointer, parsed.value)
        if writes.use_fallback:
            return self._fallback(step, lang=lang, trigger=parsed.reason or "answer")
        if detail is None:
            detail = f"interview: {question.id}"
            if parsed.unit:
                detail += f" (as entered: {parsed.as_entered})"
        if confidence is None:
            confidence = "medium" if parsed.used_display_unit else "high"
        provenance = {"source": source, "detail": detail, "confidence": confidence}
        try:
            ops = self._apply(writes.pairs, provenance)
        except SpecValidationError as exc:
            return self._ask_again(step, "schema", unit_hint=str(exc), lang=lang)
        self._values[question.id] = parsed.value
        if question.id in self._open:
            self._open.remove(question.id)
        self._record(step, "answered")
        self._log[-1]["value"] = parsed.value
        self._advance()
        return Turn(
            "accept",
            question_id=question.id,
            pointer=step.pointer,
            reply={"en": REPLY_ACCEPTED["en"].format(value=self._display(step, parsed.value, "en")),
                   "bn": REPLY_ACCEPTED["bn"].format(value=self._display(step, parsed.value, "bn"))},
            value=parsed.value,
            ops=ops,
            reason="accepted",
        )

    def _fallback(self, step: Step, *, lang: str, trigger: str) -> Turn:
        question = step.question
        fallback = question.fallback
        if question.essential or not fallback:
            if question.id not in self._open:
                self._open.append(question.id)
            if step.key not in self._outcomes:
                self._record(step, "open", "essential")
            reply = _essential_reply(question)
            return Turn(
                "ask_again",
                question_id=question.id,
                pointer=step.pointer,
                reply=reply,
                reason="essential_open",
                chips=tuple(flow_chips(question, lang)),
            )

        kind = fallback.get("kind")
        if kind not in FALLBACK_KINDS:
            raise InterviewError(f"{question.id}: unknown fallback kind {kind!r}")

        if kind == "omit":
            self._values[question.id] = None
            self._record(step, "omitted", trigger)
            self._advance()
            return Turn(
                "fallback",
                question_id=question.id,
                pointer=step.pointer,
                reply=dict(REPLY_OMITTED),
                reason="fallback:omit",
            )

        if kind == "default":
            value = fallback.get("value")
            if value is None:
                raise InterviewError(f"{question.id}: default fallback has no value")
            writes = answer_writes(question, step.pointer, value)
            if writes.use_fallback:
                raise InterviewError(f"{question.id}: default fallback cannot itself fall back")
            provenance = {
                "source": "default",
                "detail": f"flow-book default: {question.id}",
                "confidence": "assumption",
            }
            try:
                ops = self._apply(writes.pairs, provenance)
            except SpecValidationError as exc:
                raise InterviewError(f"{question.id}: default value is not schema-valid: {exc}") from exc
            assumption_id = self._record_assumption(question, step.pointer, fallback)
            self._values[question.id] = value
            self._record(step, "fallback", "default")
            self._advance()
            return Turn(
                "fallback",
                question_id=question.id,
                pointer=step.pointer,
                reply={
                    "en": REPLY_DEFAULT["en"].format(value=self._display(step, value, "en")),
                    "bn": REPLY_DEFAULT["bn"].format(value=self._display(step, value, "bn")),
                },
                value=value,
                ops=ops,
                reason="fallback:default",
                assumption_id=assumption_id,
            )

        if kind == "derive":
            reference = str(fallback.get("value", "")).strip()
            if not reference:
                # The book says "the design phase derives it" without naming a source.
                pending = {
                    "question": question.id,
                    "pointer": step.pointer,
                    "kind": kind,
                    "source": None,
                    "reason": "no source reference in the flow book; the design phase derives it",
                }
                self._pending.append(pending)
                assumption_id = self._record_assumption(question, step.pointer, fallback)
                self._values[question.id] = None
                self._record(step, "fallback", "derive_pending")
                self._advance()
                return Turn(
                    "fallback",
                    question_id=question.id,
                    pointer=step.pointer,
                    reply=self._pending_reply(fallback),
                    reason="fallback:derive_pending",
                    assumption_id=assumption_id,
                    pending=(pending,),
                )
            derived: Any = None
            source_pointer = reference
            if reference.startswith("<") and reference.endswith(">"):
                source_pointer = "/" + reference[1:-1].replace(".", "/")
                try:
                    derived = resolve(self.spec, source_pointer)
                except PointerError:
                    pending = {
                        "question": question.id,
                        "pointer": step.pointer,
                        "kind": kind,
                        "source": source_pointer,
                        "reason": f"{source_pointer} is not set yet",
                    }
                    self._pending.append(pending)
                    self._values[question.id] = None
                    self._record(step, "fallback", "derive_pending")
                    self._advance()
                    return Turn(
                        "fallback",
                        question_id=question.id,
                        pointer=step.pointer,
                        reply=self._pending_reply(fallback),
                        reason="fallback:derive_pending",
                        pending=(pending,),
                    )
            else:
                derived = fallback.get("value")
            provenance = {
                "source": "engine",
                "detail": f"derived from {source_pointer} (flow-book: {question.id})",
                "confidence": "high",
            }
            try:
                ops = self._apply(((step.pointer, derived),), provenance)
            except SpecValidationError as exc:
                pending = {
                    "question": question.id,
                    "pointer": step.pointer,
                    "kind": kind,
                    "source": source_pointer,
                    "reason": str(exc),
                }
                self._pending.append(pending)
                self._values[question.id] = None
                self._record(step, "fallback", "derive_pending")
                self._advance()
                return Turn(
                    "fallback",
                    question_id=question.id,
                    pointer=step.pointer,
                    reply=self._pending_reply(fallback),
                    reason="fallback:derive_pending",
                    pending=(pending,),
                )
            self._values[question.id] = derived
            self._record(step, "fallback", "derive")
            self._advance()
            return Turn(
                "fallback",
                question_id=question.id,
                pointer=step.pointer,
                reply={
                    "en": REPLY_DERIVED["en"].format(value=self._display(step, derived, "en")),
                    "bn": REPLY_DERIVED["bn"].format(value=self._display(step, derived, "bn")),
                },
                value=derived,
                ops=ops,
                reason="fallback:derive",
            )

        # registry / area_default: apply the authored value if the schema accepts it,
        # otherwise declare it pending. The assumption statement is always preserved.
        assumed = fallback.get("value")
        assumption = fallback.get("assumption") or {}
        statement = assumption.get("en") or f"{kind} fallback: {question.id}"
        applied = False
        ops: tuple[dict[str, Any], ...] = ()
        pending_item: dict[str, Any] | None = None
        if assumed is not None:
            provenance = {
                "source": "assumption",
                "detail": statement,
                "confidence": "assumption",
            }
            writes = answer_writes(question, step.pointer, assumed)
            if writes.use_fallback:
                writes = Writes(((step.pointer, assumed),))
            try:
                ops = self._apply(writes.pairs, provenance)
                applied = True
            except SpecValidationError as exc:
                pending_item = {
                    "question": question.id,
                    "pointer": step.pointer,
                    "kind": kind,
                    "value": assumed,
                    "assumption": dict(assumption),
                    "reason": str(exc),
                }
        else:
            pending_item = {
                "question": question.id,
                "pointer": step.pointer,
                "kind": kind,
                "value": None,
                "assumption": dict(assumption),
                "reason": "no value is authored for this fallback",
            }
        if not applied and pending_item is not None:
            self._pending.append(pending_item)
        assumption_id = self._record_assumption(question, step.pointer, fallback) if applied else None
        self._values[question.id] = assumed if applied else None
        self._record(step, "fallback", kind if applied else f"{kind}_pending")
        self._advance()
        reply = {
            "en": statement if applied else f"{statement} {REPLY_PENDING['en']}",
            "bn": assumption.get("bn") or statement,
        }
        if not applied:
            reply["bn"] = f"{reply['bn']} {REPLY_PENDING['bn']}".strip()
        return Turn(
            "fallback",
            question_id=question.id,
            pointer=step.pointer,
            reply=reply,
            value=assumed if applied else None,
            ops=ops,
            reason=f"fallback:{kind}" if applied else f"fallback:{kind}_pending",
            assumption_id=assumption_id,
            pending=(pending_item,) if pending_item is not None else (),
        )

    def _pending_reply(self, fallback: dict[str, Any]) -> dict[str, str]:
        assumption = fallback.get("assumption") or {}
        out: dict[str, str] = {}
        for key in ("en", "bn"):
            statement = assumption.get(key) or assumption.get("en") or ""
            out[key] = f"{statement} {REPLY_PENDING[key]}".strip() if statement else REPLY_PENDING[key]
        return out

    # ------------------------------------------------------------------ reports

    def progress(self) -> dict[str, Any]:
        """Live state: counts, open essentials, pending engine work (never silent gaps)."""
        counts = {"answered": 0, "fallback": 0, "omitted": 0, "skipped": 0, "open": 0}
        for info in self._outcomes.values():
            outcome = info["outcome"]
            if outcome in counts:
                counts[outcome] += 1
        return {
            "done": self._current is None,
            "current": self._current.key if self._current is not None else None,
            "question": self._current.question.id if self._current is not None else None,
            **counts,
            "openEssential": list(self._open),
            "pending": [dict(item) for item in self._pending],
            "assumptions": list(self._assumptions),
        }

    def coverage(self) -> dict[str, dict[str, Any]]:
        """One outcome per visited question — the declared-coverage table for tests/UI."""
        out: dict[str, dict[str, Any]] = {}
        for key, info in self._outcomes.items():
            step = self._meta[key]
            out[key] = {
                "question": step.question.id,
                "storeyIndex": step.storey_index,
                "pointer": step.pointer,
                **info,
            }
        return out

    def history(self) -> list[dict[str, Any]]:
        return [dict(entry) for entry in self._log]


def _essential_reply(question: Question) -> dict[str, str]:
    return {
        "en": REPLY_ESSENTIAL["en"].format(ask=question.prompt("en")),
        "bn": REPLY_ESSENTIAL["bn"].format(ask=question.prompt("bn")),
    }
