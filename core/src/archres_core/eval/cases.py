"""Eval harness v0 (W1.9) — the case set, the frozen split, and the case file.

A case is a **claim about behaviour**: what the app must do, on which input, in which
language. Cases are data, because a score is only comparable across model rounds if the
questions are frozen. They live in ``data/eval/chat-v0/cases.jsonl``, are generated from
committed sources by ``tools/eval/build_cases.py``, are byte-stable, and are checked in CI.

Three laws from plan §9 shape this module:

- **No unverified pass.** A case that cannot be scored is an error, not a silent skip. The
  runner must account for every case in the file; ``coverage == 1.0`` is a gate of its own.
- **The split is frozen before training.** ``split == "holdout"`` cases are never trained on.
  The split is a committed document keyed by **source question id**, not a random draw at run
  time: a re-run must not be able to move a question across the line. ``engine`` cases test
  deterministic machinery (rules, register) and say so instead of pretending to measure
  generalisation.
- **A gap is data.** Expectations are ``mustInclude`` / exact values that were *observed to
  hold* and are pinned. A question the corpus cannot answer is listed as a coverage probe,
  not dressed up as a passing case.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from dataclasses import dataclass
from typing import Any, Iterable

HARNESS_VERSION = "eval-harness-0.1.0"
CASE_SCHEMA_VERSION = "0.1.0"
SPLIT_SCHEMA_VERSION = "0.1.0"

#: Suites the harness knows how to run. Order is the report order.
SUITES = (
    "rule.vector",
    "parse",
    "model.parse",
    "model.safety",
    "rag",
    "scenario",
    "register",
)

#: ``train`` / ``holdout`` are measured properties; ``engine`` is deterministic machinery.
SPLITS = ("train", "holdout", "engine")

LANGS = ("bn", "en", None)

CASE_KEYS = {"id", "suite", "lang", "split", "source", "input", "expect"}

#: The split rule, stated exactly so anyone can recompute it from the ids alone.
SPLIT_SEED = 20261020
SPLIT_THRESHOLD = 96  # first digest byte below 96 of 256 -> holdout (~37.5%)
SPLIT_RULE = (
    "holdout iff the first sha256 byte of the text 'seed:key' is below the threshold; "
    "key = question id (parse/model.parse) or scenario name (scenario); rag is always holdout"
)

#: Suite-specific required keys. Anything missing is a load error, never a skipped case.
REQUIRED_INPUT = {
    "rule.vector": {"vector"},
    "parse": {"questionId", "answerText"},
    "model.parse": {"questionId", "answerText"},
    "rag": {"query"},
    "scenario": {"scenario"},
    "register": {"spec", "ops"},
    "model.safety": {"questionId", "answerText"},
}

REQUIRED_EXPECT = {
    "rule.vector": {"ok"},
    "parse": {"decision", "value"},
    "model.parse": {"decision"},
    "model.safety": {"decision", "value"},
    "rag": {"mode", "docId"},
    "scenario": {"steps", "coverage", "openEssential", "decisions", "revision"},
    "register": {"ruleRef", "pointer", "restoreValue", "entryId", "remainingAfterRestore"},
}


class EvalError(RuntimeError):
    """The case set is unusable (bad shape, duplicate id, split drift)."""


@dataclass(frozen=True)
class EvalCase:
    """One scored claim about the app's behaviour."""

    id: str
    suite: str
    lang: str | None
    split: str
    source: dict[str, Any]
    input: dict[str, Any]
    expect: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "suite": self.suite,
            "lang": self.lang,
            "split": self.split,
            "source": self.source,
            "input": self.input,
            "expect": self.expect,
        }


