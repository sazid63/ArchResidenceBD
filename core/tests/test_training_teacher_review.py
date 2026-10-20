"""W1.6 teacher review ledger, accepted subset and teacher-augmented SFT split."""

from __future__ import annotations

import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data" / "training" / "teacher-review"
ACCEPTED = REVIEW / "accepted.jsonl"
REVIEW_MANIFEST = REVIEW / "manifest.json"
SFT0 = ROOT / "data" / "training" / "sft-v0"
SFT1 = ROOT / "data" / "training" / "sft-v1"


def load_jsonl(path: pathlib.Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_review_manifest_pins_the_committed_files() -> None:
    manifest = json.loads(REVIEW_MANIFEST.read_text(encoding="utf-8"))
    assert manifest["review"]["records"] == 111
    assert manifest["review"]["accepted"] == 61
    assert manifest["review"]["rejected"] == 50
    assert manifest["review"]["sha256"] == sha256(REVIEW / "review.jsonl")
    assert manifest["accepted"]["sha256"] == sha256(ACCEPTED)
    assert manifest["accepted"]["records"] == 61


def test_every_accepted_record_is_verified_and_reviewed() -> None:
    rows = load_jsonl(ACCEPTED)
    assert len(rows) == 61
    assert len({row["id"] for row in rows}) == len(rows)
    for record in rows:
        assert record["kind"] == "chat"
        assert record["status"] == "verified"
        assert "review.meaning" in record["verifyChecks"]
        review = record["input"]["review"]
        assert review["decision"] == "accept"
        assert review["reviewer"]
        assert review["reviewedAt"] == "2026-10-20"
        assert review["candidateTextSha256"]
        assert review["ownerDecision"].startswith("A")


def test_review_decisions_are_complete_and_consistent() -> None:
    decisions = {row["id"]: row for row in load_jsonl(REVIEW / "review.jsonl")}
    accepted = {row["id"] for row in load_jsonl(ACCEPTED)}
    assert len(decisions) == 111
    assert accepted == {rid for rid, row in decisions.items() if row["decision"] == "accept"}
    rejected = {rid for rid, row in decisions.items() if row["decision"] == "reject"}
    assert accepted.isdisjoint(rejected)
    assert len(rejected) == 50
    for rid in rejected:
        assert decisions[rid]["reason"].strip()
    for rid in accepted:
        assert decisions[rid]["textSha256"]


def test_teacher_split_adds_only_train_side_records() -> None:
    train0 = load_jsonl(SFT0 / "train.jsonl")
    holdout0 = load_jsonl(SFT0 / "holdout.jsonl")
    accepted = load_jsonl(ACCEPTED)
    train = load_jsonl(SFT1 / "train.jsonl")
    holdout = load_jsonl(SFT1 / "holdout.jsonl")
    dataset = load_jsonl(SFT1 / "dataset.jsonl")

    assert {row["id"] for row in train} == {row["id"] for row in train0} | {
        row["id"] for row in accepted
    }
    assert (SFT1 / "holdout.jsonl").read_bytes() == (SFT0 / "holdout.jsonl").read_bytes()
    assert {row["id"] for row in dataset} == {row["id"] for row in train} | {
        row["id"] for row in holdout
    }
    assert len(train) == 475 and len(holdout) == 247 and len(dataset) == 722

    holdout_questions = {
        row["labels"]["questionId"]
        for row in holdout0
        if row.get("labels", {}).get("questionId")
    }
    assert not [
        row
        for row in accepted
        if row.get("labels", {}).get("questionId") in holdout_questions
    ]


def test_teacher_split_manifest_declares_the_token_shortfall() -> None:
    manifest = json.loads((SFT1 / "manifest.json").read_text(encoding="utf-8"))
    tokens = manifest["tokens"]
    assert tokens["target"] == 500_000
    assert tokens["scripted"] == 196_821
    assert tokens["teacherAccepted"] == 10_737
    assert tokens["total"] == 207_558
    assert tokens["shortfall"] == 292_442
    assert tokens["declaredShortfall"] is True
    assert manifest["counts"]["teacherAccepted"] == 61
    assert manifest["counts"]["teacherRejected"] == 50
    assert manifest["pins"]["acceptedTeacher"]["sha256"] == sha256(ACCEPTED)
    assert manifest["files"]["train.jsonl"]["sha256"] == sha256(SFT1 / "train.jsonl")
    assert manifest["files"]["holdout.jsonl"]["sha256"] == sha256(SFT1 / "holdout.jsonl")
    assert manifest["files"]["dataset.jsonl"]["sha256"] == sha256(SFT1 / "dataset.jsonl")
