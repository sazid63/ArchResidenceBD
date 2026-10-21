"""Rejection-sampling fine-tuning (W4.1): the fleet's own answers, verified, kept.

The RFT round is **sample -> verify -> keep** (the plan's W4.1). The fleet is asked the
scripted questions; each answer is checked against the scripted **truth** - the same labels
the generators wrote - and only the answers that agree become training data.

Why this and not the teacher: ADR-0024 parked the teacher (it only rephrased the questions
it was given). The scripted generator owns every number, citation and label, so the truth
the round verifies against is machine-checkable and never the model's opinion. The model is
allowed to contribute *phrasing* - and only where the phrase is right.

What is deterministic, and what is not:

- the **sampling** needs the local fleet (the model artifacts are not in the repo, so the
  owner runs the round) - the tests inject a scripted client, so no network is needed;
- the **verifying** is deterministic - it reads the scripted labels and the model's own
  JSON, never the prose;
- the **keeping** is deterministic - an answer that agrees with the truth is *verified*; one
  that does not is a **candidate**, and it is written down with the reason why. A dropped
  sample is evidence, not waste: the reason is what tells the next round what to fix.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from ..agent.client import (
    ModelClient,
    ModelError,
    ModelValueError,
    read_json_object,
)

#: The round's shape - bump when the ledger or the judging changes.
RFT_VERSION = "rft-round-v0.1"

#: The record kind the RFT records carry in their provenance.
SOURCE_KIND = "rft"

#: The tasks a round may sample. The parse task is the one the eval gates measure.
DEFAULT_TASKS = ("interview.parse",)

#: How close two numbers must be to count as the same number.
NUMBER_TOLERANCE = 1e-6


@dataclass(frozen=True)
class Sample:
    """One sampled answer, and what the truth said about it."""

    record_id: str
    attempt: int
    answer: str
    decision: str | None
    pointer: str | None
    value: Any
    kept: bool
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "recordId": self.record_id,
            "attempt": self.attempt,
            "answer": self.answer,
            "decision": self.decision,
            "pointer": self.pointer,
            "value": self.value,
            "kept": self.kept,
            "reason": self.reason,
        }


def _numeric(value: Any) -> float | None:
    """The number a value is, if it is one (a number, or a string that reads as one)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def same_value(expected: Any, actual: Any) -> bool:
    """Whether a model's value is the truth's value (numbers within a hair)."""
    if expected is None or actual is None:
        return expected == actual
    if isinstance(expected, bool) or isinstance(actual, bool):
        return expected == actual
    expected_number = _numeric(expected)
    actual_number = _numeric(actual)
    if expected_number is not None and actual_number is not None:
        scale = max(1.0, abs(expected_number))
        return abs(expected_number - actual_number) <= NUMBER_TOLERANCE * scale
    return expected == actual


def judge_answer(record: dict[str, Any], answer: str) -> tuple[dict[str, Any] | None, str]:
    """The model's answer read, and why it was kept or dropped.

    The check reads the **labels** (the scripted truth) and the model's own JSON - never the
    prose, and never the model's own opinion of what it meant.
    """
    try:
        value = read_json_object(answer)
    except ModelValueError as exc:
        return None, f"unreadable: {exc}"
    labels = record.get("labels") or {}
    for key in ("decision", "pointer", "value"):
        expected = labels.get(key)
        if expected is None:
            continue
        actual = value.get(key)
        if not same_value(expected, actual):
            return value, (
                f"differs: the {key} is {actual!r}, the scripted truth is {expected!r}"
            )
    return value, ""