def dumps_case(case: EvalCase) -> str:
    return json.dumps(case.to_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def cases_text(cases: Iterable[EvalCase]) -> str:
    """The canonical case file: one compact object per line, sorted by id, LF endings."""
    ordered = sorted(cases, key=lambda case: case.id)
    return "".join(f"{dumps_case(case)}\n" for case in ordered)


def cases_bytes(cases: Iterable[EvalCase]) -> bytes:
    return cases_text(cases).encode("utf-8")


def write_cases(cases: Iterable[EvalCase], path: str | pathlib.Path) -> dict[str, Any]:
    """Write the case JSONL; returns {path, cases, bytes, sha256}."""
    file = pathlib.Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    payload = cases_bytes(cases)
    file.write_bytes(payload)
    return {
        "path": str(file),
        "cases": payload.count(b"\n"),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def _check_case(raw: Any, line: int) -> EvalCase:
    where = f"case line {line}"
    if not isinstance(raw, dict):
        raise EvalError(f"{where}: not a JSON object")
    keys = set(raw)
    if keys != CASE_KEYS:
        missing = sorted(CASE_KEYS - keys)
        extra = sorted(keys - CASE_KEYS)
        raise EvalError(f"{where}: keys mismatch (missing={missing}, extra={extra})")
    case_id = raw["id"]
    if not isinstance(case_id, str) or not case_id.strip():
        raise EvalError(f"{where}: id must be a non-empty string")
    suite = raw["suite"]
    if suite not in SUITES:
        raise EvalError(f"{case_id}: unknown suite {suite!r} (known: {', '.join(SUITES)})")
    lang = raw["lang"]
    if lang not in LANGS:
        raise EvalError(f"{case_id}: lang must be 'bn', 'en' or null")
    if raw["split"] not in SPLITS:
        raise EvalError(f"{case_id}: split must be one of {', '.join(SPLITS)}")
    if not isinstance(raw["source"], dict):
        raise EvalError(f"{case_id}: source must be an object")
    for field in ("input", "expect"):
        value = raw[field]
        if not isinstance(value, dict):
            raise EvalError(f"{case_id}: {field} must be an object")
    missing_input = REQUIRED_INPUT[suite] - set(raw["input"])
    if missing_input:
        raise EvalError(f"{case_id}: input is missing {sorted(missing_input)}")
    missing_expect = REQUIRED_EXPECT[suite] - set(raw["expect"])
    if missing_expect:
        raise EvalError(f"{case_id}: expect is missing {sorted(missing_expect)}")
    return EvalCase(
        id=case_id,
        suite=suite,
        lang=lang,
        split=raw["split"],
        source=raw["source"],
        input=raw["input"],
        expect=raw["expect"],
    )


def load_cases(path: str | pathlib.Path) -> list[EvalCase]:
    """Read and validate the case file; a broken line is an error, never a skip."""
    file = pathlib.Path(path)
    if not file.is_file():
        raise EvalError(f"case file not found: {file}")
    cases: list[EvalCase] = []
    seen: dict[str, int] = {}
    for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            raw = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EvalError(f"case line {number}: not valid JSON: {exc}") from None
        case = _check_case(raw, number)
        if case.id in seen:
            raise EvalError(f"duplicate case id {case.id!r} (lines {seen[case.id]} and {number})")
        seen[case.id] = number
        cases.append(case)
    if not cases:
        raise EvalError(f"case file has no cases: {file}")
    return cases


# --------------------------------------------------------------------------- the split


def split_bucket(key: str, *, seed: int = SPLIT_SEED, threshold: int = SPLIT_THRESHOLD) -> str:
    """The frozen rule: a key is holdout when the first sha256 byte is below the threshold."""
    digest = hashlib.sha256(f"{seed}:{key}".encode("utf-8")).digest()
    return "holdout" if digest[0] < threshold else "train"


def split_document(
    question_ids: Iterable[str],
    scenario_names: Iterable[str],
    *,
    seed: int = SPLIT_SEED,
    threshold: int = SPLIT_THRESHOLD,
) -> dict[str, Any]:
    """Build the committed split document from the source keys (sorted, reproducible)."""
    questions = sorted(set(question_ids))
    scenarios = sorted(set(scenario_names))
    if not questions:
        raise EvalError("the split needs at least one source question id")
    holdout = [q for q in questions if split_bucket(q, seed=seed, threshold=threshold) == "holdout"]
    train = [q for q in questions if q not in set(holdout)]
    return {
        "schemaVersion": SPLIT_SCHEMA_VERSION,
        "seed": seed,
        "threshold": threshold,
        "rule": f"{SPLIT_RULE} (seed={seed}, threshold={threshold})",
        "questions": {"holdout": holdout, "train": train},
        # No scenario was ever used to train anything: both demo projects are holdout.
        "scenarios": {"holdout": scenarios, "train": []},
        "notes": (
            "Frozen before W1.6. Holdout cases are never trained on. Regenerating this file "
            "moves questions across the line and must be a reviewed event, not a re-run."
        ),
    }


def dumps_split(document: dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def load_split(path: str | pathlib.Path) -> dict[str, Any]:
    file = pathlib.Path(path)
    if not file.is_file():
        raise EvalError(f"split file not found: {file}")
    try:
        document = json.loads(file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise EvalError(f"split file is not valid JSON: {exc}") from None
    if not isinstance(document, dict) or document.get("schemaVersion") != SPLIT_SCHEMA_VERSION:
        raise EvalError("split file has an unexpected schemaVersion")
    for block in ("questions", "scenarios"):
        part = document.get(block)
        if not isinstance(part, dict):
            raise EvalError(f"split file is missing the {block!r} block")
        holdout = part.get("holdout")
        train = part.get("train")
        if not isinstance(holdout, list) or not isinstance(train, list):
            raise EvalError(f"split {block!r} must have holdout/train lists")
        overlap = set(holdout) & set(train)
        if overlap:
            raise EvalError(f"split {block!r} puts {sorted(overlap)} on both sides")
    return document


def assign_split(case: EvalCase, document: dict[str, Any]) -> str:
    """Which side of the frozen split a case belongs to (``engine`` for machinery)."""
    if case.suite == "rag":
        return "holdout"  # nothing about retrieval was trained on
    if case.suite in ("rule.vector", "register"):
        return "engine"
    if case.suite in ("parse", "model.parse", "model.safety"):
        key = case.input["questionId"]
        block = document["questions"]
        if key in block["holdout"]:
            return "holdout"
        if key in block["train"]:
            return "train"
        raise EvalError(f"{case.id}: question {key!r} is in neither side of the frozen split")
    if case.suite == "scenario":
        key = pathlib.Path(case.input["scenario"]).stem
        block = document["scenarios"]
        if key in block["holdout"]:
            return "holdout"
        if key in block["train"]:
            return "train"
        raise EvalError(f"{case.id}: scenario {key!r} is in neither side of the frozen split")
    raise EvalError(f"{case.id}: no split rule for suite {case.suite!r}")


def check_split(cases: Iterable[EvalCase], document: dict[str, Any]) -> list[str]:
    """Every case must agree with the frozen split; returns the disagreements."""
    problems: list[str] = []
    for case in cases:
        want = assign_split(case, document)
        if case.split != want:
            problems.append(f"{case.id}: split is {case.split!r}, frozen rule says {want!r}")
    return problems


def suite_counts(cases: Iterable[EvalCase]) -> dict[str, int]:
    counts = {suite: 0 for suite in SUITES}
    for case in cases:
        counts[case.suite] += 1
    return counts


def split_counts(cases: Iterable[EvalCase]) -> dict[str, int]:
    counts = {name: 0 for name in SPLITS}
    for case in cases:
        counts[case.split] += 1
    return counts


def load_jsonl(path: str | pathlib.Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
