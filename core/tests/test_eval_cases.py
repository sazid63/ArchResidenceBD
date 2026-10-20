"""Eval case model + frozen split (W1.9).

The split is the part that must never drift: a case that silently moves from ``train`` to
``holdout`` (or the reverse) makes every later score incomparable, so the rule is pinned by
recomputation, not by reading the document back.
"""

from __future__ import annotations

import hashlib
import json
import pathlib

import pytest

from archres_core.eval import (
    SPLIT_SEED,
    SPLIT_THRESHOLD,
    SUITES,
    EvalCase,
    EvalError,
    assign_split,
    cases_bytes,
    cases_text,
    check_split,
    dumps_split,
    load_cases,
    load_split,
    split_bucket,
    split_document,
)
from archres_core.eval.cases import SPLIT_SCHEMA_VERSION

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "data" / "eval" / "chat-v0" / "cases.jsonl"
SPLIT = ROOT / "data" / "eval" / "chat-v0" / "split.json"


def _case(**overrides) -> EvalCase:
    payload = {
        "id": "parse:one",
        "suite": "parse",
        "lang": "en",
        "split": "train",
        "source": {"kind": "dataset", "recordId": "chat-parse-one"},
        "input": {"questionId": "area-name", "answerText": "Dhanmondi"},
        "expect": {"decision": "accept", "value": "Dhanmondi"},
    }
    payload.update(overrides)
    return EvalCase(**payload)


# ------------------------------------------------------------------- the split rule


def test_split_rule_is_recomputable_from_the_documented_recipe() -> None:
    key = "area-name"
    digest = hashlib.sha256(f"{SPLIT_SEED}:{key}".encode("utf-8")).digest()
    expected = "holdout" if digest[0] < SPLIT_THRESHOLD else "train"
    assert split_bucket(key) == expected


def test_split_rule_is_stable_across_calls_and_seeds_shift_it() -> None:
    assert split_bucket("plot-area") == split_bucket("plot-area")
    bucket = split_bucket("plot-area")
    shifted = {split_bucket(key, seed=1) for key in ("plot-area", "road-width", "storeys-count")}
    assert bucket in ("train", "holdout")
    assert shifted <= {"train", "holdout"}


def test_split_document_is_sorted_and_partitions_every_question() -> None:
    questions = ["z-last", "a-first", "m-middle"]
    document = split_document(questions, ["dhaka-house-bn"])
    assert document["schemaVersion"] == SPLIT_SCHEMA_VERSION
    assert document["seed"] == SPLIT_SEED
    assert document["threshold"] == SPLIT_THRESHOLD
    holdout = document["questions"]["holdout"]
    train = document["questions"]["train"]
    assert holdout == sorted(holdout) and train == sorted(train)
    assert sorted(holdout + train) == sorted(questions)
    assert not set(holdout) & set(train)
    assert document["scenarios"]["holdout"] == ["dhaka-house-bn"]
    assert "holdout" in document["rule"] and str(SPLIT_THRESHOLD) in document["rule"]


def test_split_document_needs_at_least_one_question() -> None:
    with pytest.raises(EvalError):
        split_document([], ["dhaka-house-bn"])


def test_split_round_trips_through_json(tmp_path) -> None:
    document = split_document(["area-name", "plot-area"], ["dhaka-house-en"])
    path = tmp_path / "split.json"
    path.write_text(dumps_split(document), encoding="utf-8")
    assert load_split(path) == document
    assert dumps_split(document).endswith("\n")


def test_split_document_rejects_a_broken_file(tmp_path) -> None:
    path = tmp_path / "split.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(EvalError, match="not valid JSON"):
        load_split(path)
    path.write_text(json.dumps({"schemaVersion": "9.9"}), encoding="utf-8")
    with pytest.raises(EvalError, match="schemaVersion"):
        load_split(path)
    path.write_text(json.dumps({"schemaVersion": SPLIT_SCHEMA_VERSION}), encoding="utf-8")
    with pytest.raises(EvalError, match="questions"):
        load_split(path)
    with pytest.raises(EvalError, match="not found"):
        load_split(tmp_path / "missing.json")


def test_split_document_rejects_a_question_on_both_sides(tmp_path) -> None:
    document = split_document(["area-name"], ["dhaka-house-bn"])
    document["questions"]["train"] = list(document["questions"]["holdout"])
    path = tmp_path / "split.json"
    path.write_text(dumps_split(document), encoding="utf-8")
    with pytest.raises(EvalError, match="both"):
        load_split(path)


# --------------------------------------------------------------- assigning a case


@pytest.mark.parametrize("suite", ["parse", "model.parse"])
def test_question_suites_follow_the_question_split(suite: str) -> None:
    document = split_document(["area-name"], [])
    case = _case(suite=suite, split=split_bucket("area-name"))
    assert assign_split(case, document) == split_bucket("area-name")


def test_a_question_outside_the_frozen_split_fails_loudly() -> None:
    document = split_document(["area-name"], [])
    case = _case(input={"questionId": "brand-new-question", "answerText": "x"})
    with pytest.raises(EvalError, match="neither side"):
        assign_split(case, document)


