"""Scripted dataset generators (W1.5) - deterministic, artifact-grounded.

Every record is built from frozen artifacts, never invented:

- **interview.ask** - one record per flow-book question per language; the assistant text
  is the hand-authored flow-book question.
- **interview.parse** - clean answers derived from the example Building Specs (one value
  per resolved ``maps_to``) plus the sloppy-input class from ``mutations``; the label
  carries the canonical value/option a correct parse must reach.
- **rule.explain / deviation.override** - built from a *live* rule-engine run
  (``archres_core.compliance``) on the example spec with every v0 design input: the
  citations, numbers and register entries in the records are exactly what the engine
  produced, so training targets and app behaviour cannot drift apart.

Choice-answer contract (v0): the parse target for choice questions is the **option id**
from the flow book (e.g. ``dhaka``); mapping option ids to spec values is the question
engine's job (W1.4). Numbers are canonical (m2 / m / kPa), booleans for yes-no, trimmed
strings for text.

Verification: records carry ``status: verified`` only after ``verify_record`` passes;
``build_chat_dataset`` refuses to emit a failing record (fail fast, never silent).
"""

from __future__ import annotations

import dataclasses
import json
import pathlib
from dataclasses import dataclass, field
from typing import Any, Iterable

import yaml

from .. import units
from ..compliance import evaluate_spec, load_pack, pack_sha256, register_ops
from ..spec import PointerError, apply_patch, resolve
from . import mutations, prompts
from .records import make_id, record_sort_key, sha256_file, sha256_text
from .verify import VerifyContext, numbers_in, verify_record

GENERATOR_VERSION = "build_chat_dataset-0.1.0"
#: The canonical evaluation subject for explain/override records: the example spec with
#: every v0 design input, at a fixed timestamp (the same shape the W1.2 tests use).
AT = "2026-10-18T10:02:00+06:00"
FULL_INPUTS = [
    {"op": "add", "path": "/phases/0/data/setbackFrontM", "value": 1.2},
    {"op": "add", "path": "/phases/0/data/setbackRearM", "value": 2.0},
    {"op": "add", "path": "/phases/0/data/setbackSideLeftM", "value": 1.25},
    {"op": "add", "path": "/phases/0/data/setbackSideRightM", "value": 1.25},
    {"op": "add", "path": "/phases/0/data/plannedTotalFloorAreaSqm", "value": 1400},
    {"op": "add", "path": "/phases/0/data/parkingSpaces", "value": 1},
    {"op": "add", "path": "/building/typicalUnitAreaSqm", "value": 150},
]

_COMPARATOR = {"min": ("at least", "কমপক্ষে"), "max": ("at most", "সর্বোচ্চ"), "exact": ("exactly", "ঠিক")}
_YESNO = {"en": ("Yes", "No"), "bn": ("হ্যাঁ", "না")}
_INTENT_UNIT = {"plannedTotalFloorAreaSqm": "sqm"}
_INTENT = {
    "setbackFrontM": {
        "en": "I need to keep the front setback at {v} m - there is a small porch there.",
        "bn": "সামনের সেটব্যাক আমি {v} মিটারেই রাখতে চাই — ওখানে ছোট বারান্দা আছে।",
    },
    "plannedTotalFloorAreaSqm": {
        "en": "I want to build the floor area as planned ({v} sqm).",
        "bn": "আমি পরিকল্পনা অনুযায়ীই তলা-ক্ষেত্রফল বানাতে চাই ({v} বর্গমিটার)।",
    },
    "parkingSpaces": {
        "en": "I can only provide {v} car space(s) - the plot is tight.",
        "bn": "প্লট ছোট, আমি {v}টির বেশি কার পার্কিং দিতে পারব না।",
    },
}