def sample_round(
    client: ModelClient,
    records: Iterable[dict[str, Any]],
    *,
    samples: int = 4,
    temperature: float = 0.7,
    max_tokens: int = 256,
    tasks: Sequence[str] = DEFAULT_TASKS,
) -> list[Sample]:
    """Ask the fleet the scripted questions, and judge every answer.

    The model never sees the scripted answer - only the prompt (the system and the user
    turn) - and every answer is judged against the truth afterwards.
    """
    if samples < 1:
        raise ValueError("a round needs at least one sample per record")
    out: list[Sample] = []
    for record in records:
        if record.get("task") not in tasks:
            continue
        record_id = str(record.get("id") or "")
        prompt = [
            {"role": message.get("role", "user"), "content": message.get("content", "")}
            for message in record.get("messages") or []
            if message.get("role") in ("system", "user")
        ]
        for attempt in range(1, samples + 1):
            try:
                answer = client.complete(
                    prompt, max_tokens=max_tokens, temperature=temperature
                )
            except ModelError as exc:
                out.append(
                    Sample(
                        record_id=record_id,
                        attempt=attempt,
                        answer="",
                        decision=None,
                        pointer=None,
                        value=None,
                        kept=False,
                        reason=f"unreachable: {exc}",
                    )
                )
                continue
            value, reason = judge_answer(record, answer)
            out.append(
                Sample(
                    record_id=record_id,
                    attempt=attempt,
                    answer=answer,
                    decision=(value or {}).get("decision"),
                    pointer=(value or {}).get("pointer"),
                    value=(value or {}).get("value"),
                    kept=not reason,
                    reason=reason or "agrees with the scripted truth",
                )
            )
    return out


def build_rft_records(
    samples: Iterable[Sample],
    records: Iterable[dict[str, Any]],
    *,
    round_id: str,
    model: str,
) -> list[dict[str, Any]]:
    """The kept samples, as training records.

    The record keeps the scripted **question** and the labels (the truth) and takes the
    model's **own** answer for the assistant turn - that is the point of rejection
    sampling: the model learns from answers it can already produce.
    """
    by_id = {str(record.get("id") or ""): record for record in records}
    out: list[dict[str, Any]] = []
    for sample in samples:
        if not sample.kept:
            continue
        record = by_id.get(sample.record_id)
        if record is None:
            continue
        messages = [
            {"role": message.get("role", "user"), "content": message.get("content", "")}
            for message in record.get("messages") or []
        ]
        for index, message in enumerate(messages):
            if message.get("role") == "assistant":
                messages[index] = {"role": "assistant", "content": sample.answer}
                break
        out.append(
            {
                **record,
                "id": f"rft-{round_id}-{sample.record_id}-{sample.attempt}",
                "messages": messages,
                "source": {"kind": SOURCE_KIND, "batch": round_id, "model": model},
                "status": "verified",
                "verifyChecks": ["rft.truth"],
            }
        )
    return out


def round_document(
    samples: Sequence[Sample],
    *,
    round_id: str,
    model: str,
    temperature: float,
    samples_per_record: int,
) -> dict[str, Any]:
    """The round's ledger: what was sampled, what was kept, and why the rest was dropped.

    The dropped samples are in it on purpose - the reasons are what the next round reads.
    """
    kept = [sample for sample in samples if sample.kept]
    reasons: dict[str, int] = {}
    for sample in samples:
        if sample.kept:
            continue
        head = sample.reason.split(":", 1)[0]
        reasons[head] = reasons.get(head, 0) + 1
    return {
        "schemaVersion": "0.1.0",
        "version": RFT_VERSION,
        "round": round_id,
        "model": model,
        "temperature": temperature,
        "samplesPerRecord": samples_per_record,
        "counts": {
            "sampled": len(samples),
            "kept": len(kept),
            "dropped": len(samples) - len(kept),
            "records": len({sample.record_id for sample in samples}),
            "recordsWithAKeptSample": len({sample.record_id for sample in kept}),
        },
        "dropReasons": reasons,
        "samples": [sample.as_dict() for sample in samples],
    }


__all__ = [
    "DEFAULT_TASKS",
    "NUMBER_TOLERANCE",
    "RFT_VERSION",
    "SOURCE_KIND",
    "Sample",
    "build_rft_records",
    "judge_answer",
    "round_document",
    "same_value",
    "sample_round",
]
