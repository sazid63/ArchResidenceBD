"""SFT split (W1.6 preparation): the frozen eval holdout is never trained on.

The committed split is derived data, so these tests check the derivation law and the committed
bytes, not a hand-counted number: every verified record is on exactly one side, no holdout
question appears in train, questions the eval does not measure are declared, and the manifest's
hashes are true.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.training import (
    SplitError,
    load_jsonl,
    sha256_file,
    source_question_id,
    split_sft_records,
)
from archres_core.training.split import NO_SOURCE_TASKS

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATASET = ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl"
SPLIT = ROOT / "data" / "eval" / "chat-v0" / "split.json"
SFT = ROOT / "data" / "training" / "sft-v0"


@pytest.fixture(scope="module")
def frozen() -> dict:
    return json.loads(SPLIT.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def partition(frozen):
    return split_sft_records(load_jsonl(DATASET), frozen)


def _ids(records: list[dict]) -> set[str]:
    return {str(record["id"]) for record in records}


def _record(**overrides) -> dict:
    record = {
        "id": "chat-parse-a-bn",
        "kind": "chat",
        "status": "verified",
        "task": "interview.parse",
        "labels": {"questionId": "q1"},
    }
    record.update(overrides)
    return record


def _split(*, train=("q1",), holdout=("q2",)) -> dict:
    return {"questions": {"train": list(train), "holdout": list(holdout)}}


def test_every_record_lands_on_exactly_one_side(partition) -> None:
    dataset_ids = _ids(load_jsonl(DATASET))
    train_ids = _ids(partition.train)
    holdout_ids = _ids(partition.holdout)
    assert train_ids.isdisjoint(holdout_ids)
    assert train_ids | holdout_ids == dataset_ids
    assert partition.total == len(dataset_ids)


def test_no_holdout_question_is_trained_on(partition, frozen) -> None:
    holdout_questions = set(frozen["questions"]["holdout"])
    train_questions = {source_question_id(record) for record in partition.train}
    assert not (train_questions & holdout_questions)
    for record in partition.holdout:
        assert source_question_id(record) in holdout_questions


def test_every_dataset_record_from_a_holdout_question_is_on_the_holdout_side(
    partition, frozen
) -> None:
    holdout_questions = set(frozen["questions"]["holdout"])
    expected = {
        record["id"]
        for record in load_jsonl(DATASET)
        if source_question_id(record) in holdout_questions
    }
    assert _ids(partition.holdout) == expected


def test_rule_records_are_train_only(partition) -> None:
    for record in partition.holdout:
        assert record["task"] not in NO_SOURCE_TASKS
    no_source = [
        record for record in partition.train + partition.holdout if source_question_id(record) is None
    ]
    assert no_source
    assert {record["task"] for record in no_source} <= set(NO_SOURCE_TASKS)
    assert all(record in partition.train for record in no_source)
    assert partition.no_source == len(no_source)


def test_questions_the_eval_does_not_measure_are_declared(partition, frozen) -> None:
    measured = set(frozen["questions"]["train"]) | set(frozen["questions"]["holdout"])
    observed = {
        source_question_id(record)
        for record in load_jsonl(DATASET)
        if source_question_id(record) is not None
    }
    assert set(partition.unmeasured) == observed - measured
    assert partition.counts()["unmeasuredQuestions"] == len(partition.unmeasured)


def test_the_committed_files_hold_the_derived_partition(partition) -> None:
    train = load_jsonl(SFT / "train.jsonl")
    holdout = load_jsonl(SFT / "holdout.jsonl")
    assert _ids(train) == _ids(partition.train)
    assert _ids(holdout) == _ids(partition.holdout)
    assert len(train) == len(partition.train)
    assert len(holdout) == len(partition.holdout)


def test_the_committed_manifest_is_true(partition) -> None:
    manifest = json.loads((SFT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["counts"] == partition.counts()
    for name in ("train.jsonl", "holdout.jsonl"):
        entry = manifest["files"][name]
        path = SFT / name
        assert entry["sha256"] == sha256_file(path)
        assert entry["bytes"] == path.stat().st_size
        assert entry["records"] == len(load_jsonl(path))
    assert manifest["pins"]["dataset"]["sha256"] == sha256_file(DATASET)
    assert manifest["pins"]["evalSplit"]["sha256"] == sha256_file(SPLIT)


def _run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "cp1252"  # the Windows pipe is not UTF-8
    return subprocess.run(
        [sys.executable, str(ROOT / "tools" / "training" / "build_sft_split.py"), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
        env=env,
    )


def test_the_cli_check_is_fresh_on_a_cp1252_console() -> None:
    result = _run_cli("--check")
    assert result.returncode == 0, result.stderr
    assert "fresh" in result.stdout.lower()


def test_a_candidate_record_is_refused() -> None:
    with pytest.raises(SplitError, match="never training data"):
        split_sft_records([_record(status="candidate")], _split())


def test_a_non_chat_record_is_refused() -> None:
    with pytest.raises(SplitError, match="expected 'chat'"):
        split_sft_records([_record(kind="parse")], _split())


def test_a_duplicate_record_id_is_refused() -> None:
    with pytest.raises(SplitError, match="duplicate record id"):
        split_sft_records([_record(), _record()], _split())


def test_a_parse_record_without_a_source_question_is_refused() -> None:
    with pytest.raises(SplitError, match="no source question id"):
        split_sft_records([_record(labels={})], _split())


def test_an_explain_record_without_a_source_question_is_train() -> None:
    record = _record(id="chat-explain-x", task="rule.explain", labels={"ruleRef": "r"})
    holdout = _record(id="chat-parse-q2", labels={"questionId": "q2"})
    result = split_sft_records([record, holdout], _split())
    assert [item["id"] for item in result.train] == ["chat-explain-x"]
    assert [item["id"] for item in result.holdout] == ["chat-parse-q2"]
    assert result.no_source == 1


def test_an_overlapping_split_is_refused() -> None:
    with pytest.raises(SplitError, match="both sides"):
        split_sft_records([_record()], _split(train=("q1",), holdout=("q1",)))


def test_a_split_without_a_side_is_refused() -> None:
    with pytest.raises(SplitError, match="must hold"):
        split_sft_records([_record()], {"questions": {"train": ["q1"]}})


def test_an_empty_holdout_is_refused() -> None:
    with pytest.raises(SplitError, match="both sides of the frozen split"):
        split_sft_records([_record()], _split(train=("q1",), holdout=()))
    with pytest.raises(SplitError, match="both sides of the SFT split"):
        split_sft_records(
            [_record(id="chat-parse-q2", labels={"questionId": "q2"})],
            _split(train=("q1",), holdout=("q2",)),
        )