_EXPLAIN_TEMPLATE = {
    "compliant": {
        "en": (
            "{title}: the design gives {measured}; the requirement is {requirement}. "
            "This is within the limit - no action needed. References: [{citations}]."
        ),
        "bn": (
            "{title}: নকশায় আছে {measured}; শর্ত {requirement}। সীমার মধ্যে আছে — "
            "কোনো ব্যবস্থা লাগবে না। রেফারেন্স: [{citations}]।"
        ),
    },
    "deviation": {
        "en": (
            "{title}: the design gives {measured}; {requirement} is required. This is a "
            "deviation - RAJUK approval would flag it. You can revise the design, or "
            "record an override in the Deviation Register. References: [{citations}]."
        ),
        "bn": (
            "{title}: নকশায় আছে {measured}; প্রয়োজন {requirement}। এটি একটি ব্যতিক্রম — "
            "অনুমোদনে আপত্তি উঠবে। নকশা সংশোধন করতে পারেন, অথবা ডেভিয়েশন রেজিস্টারে "
            "ওভাররাইড লিখতে পারেন। রেফারেন্স: [{citations}]।"
        ),
    },
    "impossible": {
        "en": (
            "{title}: as designed this cannot be approved ({measured}); {requirement} "
            "would be required. The design or the plot must change. References: [{citations}]."
        ),
        "bn": (
            "{title}: এই নকশা অনুমোদনযোগ্য নয় ({measured}); প্রয়োজন হবে {requirement}। "
            "নকশা বা প্লট বদলাতে হবে। রেফারেন্স: [{citations}]।"
        ),
    },
}
_OVERRIDE_ADVISORY = {
    "en": (
        "{title}: the check requires {requirement}; your design gives {measured}. If we "
        "keep it, RAJUK approval will flag this as a deviation and it must be recorded in "
        "the Deviation Register (risk: approval_risk) - the drawings will carry the note. "
        "Shall I record it as a deviation? References: [{citations}]."
    ),
    "bn": (
        "{title}: শর্ত {requirement}; আপনার নকশায় আছে {measured}। এভাবে রাখলে অনুমোদনে "
        "ব্যতিক্রম হিসেবে চিহ্নিত হবে এবং ডেভিয়েশন রেজিস্টারে লিখতে হবে (ঝুঁকি: "
        "approval_risk) — ড্রয়িংয়ে নোট থাকবে। ব্যতিক্রম হিসেবে রেকর্ড করব? "
        "রেফারেন্স: [{citations}]।"
    ),
}
_OVERRIDE_DONE = {
    "en": (
        "Recorded. The deviation is in the register as {id} (risk: approval_risk); you "
        "can change it any time.\n{register}"
    ),
    "bn": (
        "রেকর্ড করা হয়েছে। ব্যতিক্রমটি রেজিস্টারে {id} নামে আছে (ঝুঁকি: approval_risk); "
        "যেকোনো সময় পরিবর্তন করতে পারবেন।\n{register}"
    ),
}


class GeneratorError(RuntimeError):
    """The build cannot produce trustworthy records (artifact/interface problem)."""


# ------------------------------------------------------------------ flow book


@dataclass(frozen=True)
class Question:
    id: str
    phase_id: str
    type: str
    maps_to: str
    essential: bool
    fallback: dict[str, Any]
    ask: dict[str, str]
    why: dict[str, str] = field(default_factory=dict)
    unit: dict[str, Any] | None = None
    options: tuple[dict[str, Any], ...] = ()

    @property
    def unit_code(self) -> str | None:
        return (self.unit or {}).get("canonical")

    @property
    def display(self) -> list[str]:
        return list((self.unit or {}).get("display") or [])


def load_flow_book(path: str | pathlib.Path) -> list[Question]:
    """Read the flow book YAML into question objects (single source of truth)."""
    data = yaml.safe_load(pathlib.Path(path).read_text(encoding="utf-8"))
    questions: list[Question] = []
    for flow in data.get("flows") or []:
        for raw in flow.get("questions") or []:
            questions.append(
                Question(
                    id=raw["id"],
                    phase_id=flow["id"],
                    type=raw.get("type", "text"),
                    maps_to=raw["maps_to"],
                    essential=bool(raw.get("essential")),
                    fallback=dict(raw.get("fallback") or {}),
                    ask=dict(raw["ask"]),
                    why=dict(raw.get("why") or {}),
                    unit=dict(raw["unit"]) if raw.get("unit") else None,
                    options=tuple(raw.get("options") or ()),
                )
            )
    return questions


def example_values(
    questions: Iterable[Question], examples_dir: str | pathlib.Path
) -> dict[str, list[tuple[str, Any]]]:
    """Resolved example-spec values per question id: [(example name, value), ...]."""
    directory = pathlib.Path(examples_dir)
    specs = {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(directory.glob("*.json"))
    }
    out: dict[str, list[tuple[str, Any]]] = {}
    for question in questions:
        hits: list[tuple[str, Any]] = []
        for name, spec in specs.items():
            try:
                hits.append((name, resolve(spec, question.maps_to)))
            except PointerError:
                continue
        if hits:
            out[question.id] = hits
    return out


# ------------------------------------------------------------------- answers


def _number_text(lang: str, raw: str, unit: str | None) -> str:
    if unit is None:
        return raw
    en_word, bn_word = units.unit_words(unit)
    return f"{mutations.bn_digits(raw)} {bn_word}" if lang == "bn" else f"{raw} {en_word}"