def test_engine_suites_are_engine_and_rag_is_always_holdout() -> None:
    document = split_document(["area-name"], ["dhaka-house-bn"])
    for suite in ("rule.vector", "register"):
        assert assign_split(_case(suite=suite, expect=_expect(suite)), document) == "engine"
    rag = _case(suite="rag", lang="en", input={"query": "setback?"}, expect=_expect("rag"))
    assert assign_split(rag, document) == "holdout"


def _expect(suite: str) -> dict:
    return {
        "rule.vector": {"ok": True},
        "register": {
            "ruleRef": "rajuk@2008.1#far-tables",
            "pointer": "/phases/0/data/plannedTotalFloorAreaSqm",
            "restoreValue": 1.0,
            "entryId": "dev-x",
            "remainingAfterRestore": [],
        },
        "rag": {"mode": "answer", "docId": "rajuk@2008.1:provision:s46-3-4:en"},
    }[suite]


def test_scenario_cases_follow_the_scenario_split() -> None:
    document = split_document(["area-name"], ["dhaka-house-bn"])
    expect = {
        "steps": 1,
        "coverage": 1,
        "openEssential": [],
        "decisions": {},
        "revision": 1,
    }
    known = _case(
        suite="scenario",
        lang="bn",
        expect=expect,
        input={"scenario": "tools/demo/scenarios/dhaka-house-bn.json"},
    )
    assert assign_split(known, document) == "holdout"
    unknown = _case(
        suite="scenario",
        lang="bn",
        expect=expect,
        input={"scenario": "tools/demo/scenarios/some-new-scenario.json"},
    )
    with pytest.raises(EvalError, match="neither side"):
        assign_split(unknown, document)


# ------------------------------------------------------------------ the case file


def test_case_file_is_sorted_lf_and_byte_stable() -> None:
    cases = [_case(id="parse:b"), _case(id="parse:a")]
    text = cases_text(cases)
    assert text == "".join(f"{line}\n" for line in sorted(text.splitlines()))
    assert "\r" not in text
    assert cases_bytes(cases) == cases_bytes(list(reversed(cases)))


def test_load_cases_rejects_a_duplicate_id(tmp_path) -> None:
    line = json.dumps(_case().to_dict(), ensure_ascii=False)
    path = tmp_path / "cases.jsonl"
    path.write_text(f"{line}\n{line}\n", encoding="utf-8")
    with pytest.raises(EvalError, match="duplicate case id"):
        load_cases(path)


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda raw: raw.pop("split"), "keys mismatch"),
        (lambda raw: raw.update(extra=1), "keys mismatch"),
        (lambda raw: raw.update(suite="nope"), "unknown suite"),
        (lambda raw: raw.update(lang="fr"), "lang must be"),
        (lambda raw: raw.update(split="test"), "split must be"),
        (lambda raw: raw["input"].pop("answerText"), "input is missing"),
        (lambda raw: raw["expect"].pop("decision"), "expect is missing"),
        (lambda raw: raw.update(source=[]), "source must be"),
    ],
)
def test_load_cases_rejects_a_broken_line(tmp_path, mutate, message) -> None:
    raw = _case().to_dict()
    mutate(raw)
    path = tmp_path / "cases.jsonl"
    path.write_text(json.dumps(raw, ensure_ascii=False) + "\n", encoding="utf-8")
    with pytest.raises(EvalError, match=message):
        load_cases(path)


def test_load_cases_rejects_an_empty_or_broken_file(tmp_path) -> None:
    path = tmp_path / "cases.jsonl"
    path.write_text("", encoding="utf-8")
    with pytest.raises(EvalError, match="no cases"):
        load_cases(path)
    path.write_text("{oops\n", encoding="utf-8")
    with pytest.raises(EvalError, match="not valid JSON"):
        load_cases(path)
    with pytest.raises(EvalError, match="not found"):
        load_cases(tmp_path / "missing.jsonl")


# ------------------------------------------------------------- the committed set


def test_the_committed_case_set_matches_the_frozen_split() -> None:
    cases = load_cases(CASES)
    split = load_split(SPLIT)
    assert check_split(cases, split) == []
    assert {case.suite for case in cases} == set(SUITES)


def test_the_committed_split_matches_its_document() -> None:
    split = load_split(SPLIT)
    on_disk = json.loads(SPLIT.read_text(encoding="utf-8"))
    assert split == on_disk
    assert dumps_split(split) == SPLIT.read_text(encoding="utf-8")


def test_check_split_reports_a_moved_case() -> None:
    cases = load_cases(CASES)
    split = load_split(SPLIT)
    moved = [
        case
        if case.suite != "parse"
        else EvalCase(
            id=case.id,
            suite=case.suite,
            lang=case.lang,
            split="holdout" if case.split == "train" else "train",
            source=case.source,
            input=case.input,
            expect=case.expect,
        )
        for case in cases
    ]
    problems = check_split(moved, split)
    assert problems and "split" in problems[0]
