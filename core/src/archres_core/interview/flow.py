"""Phase Flow Book access for the question engine (W1.4).

The flow book (``spec/flows/phase-flow-book.yaml``, W0.4) is data: questions, chips,
fallbacks, conditions and spec pointers. This module only reads it — adding or rewording
a question stays a data edit. The loader is deliberately independent of the training
pipeline's loader (W1.5) except for the YAML itself; a test keeps the two in step so the
book cannot fork into two truths.

Semantics implemented here:

- ``when`` conditions: ``<question-id> <op> <value>`` or ``storeyIndex <op> <n>``. The
  operands are **answer values** (a yes/no answer is ``True``/``False``, a choice is its
  option value), not the possibly-coerced value stored in the spec — ``soil-has-report``
  stores an enum but its condition still compares against ``yes``.
- per-storey questions: the floor flow's ``/phases/floor-<n>/data/...`` pointers are
  resolved with the storey index (``floor-0`` is the ground floor, matching the spec).
"""

from __future__ import annotations

import pathlib
import re
from dataclasses import dataclass, field
from typing import Any

import yaml

WHEN_PATTERN = re.compile(r"^([A-Za-z0-9-]+)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?|[A-Za-z0-9-]+)$")

SKIP_CHIP = {"en": "I don't know", "bn": "জানি না"}
SKIP_CHIP_ID = "@skip"


class FlowBookError(RuntimeError):
    """The book cannot be used by the engine (bad data, unknown flow, missing condition)."""


class ConditionError(FlowBookError):
    """A ``when`` condition references a value that has not been answered (yet)."""


@dataclass(frozen=True)
class Question:
    id: str
    flow_id: str
    type: str
    maps_to: str
    ask: dict[str, str]
    why: dict[str, str] = field(default_factory=dict)
    unit: dict[str, Any] | None = None
    options: tuple[dict[str, Any], ...] = ()
    essential: bool = False
    fallback: dict[str, Any] = field(default_factory=dict)
    when: str | None = None
    source: str | None = None

    @property
    def unit_code(self) -> str | None:
        return (self.unit or {}).get("canonical")

    @property
    def display_units(self) -> list[str]:
        return list((self.unit or {}).get("display") or [])

    def option(self, value: str) -> dict[str, Any] | None:
        for option in self.options:
            if option["value"] == value:
                return dict(option)
        return None

    def prompt(self, lang: str) -> str:
        return self.ask[lang]

    def explain(self, lang: str) -> str:
        return self.why.get(lang, "")


@dataclass(frozen=True)
class Flow:
    id: str
    name: dict[str, str]
    goal: dict[str, str]
    repeats: str
    phase_kind: str | None
    questions: tuple[Question, ...]

    @property
    def per_storey(self) -> bool:
        return self.repeats == "per_storey"


@dataclass(frozen=True)
class FlowBook:
    version: str
    status: str
    langs: tuple[str, ...]
    flows: tuple[Flow, ...]

    @property
    def questions(self) -> tuple[Question, ...]:
        return tuple(question for flow in self.flows for question in flow.questions)

    @property
    def by_id(self) -> dict[str, Question]:
        return {question.id: question for question in self.questions}

    def flow(self, flow_id: str) -> Flow:
        for flow in self.flows:
            if flow.id == flow_id:
                return flow
        raise FlowBookError(f"unknown flow {flow_id!r} (have: {', '.join(f.id for f in self.flows)})")

    def question(self, question_id: str) -> Question:
        try:
            return self.by_id[question_id]
        except KeyError as exc:
            raise FlowBookError(f"unknown question {question_id!r}") from exc