def _option_for(question: Question, value: Any) -> dict[str, Any] | None:
    if not question.options:
        return None
    text = str(value).strip().lower()
    for option in question.options:
        if str(option.get("value", "")).lower() == text:
            return dict(option)
        labels = option.get("label") or {}
        if str(labels.get("en", "")).strip().lower() == text or str(labels.get("bn", "")).strip() == str(value):
            return dict(option)
    return None


def clean_answer(question: Question, value: Any, lang: str) -> dict[str, Any] | None:
    """Canonical clean answer for one question/value/language; None when unrenderable."""
    kind = question.type
    if kind in ("number", "integer"):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
        raw = units.format_number(value, 2) if kind == "number" else str(int(value))
        unit = question.unit_code
        return {"kind": kind, "value": value, "unit": unit, "text": _number_text(lang, raw, unit)}
    if kind == "yes_no":
        if not isinstance(value, bool):
            return None
        return {"kind": kind, "value": value, "unit": None, "text": _YESNO[lang][0 if value else 1]}
    if kind == "choice":
        option = _option_for(question, value)
        if option is None:
            return None
        return {
            "kind": kind,
            "value": option["value"],
            "unit": None,
            "text": (option.get("label") or {}).get(lang) or option["value"],
            "option": option,
        }
    if kind == "text":
        if not isinstance(value, str):
            return None
        return {"kind": kind, "value": value, "unit": None, "text": value}
    return None


def _parse_response(
    pointer: str,
    decision: str,
    *,
    value: Any = None,
    unit: str | None = None,
    fallback_kind: str | None = None,
    confidence: str = "high",
    echo: str,
) -> str:
    payload: dict[str, Any] = {
        "pointer": pointer,
        "decision": decision,
        "confidence": confidence,
        "echo": echo,
    }
    if decision == "accept":
        payload["value"] = value
        if unit:
            payload["unit"] = unit
    elif decision == "fallback" and fallback_kind:
        payload["fallback"] = fallback_kind
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _seed_int(*parts: str) -> int:
    return int(sha256_text("::".join(parts))[:12], 16)


# --------------------------------------------------------------------- records


def _ask_record(question: Question, lang: str) -> dict[str, Any]:
    instruction = prompts.USER_INSTRUCTION["interview.ask"][lang].format(
        question_en=question.ask["en"],
        question_bn=question.ask["bn"],
        question_id=question.id,
        phase_id=question.phase_id,
    )
    return {
        "schemaVersion": "0.1.0",
        "id": make_id("chat", "ask", question.phase_id, question.id, lang),
        "kind": "chat",
        "task": "interview.ask",
        "lang": lang,
        "messages": [
            {"role": "system", "content": f"{prompts.SYSTEM}\n\n{prompts.TASK_INSTRUCTION['interview.ask']}"},
            {"role": "user", "content": instruction},
            {"role": "assistant", "content": question.ask[lang]},
        ],
        "labels": {
            "questionId": question.id,
            "phaseId": question.phase_id,
            "mapsTo": question.maps_to,
            "essential": question.essential,
        },
        "input": {
            "generator": GENERATOR_VERSION,
            "questionId": question.id,
            "phaseId": question.phase_id,
            "lang": lang,
        },
        "source": {"kind": "scripted", "promptVersion": prompts.PROMPT_VERSION},
        "difficulty": "clean",
        "status": "verified",
        "verifyChecks": ["schema", "ask.text", "labels", "language"],
    }


def _parse_system(question: Question) -> str:
    return (
        f"{prompts.SYSTEM}\n\n{prompts.TASK_INSTRUCTION['interview.parse']}\n\n"
        f"Question: {question.id} (phase {question.phase_id}); it records into {question.maps_to}."
    )


