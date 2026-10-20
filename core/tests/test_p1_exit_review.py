"""The P1 exit review's headline numbers must stay true (plan §9: no stale claims).

`docs/work/P1-EXIT-REVIEW.md` quotes measured numbers to the owner. A number that drifts out
of the data is a false claim in the phase's closing document, so the ones that can be recomputed
from committed artefacts are recomputed here: the three recorded chat reply sets, the repair
suite's two measured rates, the teacher token arithmetic and the split sizes. If a future round
changes a number, this test fails and the review has to be updated with it.
"""

from __future__ import annotations

import json
import pathlib

from archres_core.eval import load_cases, load_replies, run_model_suite

ROOT = pathlib.Path(__file__).resolve().parents[2]
EVAL = ROOT / "data" / "eval" / "chat-v0"
REPAIR_EVAL = ROOT / "data" / "eval" / "repair-v0"
SFT1 = ROOT / "data" / "training" / "sft-v1"
REPAIR_SPLIT = ROOT / "data" / "training" / "repair-v1"
REVIEW = ROOT / "docs" / "work" / "P1-EXIT-REVIEW.md"


def _model_suite(model: str) -> tuple[int, int, dict]:
    cases = [case for case in load_cases(EVAL / "cases.jsonl") if case.suite == "model.parse"]
    replies = load_replies(EVAL / "replies" / f"{model}.jsonl")
    result = run_model_suite(cases, replies)
    metrics = result.metrics
    return result.passed, len(cases), metrics


def test_the_review_quotes_the_measured_chat_scores() -> None:
    for model, expected in (("stock", 32), ("finetune", 43), ("finetune-v1", 42)):
        passed, total, metrics = _model_suite(model)
        assert total == 60, model
        assert passed == expected, (model, passed)
        assert metrics["accuracy"] == round(expected / 60, 4), model


def test_the_review_quotes_the_measured_repair_rates() -> None:
    gates = json.loads((REPAIR_EVAL / "gates.json").read_text(encoding="utf-8"))
    for model in ("stock", "finetune"):
        report = json.loads((REPAIR_EVAL / "reports" / f"{model}.json").read_text(encoding="utf-8"))
        assert report["summary"]["replies"] == 4, model
        assert report["rates"]["passesOwnCase"] == gates["floors"]["passesOwnCase"]["floor"], model
        assert report["rates"]["noCollateral"] == gates["floors"]["noCollateral"]["floor"], model


def test_the_review_quotes_the_teacher_token_arithmetic() -> None:
    manifest = json.loads((SFT1 / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["tokens"]["total"] == 207_558
    assert manifest["tokens"]["shortfall"] == 292_442
    assert manifest["counts"]["teacherAccepted"] == 61
    assert manifest["counts"]["teacherRejected"] == 50
    assert manifest["counts"]["train"] == 475
    assert manifest["counts"]["holdout"] == 247


def test_the_review_quotes_the_repair_split_and_corpus() -> None:
    split = json.loads((REPAIR_SPLIT / "manifest.json").read_text(encoding="utf-8"))
    assert split["counts"] == {"train": 12, "holdout": 4, "total": 16}
    corpus = json.loads(
        (ROOT / "data" / "training" / "repair-v0" / "manifest.json").read_text(encoding="utf-8")
    )
    assert corpus["counts"]["records"] == 16
    assert corpus["counts"]["byFailureCode"] == {"engine_error": 9, "verification": 7}


def test_the_review_file_exists_and_names_the_open_gaps() -> None:
    text = REVIEW.read_text(encoding="utf-8")
    for needle in (
        "292,442",
        "43/60",
        "42/60",
        "32/60",
        "61 accepted / 50 rejected",
        "3/4",
        "207,558",
    ):
        assert needle in text, needle
