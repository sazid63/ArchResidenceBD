"""SFT train/holdout split (W1.6 preparation): follow the frozen eval split by source id.

The eval harness froze its split **before** any teacher paraphrase existed, by hashed source
question id (ADR-0015). The SFT split must be the same cut, or a question's paraphrase can be
trained on the variant the eval measures. This module is the rule, in one place:

* a record whose source question is a holdout question goes to ``holdout.jsonl``;
* every other verified chat record goes to ``train.jsonl``;
* explain/override records carry no source question (they are about a rule or a deviation, not
  an interview answer) and go to train;
* a question the eval does not measure is **declared** in the manifest rather than hidden. It
  cannot contaminate a holdout it is not part of, and dropping it would shrink training for no
  protection;
* any other record - unverified, non-chat, duplicate or without a source question where one is
  required - is an error. A split that silently drops such a record would hide exactly the
  content the eval is supposed to measure.
"""

from __future__ import annotations

import collections
from dataclasses import dataclass, field
from typing import Any, Iterable

SPLITTER_VERSION = "0.1.0"

#: Tasks that are not tied to one interview question; their inputs are rule/spec facts.
NO_SOURCE_TASKS = ("rule.explain", "deviation.override")


class SplitError(ValueError):
    """A record (or the split file) that cannot be used for a trustworthy SFT split."""


@dataclass(frozen=True)
class SftSplit:
    """The two sides plus the numbers a manifest records."""

    train: list[dict[str, Any]] = field(default_factory=list)
    holdout: list[dict[str, Any]] = field(default_factory=list)
    by_task: dict[str, dict[str, int]] = field(default_factory=dict)
    questions: dict[str, int] = field(default_factory=dict)
    unmeasured: list[str] = field(default_factory=list)
    no_source: int = 0

    @property
    def total(self) -> int:
        return len(self.train) + len(self.holdout)

    def counts(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "train": len(self.train),
            "holdout": len(self.holdout),
            "byTask": {side: dict(sorted(counts.items())) for side, counts in self.by_task.items()},
            "questions": dict(sorted(self.questions.items())),
            "unmeasuredQuestions": len(self.unmeasured),
            "unmeasured": sorted(self.unmeasured),
            "noSource": self.no_source,
        }


def source_question_id(record: dict[str, Any]) -> str | None:
    """The question a record is derived from, or ``None`` for rule/override records."""
    labels = record.get("labels") or {}
    for source in (labels, record.get("input") or {}):
        value = source.get("questionId")
        if value is not None:
            return str(value).strip() or None
    return None


def _split_sides(split: dict[str, Any]) -> tuple[set[str], set[str]]:
    questions = split.get("questions")
    if not isinstance(questions, dict) or not {"train", "holdout"} <= set(questions):
        raise SplitError("split.questions must hold 'train' and 'holdout' lists")
    train = questions["train"]
    holdout = questions["holdout"]
    if not isinstance(train, list) or not isinstance(holdout, list):
        raise SplitError("split.questions.train/holdout must be lists of question ids")
    train_ids = {str(item) for item in train}
    holdout_ids = {str(item) for item in holdout}
    if not train_ids or not holdout_ids:
        raise SplitError("both sides of the frozen split must be non-empty")
    overlap = train_ids & holdout_ids
    if overlap:
        raise SplitError(f"questions on both sides of the frozen split: {sorted(overlap)}")
    return train_ids, holdout_ids


def split_sft_records(records: Iterable[dict[str, Any]], split: dict[str, Any]) -> SftSplit:
    """Partition verified chat records by the frozen split; order is the input order."""
    train_ids, holdout_ids = _split_sides(split)
    train: list[dict[str, Any]] = []
    holdout: list[dict[str, Any]] = []
    by_task: dict[str, dict[str, int]] = {"train": collections.Counter(), "holdout": collections.Counter()}
    seen: set[str] = set()
    no_source = 0
    questions: set[str] = set()
    unmeasured: set[str] = set()

    for record in records:
        record_id = str(record.get("id") or "")
        if not record_id:
            raise SplitError("a record has no id")
        if record_id in seen:
            raise SplitError(f"duplicate record id {record_id!r}")
        seen.add(record_id)
        if record.get("kind") != "chat":
            raise SplitError(f"{record_id}: kind is {record.get('kind')!r}, expected 'chat'")
        if record.get("status") != "verified":
            raise SplitError(
                f"{record_id}: status is {record.get('status')!r}; unverified content is a candidate, "
                "never training data"
            )
        task = str(record.get("task") or "")
        question_id = source_question_id(record)
        if question_id is None:
            if task not in NO_SOURCE_TASKS:
                raise SplitError(
                    f"{record_id}: task {task!r} has no source question id, so its eval side is unknown"
                )
            no_source += 1
            train.append(record)
            by_task["train"][task] += 1
            continue
        questions.add(question_id)
        if question_id in holdout_ids:
            holdout.append(record)
            by_task["holdout"][task] += 1
        else:
            if question_id not in train_ids:
                unmeasured.add(question_id)
            train.append(record)
            by_task["train"][task] += 1

    if not train or not holdout:
        raise SplitError("both sides of the SFT split must be non-empty")
    return SftSplit(
        train=train,
        holdout=holdout,
        by_task={side: dict(counts) for side, counts in by_task.items()},
        questions={
            "train": len(questions & train_ids),
            "holdout": len(questions & holdout_ids),
        },
        unmeasured=sorted(unmeasured),
        no_source=no_source,
    )