def _parse_record(
    question: Question,
    lang: str,
    answer_text: str,
    *,
    suffix: str,
    difficulty: str,
    assistant: str,
    labels: dict[str, Any],
    input_extra: dict[str, Any],
    seed: str | None = None,
    checks: list[str] | None = None,
) -> dict[str, Any]:
    source: dict[str, Any] = {"kind": "scripted", "promptVersion": prompts.PROMPT_VERSION}
    if seed is not None:
        source["seed"] = _seed_int(seed)
    return {
        "schemaVersion": "0.1.0",
        "id": make_id("chat", "parse", question.id, suffix, lang),
        "kind": "chat",
        "task": "interview.parse",
        "lang": lang,
        "messages": [
            {"role": "system", "content": _parse_system(question)},
            {
                "role": "user",
                "content": prompts.USER_INSTRUCTION["interview.parse"][lang].format(
                    question_id=question.id,
                    question_en=question.ask["en"],
                    question_bn=question.ask["bn"],
                    answer=answer_text,
                ),
            },
            {"role": "assistant", "content": assistant},
        ],
        "labels": labels,
        "input": {
            "generator": GENERATOR_VERSION,
            "questionId": question.id,
            "phaseId": question.phase_id,
            **input_extra,
        },
        "source": source,
        "difficulty": difficulty,
        "status": "verified",
        "verifyChecks": checks or ["schema", "parse.labels", "labels", "language"],
    }


def build_ask_records(questions: list[Question]) -> list[dict[str, Any]]:
    return [_ask_record(question, lang) for question in questions for lang in ("bn", "en")]


def _clean_bases(
    question: Question, values: dict[str, list[tuple[str, Any]]]
) -> list[tuple[str, dict[str, Any], str]]:
    """[(suffix, base answer, lang)] for clean parse records (bounded, deterministic)."""
    out: list[tuple[str, dict[str, Any], str]] = []
    if question.type == "choice":
        picked = [question.options[0]] if question.options else []
        if len(question.options) > 1:
            picked.append(question.options[-1])
        for option in picked:
            for lang in ("bn", "en"):
                answer = clean_answer(question, option["value"], lang)
                if answer is not None:
                    out.append((f"opt-{option['value']}", answer, lang))
        return out
    seen: set[str] = set()
    for _name, value in values.get(question.id, []):
        key = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        if len(seen) > 2:  # two example values per question are plenty for v0
            break
        for lang in ("bn", "en"):
            answer = clean_answer(question, value, lang)
            if answer is not None:
                out.append((f"v{len(seen)}", answer, lang))
    return out