def load_book(path: str | pathlib.Path) -> FlowBook:
    """Read and shape the flow book YAML (source of truth: ``spec/flows/``)."""
    data = yaml.safe_load(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise FlowBookError("flow book must be a YAML mapping")
    flows: list[Flow] = []
    for raw_flow in data.get("flows") or []:
        questions: list[Question] = []
        for raw in raw_flow.get("questions") or []:
            questions.append(
                Question(
                    id=raw["id"],
                    flow_id=raw_flow["id"],
                    type=raw.get("type", "text"),
                    maps_to=raw["maps_to"],
                    ask=dict(raw["ask"]),
                    why=dict(raw.get("why") or {}),
                    unit=dict(raw["unit"]) if raw.get("unit") else None,
                    options=tuple(dict(option) for option in raw.get("options") or ()),
                    essential=bool(raw.get("essential")),
                    fallback=dict(raw.get("fallback") or {}),
                    when=raw.get("when"),
                    source=raw.get("source"),
                )
            )
        flows.append(
            Flow(
                id=raw_flow["id"],
                name=dict(raw_flow["name"]),
                goal=dict(raw_flow["goal"]),
                repeats=raw_flow["repeats"],
                phase_kind=raw_flow.get("phaseKind"),
                questions=tuple(questions),
            )
        )
    return FlowBook(
        version=str(data["bookVersion"]),
        status=str(data["status"]),
        langs=tuple(data.get("langs") or ("bn", "en")),
        flows=tuple(flows),
    )


def pointer_for(question: Question, storey_index: int | None = None) -> str:
    """Resolve a question's spec pointer, expanding the ``floor-<n>`` storey template."""
    pointer = question.maps_to
    if "<n>" not in pointer:
        return pointer
    if storey_index is None:
        raise FlowBookError(f"{question.id}: per-storey pointer {pointer!r} needs a storey index")
    return pointer.replace("<n>", str(storey_index))


def chips(question: Question, lang: str = "en") -> list[dict[str, Any]]:
    """Quick replies for a question: option chips, plus one explicit "I don't know" chip.

    Chips are shortcuts, never constraints (plan §8): the caller still accepts free text.
    An essential question gets no skip chip — it cannot be assumed, so the UI must not
    offer a button that pretends otherwise.
    """
    out: list[dict[str, Any]] = []
    for option in question.options:
        out.append(
            {
                "id": option["value"],
                "label": option["label"][lang],
                "kind": "option",
                "option": option["value"],
            }
        )
    if question.fallback and not question.essential:
        out.append({"id": SKIP_CHIP_ID, "label": SKIP_CHIP[lang], "kind": "skip"})
    return out


def parse_when(condition: str) -> tuple[str, str, str]:
    match = WHEN_PATTERN.match(condition.strip())
    if not match:
        raise FlowBookError(f"cannot parse when condition {condition!r}")
    return match.group(1), match.group(2), match.group(3)


def _operand(token: str) -> Any:
    lowered = token.strip().lower()
    if lowered in ("yes", "true"):
        return True
    if lowered in ("no", "false"):
        return False
    try:
        number = float(token)
    except ValueError:
        return lowered
    return int(number) if number.is_integer() else number


def _compare(left: Any, op: str, right: Any) -> bool:
    if op == "==":
        return left == right
    if op == "!=":
        return left != right
    if isinstance(left, bool) or isinstance(right, bool):
        raise ConditionError(f"cannot order booleans ({op!r})")
    if op == ">":
        return left > right
    if op == "<":
        return left < right
    if op == ">=":
        return left >= right
    return left <= right


def condition_holds(
    condition: str, values: dict[str, Any], storey_index: int | None = None
) -> bool:
    """Evaluate one ``when`` against answered values.

    Raises ``ConditionError`` when the operand has not been answered — a condition is
    never guessed. The engine turns that into a declared skip, so a book-order mistake is
    visible instead of silently dropping a question.
    """
    operand, op, token = parse_when(condition)
    if operand == "storeyIndex":
        if storey_index is None:
            raise ConditionError(f"condition {condition!r} needs a storey index")
        left: Any = storey_index
    elif operand in values:
        left = values[operand]
    else:
        raise ConditionError(f"condition {condition!r} references unanswered {operand!r}")
    return _compare(left, op, _operand(token))
