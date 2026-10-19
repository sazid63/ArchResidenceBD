"""Deterministic verification (W1.5) - the gate between a record and training.

Quality law: *unverified content is a candidate*. Every record therefore runs through
checks that read only machine-checkable ground truth (labels, the pack, the rule engine,
the mutation bookkeeping) - never the prose:

- ``schema``      - the SFT-record contract.
- ``labels``      - labels consistent with the flow book (question, pointer, option,
  fallback kind).
- ``language``    - the human-readable turn follows the record's language convention.
  For ``interview.parse`` that turn is the user's message (the answer may legitimately
  contain an English proper noun or Bangla digits); for narration tasks it is the
  assistant's answer. Bengali digits are script-neutral for this check.
- ``ask.text``    - the question asked is the hand-authored flow-book question.
  Teacher paraphrases are deliberately exempt (they are candidates for review).
- ``parse.clean`` - the label value equals the generator's base value/unit.
- ``parse.mutation`` - the user's sloppy text is exactly what the recorded operator +
  seed produces, and the label decision/value matches that operator's contract.
- ``numbers``     - every number in an explain/override answer is in ``allowedNumbers``
  (no invented numbers - the law that keeps the model honest about regulations).
  ``allowedNumbers`` is computed from the engine facts, never from the answer.
- ``citations``   - citations resolve against the pinned pack and appear in the answer.
- ``register``    - the register JSON in an override answer matches the engine's
  ``register_ops`` entry (the same entry the app would record).

Scripted records are generated + verified at build time (and byte-compared in tests);
teacher records are candidates until these checks pass and a later eval/human gate
promotes them (W1.6). Verification never raises on invalid content - it reports.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable

from . import mutations
from .records import RecordError, validate_record

#: Bengali letters only. Bengali digits (U+09E6-U+09EF) are excluded on purpose:
#: "৪" in an English sentence is a numeral, not a change of language.
BN_LETTERS = re.compile(r"[\u0980-\u09E5\u09F0-\u09FF]")
LATIN_LETTERS = re.compile(r"[A-Za-z]")
NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")
_BN_TO_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def numbers_in(text: str) -> list[str]:
    """Every number in the text, normalized to ASCII, unique and sorted."""
    return sorted({match.group(0) for match in NUMBER_RE.finditer(text.translate(_BN_TO_ASCII))})


@dataclass
class VerifyContext:
    """Everything verification may consult (all from frozen artifacts)."""

    questions: dict[str, dict[str, Any]] = field(default_factory=dict)
    pack: dict[str, Any] | None = None
    spec: dict[str, Any] | None = None
    verdict_set: dict[str, Any] | None = None


def _assistant_messages(record: dict[str, Any]) -> list[str]:
    return [message["content"] for message in record["messages"] if message["role"] == "assistant"]


def _language_text(record: dict[str, Any]) -> str:
    """The human-readable turn whose language the record promises."""
    if record["task"] == "interview.parse":
        return record["messages"][1]["content"]
    return _assistant_messages(record)[-1]


def _register_payload(text: str) -> dict[str, Any] | None:
    """The last parseable JSON object carrying a 'register' key in the text."""
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            payload = json.loads(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and "register" in payload:
            return payload["register"]
    return None


def verify_record(
    record: dict[str, Any], schema: dict[str, Any], context: VerifyContext | None = None
) -> tuple[bool, list[str], list[str]]:
    """Run every applicable check; returns (ok, checks_run, failures)."""
    context = context or VerifyContext()
    checks: list[str] = []
    failures: list[str] = []

    def check(name: str, fn: Callable[[], None]) -> None:
        checks.append(name)
        try:
            fn()
        except AssertionError as exc:
            failures.append(f"{name}: {exc}")

    # Schema first: if the record is structurally invalid, later checks cannot be
    # trusted (and may raise on missing keys). Report it, never escape.
    checks.append("schema")
    try:
        validate_record(record, schema)
    except RecordError as exc:
        return False, checks, [f"schema: {exc}"]

    question = context.questions.get(record["labels"].get("questionId", ""))
    task = record["task"]
    labels = record["labels"]

    if question is not None:

        def labels_ok() -> None:
            assert labels.get("pointer", question["maps_to"]) == question["maps_to"], "pointer mismatch"
            if task == "interview.ask":
                assert labels.get("phaseId") == question["phase_id"], "phase mismatch"
                assert labels.get("mapsTo") == question["maps_to"], "mapsTo mismatch"
            if task == "interview.parse":
                decision = labels["decision"]
                assert decision in ("accept", "ask_again", "fallback", "escalate")
                if decision == "accept" and question["type"] == "choice":
                    option_ids = {option["value"] for option in question["options"]}
                    assert labels["value"] in option_ids, f"unknown option {labels['value']!r}"
                if decision == "fallback":
                    fallback = question.get("fallback") or {}
                    assert labels.get("fallbackKind") == fallback.get("kind"), "fallback kind mismatch"

        check("labels", labels_ok)

    def language_ok() -> None:
        text = _language_text(record)
        has_bn = bool(BN_LETTERS.search(text))
        if record["lang"] == "bn":
            assert has_bn, "bn record without Bengali letters in its human-readable text"
        elif record["lang"] == "en":
            assert not has_bn, "en record with Bengali letters in its human-readable text"
        else:  # mixed: both scripts are expected somewhere in the human-readable text
            assert has_bn, "mixed record without Bengali letters"
            assert LATIN_LETTERS.search(text), "mixed record without Latin letters"

    check("language", language_ok)

    if task == "interview.ask" and question is not None:
        if record.get("source", {}).get("kind") != "teacher":

            def ask_text() -> None:
                assert _assistant_messages(record)[-1] == question["ask"][record["lang"]], (
                    "not the flow-book question"
                )

            check("ask.text", ask_text)
        else:

            def teacher_shape() -> None:
                text = _assistant_messages(record)[-1].strip()
                assert text, "teacher returned an empty question"
                assert text.count("?") == 1, (
                    "teacher paraphrase must ask exactly one question (one question mark)"
                )
                assert not text.startswith(("Question:", "প্রশ্ন:")), (
                    "teacher echoed the editor instruction"
                )
                assert not text.startswith(("{", "[", '"')), (
                    "teacher paraphrase looks like JSON/quotes"
                )
                try:
                    json.loads(text)
                except json.JSONDecodeError:
                    pass
                else:
                    raise AssertionError("teacher paraphrase is a JSON value")

            check("teacher.shape", teacher_shape)

    if task == "interview.parse" and question is not None:
        data = record["input"]

        def parse_clean() -> None:
            assert labels["value"] == data["base"], "label value differs from base"
            if data.get("baseUnit"):
                assert labels.get("unit") == data["baseUnit"], "label unit differs from base"

        def parse_mutation() -> None:
            result = mutations.apply_operator(
                data["operator"],
                question=question,
                base=data["baseAnswer"],
                lang=record["lang"],
                seed=data["mutationSeed"],
                unit_target=data.get("unitTarget"),
            )
            assert result["text"] == data["answerText"], "mutated text is not reproducible"
            assert data["answerText"] in record["messages"][1]["content"], "answer not in the user turn"
            assert labels["decision"] == result["decision"], "decision differs from the operator contract"
            if result["decision"] == "accept":
                expected_value = result["value"]
                if expected_value is None:
                    expected_value = result["detail"].get("canonical")
                if expected_value is None:
                    expected_value = result["detail"].get(
                        "asGiven",
                        result["detail"].get("trimmed", result["detail"].get("option", data["base"])),
                    )
                assert labels["value"] == expected_value, f"value {labels['value']!r} != {expected_value!r}"

        if record["difficulty"] == "clean":
            check("parse.clean", parse_clean)
        else:
            check("parse.mutation", parse_mutation)

    if task in ("rule.explain", "deviation.override"):
        answers = _assistant_messages(record)

        def citations_ok() -> None:
            pack = context.pack or {}
            known = pack.get("citations") or {}
            if known:
                for citation in labels["citations"]:
                    assert citation in known, f"citation {citation!r} not in the pack"
            joined = "\n".join(answers)
            for citation in labels["citations"]:
                assert citation in joined, f"citation {citation!r} missing from the answer"

        def numbers_ok() -> None:
            allowed = set(labels["allowedNumbers"])
            for answer in answers:
                invented = [value for value in numbers_in(answer) if value not in allowed]
                assert not invented, f"invented numbers: {invented}"

        check("citations", citations_ok)
        check("numbers", numbers_ok)

    if task == "deviation.override":

        def register_ok() -> None:
            payload = _register_payload(_assistant_messages(record)[-1])
            assert payload is not None, "no register JSON in the final answer"
            assert payload == labels["registerEntry"], "register block differs from labels"
            if context.spec is not None and context.verdict_set is not None:
                from ..compliance import register_ops

                ops = register_ops(context.spec, context.verdict_set, at="2026-10-18T10:02:00+06:00")
                entries = [
                    op["value"]
                    for op in ops
                    if op["op"] in ("add", "replace") and isinstance(op.get("value"), dict)
                ]
                for op in ops:
                    if op["op"] == "add" and isinstance(op.get("value"), list):
                        entries.extend(op["value"])
                match = next(
                    (entry for entry in entries if entry.get("id") == labels["registerEntry"]["id"]), None
                )
                assert match is not None, "register entry not produced by the engine"
                for key, want in labels["registerEntry"].items():
                    assert match.get(key) == want, f"engine {key} differs: {match.get(key)!r} != {want!r}"

        check("register", register_ok)

    return (not failures, checks, failures)