def build_parse_records(
    questions: list[Question], values: dict[str, list[tuple[str, Any]]]
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for question in questions:
        if question.type == "file":
            continue
        bases = _clean_bases(question, values)
        if not bases:
            continue
        for suffix, base, lang in bases:
            labels = {"questionId": question.id, "pointer": question.maps_to, "decision": "accept", "value": base["value"]}
            if base["unit"]:
                labels["unit"] = base["unit"]
            records.append(
                _parse_record(
                    question,
                    lang,
                    base["text"],
                    suffix=f"{suffix}-clean",
                    difficulty="clean",
                    assistant=_parse_response(
                        question.maps_to, "accept", value=base["value"], unit=base["unit"], echo=base["text"]
                    ),
                    labels=labels,
                    input_extra={"base": base["value"], "baseUnit": base["unit"]},
                    checks=["schema", "parse.clean", "labels", "language"],
                )
            )
        # sloppy class: mutate the first base of the question, both languages.
        # unit_alt is exhausted over every alternative display unit (katha/shotok/bigha,
        # ft, sqft) so a display unit can never be silently untested. banglish is
        # exhausted over every example value so both yes/no answers appear.
        base0 = bases[0][1]

        def emit(
            operator: str,
            answer: dict[str, Any],
            lang: str,
            *,
            suffix: str,
            seed: str,
            unit_target: str | None = None,
        ) -> None:
            try:
                result = mutations.apply_operator(
                    operator,
                    question=question_dict(question),
                    base=answer,
                    lang=lang,
                    seed=seed,
                    unit_target=unit_target,
                )
            except mutations.OperatorNotApplicable:
                return
            decision = result["decision"]
            detail = result["detail"]
            labels = {"questionId": question.id, "pointer": question.maps_to, "decision": decision}
            value: Any = None
            unit: str | None = None
            confidence = "high"
            if decision == "accept":
                if operator == "unit_alt":
                    value, unit = detail["canonical"], answer["unit"]
                elif operator in ("as_given", "whitespace"):
                    value = detail.get("asGiven") or detail.get("trimmed")
                elif operator in ("partial", "typo_label"):
                    value, confidence = answer["option"]["value"], "medium"
                else:
                    value, unit = answer["value"], answer["unit"]
                labels["value"] = value
                if unit:
                    labels["unit"] = unit
            elif decision == "fallback":
                labels["fallbackKind"] = detail["fallbackKind"]
            assistant = _parse_response(
                question.maps_to,
                decision,
                value=value,
                unit=unit,
                fallback_kind=detail.get("fallbackKind"),
                confidence=confidence,
                echo=result["text"],
            )
            input_extra: dict[str, Any] = {
                "operator": operator,
                "mutationSeed": seed,
                "answerText": result["text"],
                "baseAnswer": answer,
                "detail": detail,
                "base": answer["value"],
                "baseUnit": answer["unit"],
            }
            if unit_target is not None:
                input_extra["unitTarget"] = unit_target
            records.append(
                _parse_record(
                    question,
                    lang,
                    result["text"],
                    suffix=suffix,
                    difficulty="sloppy",
                    assistant=assistant,
                    labels=labels,
                    input_extra=input_extra,
                    seed=seed,
                    checks=["schema", "parse.mutation", "labels", "language"],
                )
            )

        for lang in ("bn", "en"):
            answer0 = clean_answer(
                question,
                base0["option"]["value"] if base0.get("option") else base0["value"],
                lang,
            )
            if answer0 is None:
                continue
            operators = mutations.applicable_operators(question_dict(question), answer0)
            for operator in operators:
                if operator == "bangla_digits" and lang == "bn":
                    continue  # bn clean text already uses Bangla digits
                if operator == "unit_alt":
                    for target in mutations.alternative_units(question_dict(question), answer0):
                        seed = (
                            f"{question.id}::{question.phase_id}::{lang}::{operator}::"
                            f"{answer0['text']}::{target}"
                        )
                        emit(
                            operator,
                            answer0,
                            lang,
                            suffix=f"slp-unit-alt-{target}",
                            seed=seed,
                            unit_target=target,
                        )
                    continue
                if operator == "banglish":
                    # ``bases`` carries one entry per example value *per language*; the
                    # language is supplied by the loop, so dedupe values here or the
                    # same record is emitted twice.
                    seen_values: set[str] = set()
                    for base_suffix, base_value, _ in bases:
                        value_key = json.dumps(base_value["value"], ensure_ascii=False, sort_keys=True)
                        if value_key in seen_values:
                            continue
                        seen_values.add(value_key)
                        answer = clean_answer(
                            question,
                            base_value["option"]["value"]
                            if base_value.get("option")
                            else base_value["value"],
                            lang,
                        )
                        if answer is None:
                            continue
                        seed = (
                            f"{question.id}::{question.phase_id}::{lang}::{operator}::"
                            f"{base_suffix}::{answer['text']}"
                        )
                        emit(
                            operator,
                            answer,
                            lang,
                            suffix=f"slp-banglish-{base_suffix}",
                            seed=seed,
                        )
                    continue
                seed = f"{question.id}::{question.phase_id}::{lang}::{operator}::{answer0['text']}"
                emit(
                    operator,
                    answer0,
                    lang,
                    suffix=f"slp-{operator.replace('_', '-')}",
                    seed=seed,
                )
    return records


def question_dict(question: Question) -> dict[str, Any]:
    """The question as a plain dict (mutations/verify consume plain data).

    The dataclass fields do not carry the computed ``display`` / ``unit_code``
    properties; mutations need the display list to generate a unit conversion. Keeping
    this conversion in one place is what makes ``unit_alt`` reproducible.
    """
    data = dataclasses.asdict(question)
    data["display"] = question.display
    data["unit_code"] = question.unit_code
    return data


# ------------------------------------------------------------ engine context


def _compliance_context(
    pack_path: str | pathlib.Path, examples_dir: str | pathlib.Path
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    spec0 = json.loads((pathlib.Path(examples_dir) / "new-project.json").read_text(encoding="utf-8"))
    spec = apply_patch(spec0, FULL_INPUTS, provenance={"source": "user"}, at=AT)
    pack = load_pack(pack_path)
    verdict_set = evaluate_spec(spec, pack, pack_path=pack_path, evaluated_at=AT)
    return spec, pack, verdict_set


def _fmt_amount(value: Any, unit: str | None, lang: str) -> str:
    number = units.format_number(value, 2)
    if unit == "spaces":
        spaces = int(value) if float(value).is_integer() else value
        if lang == "bn":
            return f"{mutations.bn_digits(str(spaces))}টি কার পার্কিং"
        return f"{spaces} parking space" if spaces == 1 else f"{spaces} parking spaces"
    if unit == "FAR":
        return f"FAR {mutations.bn_digits(number) if lang == 'bn' else number}"
    if unit in units.UNIT_WORDS:
        en_word, bn_word = units.unit_words(unit)
        return f"{mutations.bn_digits(number)} {bn_word}" if lang == "bn" else f"{number} {en_word}"
    return mutations.bn_digits(number) if lang == "bn" else number


def _req_text(limit: dict[str, Any], lang: str) -> str:
    en_cmp, bn_cmp = _COMPARATOR.get(limit.get("comparator"), ("", ""))
    amount = _fmt_amount(limit.get("value"), limit.get("unit"), lang)
    return f"{bn_cmp} {amount}" if lang == "bn" else f"{en_cmp} {amount}".strip()


def _key_of(path: str) -> str:
    return path.rstrip("/").rsplit("/", 1)[-1]


def _explain_facts(verdict: dict[str, Any]) -> dict[str, Any]:
    """The engine-produced facts a narration may use (no prose, no answer text)."""
    return {
        "ruleRef": verdict["ruleRef"],
        "status": verdict["status"],
        "title": verdict.get("title"),
        "measured": verdict.get("measured"),
        "limit": verdict.get("limit"),
        "citations": verdict["citations"],
    }


def _allowed_numbers(*facts: Any) -> list[str]:
    """Numbers present in the engine facts / register payload - never in the answer.

    Numbers are collected structurally, not from the serialized answer: raw values are
    normalized to the same two-decimal display form the prose uses (``2.0`` -> ``2``,
    ``4.186`` -> ``4.19``), and strings contribute the numbers they spell. This keeps
    the verification meaningful: an invented number cannot whitelist itself.
    """
    found: set[str] = set()

    def walk(value: Any) -> None:
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float)):
            found.add(units.format_number(value, 2))
        elif isinstance(value, str):
            found.update(numbers_in(value))
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)
        elif isinstance(value, (list, tuple)):
            for item in value:
                walk(item)

    for fact in facts:
        walk(fact)
    return sorted(found)


def _explain_system(verdict: dict[str, Any]) -> str:
    facts = _explain_facts(verdict)
    return (
        f"{prompts.SYSTEM}\n\n{prompts.TASK_INSTRUCTION['rule.explain']}\n\n"
        f"Check result: {json.dumps(facts, ensure_ascii=False, sort_keys=True, separators=(',', ':'))}"
    )


def build_explain_records(verdict_set: dict[str, Any]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for verdict in verdict_set["verdicts"]:
        measured_obj = verdict.get("measured") or {}
        if "value" not in measured_obj:
            raise GeneratorError(f"verdict {verdict['ruleRef']} has no measured value to narrate")
        entity = verdict["ruleRef"].split("#", 1)[1]
        key = _key_of(measured_obj.get("path") or "norow")
        for lang in ("bn", "en"):
            title = verdict["title"][lang]
            citations = ", ".join(verdict["citations"])
            requirement = _req_text(verdict.get("limit") or {}, lang)
            measured = _fmt_amount(measured_obj.get("value"), measured_obj.get("unit"), lang)
            answer = _EXPLAIN_TEMPLATE[verdict["status"]][lang].format(
                title=title, measured=measured, requirement=requirement, citations=citations
            )
            records.append(
                {
                    "schemaVersion": "0.1.0",
                    "id": make_id("chat", "explain", entity, key, verdict["status"], lang),
                    "kind": "chat",
                    "task": "rule.explain",
                    "lang": lang,
                    "messages": [
                        {"role": "system", "content": _explain_system(verdict)},
                        {
                            "role": "user",
                            "content": prompts.USER_INSTRUCTION["rule.explain"][lang].format(
                                rule_ref=verdict["ruleRef"]
                            ),
                        },
                        {"role": "assistant", "content": answer},
                    ],
                    "labels": {
                        "ruleRef": verdict["ruleRef"],
                        "status": verdict["status"],
                        "citations": list(verdict["citations"]),
                        "allowedNumbers": _allowed_numbers(_explain_facts(verdict)),
                    },
                    "input": {
                        "generator": GENERATOR_VERSION,
                        "ruleRef": verdict["ruleRef"],
                        "status": verdict["status"],
                        "measuredPath": (verdict.get("measured") or {}).get("path"),
                        "specRef": "new-project+full-inputs",
                    },
                    "source": {"kind": "scripted", "promptVersion": prompts.PROMPT_VERSION},
                    "difficulty": "clean",
                    "status": "verified",
                    "verifyChecks": ["schema", "citations", "numbers", "language"],
                }
            )
    return records


def build_override_records(spec: dict[str, Any], verdict_set: dict[str, Any]) -> list[dict[str, Any]]:
    ops = register_ops(spec, verdict_set, at=AT)
    entries: list[dict[str, Any]] = []
    for op in ops:
        value = op.get("value")
        if op["op"] == "add" and isinstance(value, list):
            entries.extend(value)
        elif isinstance(value, dict):
            entries.append(value)
    records: list[dict[str, Any]] = []
    for verdict in verdict_set["verdicts"]:
        if verdict["status"] != "deviation":
            continue
        measured = verdict.get("measured") or {}
        if "value" not in measured:
            raise GeneratorError(f"deviation {verdict['ruleRef']} has no measured value")
        key = _key_of(measured.get("path") or "norow")
        matches = [item for item in entries if item["id"].endswith(key.lower())]
        if len(matches) != 1 or key not in _INTENT:
            raise GeneratorError(
                f"expected one register entry/intent template for deviation on {key!r}, "
                f"found {len(matches)}"
            )
        entry = matches[0]
        subset = {name: entry[name] for name in ("id", "ruleRef", "ruleTitle", "expected", "actual", "riskTier")}
        register_json = json.dumps({"register": subset}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        raw = resolve(spec, measured["path"])
        entity = verdict["ruleRef"].split("#", 1)[1]
        for lang in ("bn", "en"):
            intent_en = _INTENT[key]["en"].format(v=units.format_number(raw, 2))
            intent_bn = _INTENT[key]["bn"].format(v=mutations.bn_digits(units.format_number(raw, 2)))
            advisory = _OVERRIDE_ADVISORY[lang].format(
                title=verdict["title"][lang],
                requirement=_req_text(verdict.get("limit") or {}, lang),
                measured=_fmt_amount(measured.get("value"), measured.get("unit"), lang),
                citations=", ".join(verdict["citations"]),
            )
            done = _OVERRIDE_DONE[lang].format(id=entry["id"], register=register_json)
            allowed = _allowed_numbers(_explain_facts(verdict), subset)
            records.append(
                {
                    "schemaVersion": "0.1.0",
                    "id": make_id("chat", "override", entity, key, lang),
                    "kind": "chat",
                    "task": "deviation.override",
                    "lang": lang,
                    "messages": [
                        {"role": "system", "content": _explain_system(verdict) + "\n" + prompts.TASK_INSTRUCTION["deviation.override"]},
                        {"role": "user", "content": intent_bn if lang == "bn" else intent_en},
                        {"role": "assistant", "content": advisory},
                        {"role": "user", "content": prompts.CONFIRM_LINE[lang]},
                        {"role": "assistant", "content": done},
                    ],
                    "labels": {
                        "ruleRef": verdict["ruleRef"],
                        "status": "deviation",
                        "citations": list(verdict["citations"]),
                        "allowedNumbers": allowed,
                        "registerEntry": subset,
                        "specPatch": (verdict.get("alternative") or {}).get("specPatch"),
                    },
                    "input": {
                        "generator": GENERATOR_VERSION,
                        "ruleRef": verdict["ruleRef"],
                        "registerId": entry["id"],
                        "measuredPath": measured.get("path"),
                        "specRef": "new-project+full-inputs",
                    },
                    "source": {"kind": "scripted", "promptVersion": prompts.PROMPT_VERSION},
                    "difficulty": "clean",
                    "status": "verified",
                    "verifyChecks": ["schema", "citations", "numbers", "register", "language"],
                }
            )
    return records


# -------------------------------------------------------------------- dataset


@dataclass
class Dataset:
    records: list[dict[str, Any]]
    pins: dict[str, Any]
    counts: dict[str, Any]
    coverage: dict[str, Any]

    def by_task(self, task: str) -> list[dict[str, Any]]:
        return [record for record in self.records if record["task"] == task]


def counts_of(records: list[dict[str, Any]]) -> dict[str, Any]:
    def counter(key) -> dict[str, int]:
        out: dict[str, int] = {}
        for record in records:
            value = key(record)
            if value is None:
                continue
            out[str(value)] = out.get(str(value), 0) + 1
        return out

    return {
        "total": len(records),
        "byTask": counter(lambda r: r["task"]),
        "byLang": counter(lambda r: r["lang"]),
        "byDifficulty": counter(lambda r: r["difficulty"]),
        "byStatus": counter(lambda r: r["status"]),
        "byDecision": counter(lambda r: (r["labels"] or {}).get("decision") if r["task"] == "interview.parse" else None),
        "byOperator": counter(lambda r: (r["input"] or {}).get("operator")),
        "byPhase": counter(lambda r: (r["input"] or {}).get("phaseId")),
    }


def build_chat_dataset(
    *,
    flow_book_path: str | pathlib.Path,
    pack_path: str | pathlib.Path,
    examples_dir: str | pathlib.Path,
    sft_schema_path: str | pathlib.Path,
    building_spec_schema_path: str | pathlib.Path | None = None,
) -> Dataset:
    """Build + verify the scripted chat dataset; raises on any failing record."""
    schema = json.loads(pathlib.Path(sft_schema_path).read_text(encoding="utf-8"))
    questions = load_flow_book(flow_book_path)
    values = example_values(questions, examples_dir)
    spec, pack, verdict_set = _compliance_context(pack_path, examples_dir)
    context = VerifyContext(
        questions={question.id: question_dict(question) for question in questions},
        pack=pack,
        spec=spec,
        verdict_set=verdict_set,
    )
    records = (
        build_ask_records(questions)
        + build_parse_records(questions, values)
        + build_explain_records(verdict_set)
        + build_override_records(spec, verdict_set)
    )
    id_counts: dict[str, int] = {}
    for record in records:
        id_counts[record["id"]] = id_counts.get(record["id"], 0) + 1
    duplicates = sorted(record_id for record_id, count in id_counts.items() if count > 1)
    if duplicates:
        raise GeneratorError(f"duplicate record ids: {duplicates[:10]}")
    failure_report: list[str] = []
    for record in records:
        ok, _checks, failures = verify_record(record, schema, context)
        if not ok:
            failure_report.extend(f"{record['id']}: {failure}" for failure in failures)
    if failure_report:
        raise GeneratorError("generated records failed verification:\n" + "\n".join(failure_report))
    pins = {
        "generatorVersion": GENERATOR_VERSION,
        "promptVersion": prompts.PROMPT_VERSION,
        "flowBookSha256": sha256_file(flow_book_path),
        "rulePackSha256": pack_sha256(pack_path),
        "sftSchemaSha256": sha256_file(sft_schema_path),
    }
    if building_spec_schema_path is not None:
        pins["buildingSpecSchemaSha256"] = sha256_file(building_spec_schema_path)
    directory = pathlib.Path(examples_dir)
    pins["examplesSha256"] = {
        path.stem: sha256_file(path) for path in sorted(directory.glob("*.json"))
    }
    parse_questions = {
        record["labels"].get("questionId")
        for record in records
        if record["task"] == "interview.parse"
    }
    coverage = {
        "askQuestions": len(questions),
        "parseQuestions": len(parse_questions),
        "questionsWithoutParse": [
            question.id for question in questions if question.id not in parse_questions
        ],
    }
    return Dataset(records=records, pins=pins, counts=counts_of(records), coverage=coverage)


def _pick(records: list[dict[str, Any]], predicate, picked: list[dict[str, Any]]) -> None:
    taken = {record["id"] for record in picked}
    for record in sorted(records, key=record_sort_key):
        if record["id"] in taken:
            continue
        if predicate(record):
            picked.append(record)
            return
    raise GeneratorError("sample picker found no match")


def sample_records(dataset: Dataset) -> list[dict[str, Any]]:
    """The committed golden slice: one record per task/shape the pipeline produces."""
    records = dataset.records
    picked: list[dict[str, Any]] = []

    def q(record: dict[str, Any]) -> str:
        return record["labels"].get("questionId", "")

    def op(record: dict[str, Any]) -> str:
        return record["input"].get("operator", "")

    _pick(records, lambda r: r["task"] == "interview.ask" and r["lang"] == "bn" and r["input"]["phaseId"] == "setup", picked)
    _pick(records, lambda r: r["task"] == "interview.ask" and r["lang"] == "en" and r["input"]["phaseId"] == "foundation", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and q(r) == "plot-area" and r["difficulty"] == "clean" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and q(r) == "plot-area" and r["difficulty"] == "clean" and r["lang"] == "bn", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and q(r) == "plot-area" and op(r) == "unit_alt" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "dont_know" and r["labels"].get("decision") == "ask_again" and r["lang"] == "bn", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "dont_know" and r["labels"].get("decision") == "fallback" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "partial" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "as_given" and r["lang"] == "bn", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "banglish" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "off_topic" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "interview.parse" and op(r) == "omit_unit" and r["lang"] == "bn", picked)
    _pick(records, lambda r: r["task"] == "rule.explain" and r["labels"]["status"] == "deviation" and r["lang"] == "bn", picked)
    _pick(records, lambda r: r["task"] == "rule.explain" and r["labels"]["status"] == "deviation" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "rule.explain" and r["labels"]["status"] == "compliant" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "deviation.override" and r["lang"] == "en", picked)
    _pick(records, lambda r: r["task"] == "deviation.override" and r["lang"] == "bn", picked)
    return picked
