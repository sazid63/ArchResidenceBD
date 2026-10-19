"""W1.5 training pipeline - build, verify, pin, and never silently drift."""

from __future__ import annotations

import copy
import hashlib
import json
import pathlib
import subprocess
import sys

import pytest

from archres_core.compliance import pack_sha256
from archres_core.training import (
    Dataset,
    GeneratorError,
    build_chat_dataset,
    dumps_record,
    load_jsonl,
    record_sort_key,
    sample_records,
    sha256_file,
    verify_record,
)
from archres_core.training.verify import VerifyContext, numbers_in

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLOW_BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
EXAMPLES = ROOT / "spec" / "examples"
SFT_SCHEMA = ROOT / "spec" / "schemas" / "sft-record.schema.json"
SPEC_SCHEMA = ROOT / "spec" / "schemas" / "building-spec.schema.json"
DATASET_DIR = ROOT / "data" / "training" / "chat-v0"


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SFT_SCHEMA.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def dataset() -> Dataset:
    return build_chat_dataset(
        flow_book_path=FLOW_BOOK,
        pack_path=PACK,
        examples_dir=EXAMPLES,
        sft_schema_path=SFT_SCHEMA,
        building_spec_schema_path=SPEC_SCHEMA,
    )


@pytest.fixture(scope="module")
def context(dataset: Dataset) -> VerifyContext:
    # The builder already verified against the real context; this fixture is for
    # negative tests that only need the flow-book questions.
    from archres_core.training.generators import load_flow_book, question_dict

    return VerifyContext(
        questions={question.id: question_dict(question) for question in load_flow_book(FLOW_BOOK)}
    )


def _find(dataset: Dataset, **labels) -> dict:
    for record in dataset.records:
        if all(record.get(key) == value for key, value in labels.items()):
            return record
    raise AssertionError(f"no record matching {labels}")


# --- build shape ------------------------------------------------------------


def test_every_record_is_verified(dataset: Dataset, schema: dict, context: VerifyContext) -> None:
    assert all(record["status"] == "verified" for record in dataset.records)
    for record in dataset.records:
        ok, checks, failures = verify_record(record, schema, context)
        assert ok, f"{record['id']}: {failures}"
        assert set(record["verifyChecks"]) == set(checks), (
            f"{record['id']}: verifyChecks {record['verifyChecks']} != {checks}"
        )


def test_ids_are_unique(dataset: Dataset) -> None:
    ids = [record["id"] for record in dataset.records]
    assert len(ids) == len(set(ids))


def test_counts_are_pinned(dataset: Dataset) -> None:
    assert dataset.counts["total"] == 661
    assert dataset.counts["byTask"] == {
        "interview.ask": 120,
        "interview.parse": 523,
        "rule.explain": 12,
        "deviation.override": 6,
    }
    assert dataset.counts["byStatus"] == {"verified": 661}
    assert dataset.counts["byOperator"]["unit_alt"] == 20
    assert dataset.counts["byOperator"]["banglish"] == 16
    assert set(dataset.counts["byDecision"]) == {"accept", "ask_again", "fallback", "escalate"}


def test_parse_coverage_is_declared(dataset: Dataset) -> None:
    assert dataset.coverage["askQuestions"] == 60
    assert dataset.coverage["parseQuestions"] == 40
    assert len(dataset.coverage["questionsWithoutParse"]) == 20
    assert len(set(dataset.coverage["questionsWithoutParse"])) == 20
    assert "plot-depth" in dataset.coverage["questionsWithoutParse"]
    assert "plinth-height" in dataset.coverage["questionsWithoutParse"]


def test_an_affirmative_answer_is_labelled_true(dataset: Dataset) -> None:
    """`affirm_sloppy` answers "yes"; keeping the base value trained "yes" to mean "no"."""
    affirmative = [
        record
        for record in dataset.records
        if (record.get("input") or {}).get("operator") == "affirm_sloppy"
    ]
    assert affirmative
    for record in affirmative:
        assert record["labels"]["decision"] == "accept", record["id"]
        assert record["labels"]["value"] is True, record["id"]
        assert json.loads(record["messages"][2]["content"])["value"] is True, record["id"]


def test_pins_match_the_frozen_artifacts(dataset: Dataset) -> None:
    assert dataset.pins["generatorVersion"] == "build_chat_dataset-0.1.0"
    assert dataset.pins["flowBookSha256"] == sha256_file(FLOW_BOOK)
    assert dataset.pins["rulePackSha256"] == pack_sha256(PACK)
    assert dataset.pins["sftSchemaSha256"] == sha256_file(SFT_SCHEMA)
    assert dataset.pins["buildingSpecSchemaSha256"] == sha256_file(SPEC_SCHEMA)
    assert set(dataset.pins["examplesSha256"]) == {
        "new-project",
        "three-storey-with-soil-report",
        "two-storey-residential",
    }


def test_sample_covers_every_task_and_the_sloppy_shapes(dataset: Dataset) -> None:
    sample = sample_records(dataset)
    assert len(sample) == 17
    assert {record["task"] for record in sample} == {
        "interview.ask",
        "interview.parse",
        "rule.explain",
        "deviation.override",
    }
    operators = {record["input"].get("operator") for record in sample}
    assert {"unit_alt", "banglish", "dont_know", "partial", "as_given", "off_topic"} <= operators
    decisions = {record["labels"].get("decision") for record in sample}
    assert {"accept", "ask_again", "fallback", "escalate"} <= decisions


# --- language policy --------------------------------------------------------


def test_bangla_record_with_an_english_proper_noun_is_valid(
    dataset: Dataset, schema: dict, context: VerifyContext
) -> None:
    record = next(
        record
        for record in dataset.records
        if record["id"] == "chat-parse-project-name-v1-clean-bn"
    )
    assert any(letter.isascii() and letter.isalpha() for letter in record["messages"][2]["content"])
    ok, checks, failures = verify_record(record, schema, context)
    assert ok and "language" in checks, failures


def test_english_record_with_bangla_digits_is_valid(
    dataset: Dataset, schema: dict, context: VerifyContext
) -> None:
    record = next(
        record
        for record in dataset.records
        if record["id"] == "chat-parse-plot-area-slp-bangla-digits-en"
    )
    ok, checks, failures = verify_record(record, schema, context)
    assert ok and "language" in checks, failures
    assert numbers_in("৪.১৯") == ["4.19"]


def test_english_record_with_bangla_prose_is_rejected(
    dataset: Dataset, schema: dict, context: VerifyContext
) -> None:
    record = copy.deepcopy(
        next(record for record in dataset.records if record["id"] == "chat-ask-setup-project-name-en")
    )
    record["messages"][-1]["content"] = "এই প্রকল্পের নাম কী হবে?"
    ok, _checks, failures = verify_record(record, schema, context)
    assert not ok
    assert any(failure.startswith("language:") for failure in failures)


# --- verifier negatives -----------------------------------------------------


def test_schema_failure_is_reported_not_raised(
    dataset: Dataset, schema: dict, context: VerifyContext
) -> None:
    record = copy.deepcopy(dataset.records[0])
    record["input"]["generator"] = "bad@version"
    ok, checks, failures = verify_record(record, schema, context)
    assert not ok
    assert checks == ["schema"]
    assert failures and failures[0].startswith("schema:")


def test_invented_number_is_rejected(dataset: Dataset, schema: dict, context: VerifyContext) -> None:
    record = copy.deepcopy(_find(dataset, task="rule.explain"))
    record["messages"][-1]["content"] += " It will cost 999 taka."
    ok, _checks, failures = verify_record(record, schema, context)
    assert not ok
    assert any("invented numbers" in failure for failure in failures)


def test_unknown_citation_is_rejected(dataset: Dataset, schema: dict, context: VerifyContext) -> None:
    record = copy.deepcopy(_find(dataset, task="rule.explain"))
    record["labels"]["citations"] = ["made-up-citation"]
    ok, _checks, failures = verify_record(record, schema, context)
    assert not ok
    assert any(failure.startswith("citations:") for failure in failures)


def test_wrong_register_entry_is_rejected(
    dataset: Dataset, schema: dict, context: VerifyContext
) -> None:
    record = copy.deepcopy(_find(dataset, task="deviation.override"))
    record["labels"]["registerEntry"]["riskTier"] = "cosmetic"
    ok, _checks, failures = verify_record(record, schema, context)
    assert not ok
    assert any(failure.startswith("register:") for failure in failures)


def test_teacher_ask_is_exempt_from_the_flow_book_text_check(
    dataset: Dataset, schema: dict, context: VerifyContext
) -> None:
    record = copy.deepcopy(_find(dataset, task="interview.ask", lang="en"))
    record["source"]["kind"] = "teacher"
    record["messages"][-1]["content"] = "Could you tell me what you would like to call this project?"
    ok, checks, failures = verify_record(record, schema, context)
    assert ok, failures
    assert "ask.text" not in checks


# --- committed artifacts ----------------------------------------------------


def test_committed_dataset_is_canonical_and_complete(dataset: Dataset) -> None:
    records = load_jsonl(DATASET_DIR / "dataset.jsonl")
    assert len(records) == dataset.counts["total"]
    for line in (DATASET_DIR / "dataset.jsonl").read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        assert line == dumps_record(record)
    assert [record["id"] for record in records] == [
        record["id"] for record in sorted(records, key=record_sort_key)
    ]


def test_committed_sample_is_a_subset(dataset: Dataset) -> None:
    dataset_ids = {record["id"] for record in load_jsonl(DATASET_DIR / "dataset.jsonl")}
    sample = load_jsonl(DATASET_DIR / "sample.jsonl")
    assert sample
    assert {record["id"] for record in sample} <= dataset_ids


def test_committed_manifest_hashes_match() -> None:
    manifest = json.loads((DATASET_DIR / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["coverage"]["parseQuestions"] == 40
    assert len(manifest["coverage"]["questionsWithoutParse"]) == 20
    for name, info in manifest["files"].items():
        payload = (DATASET_DIR / name).read_bytes()
        assert info["bytes"] == len(payload)
        assert info["sha256"] == hashlib.sha256(payload).hexdigest()
    assert manifest["counts"]["total"] == 661


def test_cli_check_passes() -> None:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "training" / "build_chat_dataset.py"), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "fresh" in result.stdout


def test_builder_refuses_duplicate_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    import archres_core.training.generators as generators

    original = generators.build_ask_records
    monkeypatch.setattr(
        generators,
        "build_ask_records",
        lambda questions: original(questions[:1]) * 2,
    )
    with pytest.raises(GeneratorError, match="duplicate record ids"):
        generators.build_chat_dataset(
            flow_book_path=FLOW_BOOK,
            pack_path=PACK,
            examples_dir=EXAMPLES,
            sft_schema_path=SFT_SCHEMA,
            building_spec_schema_path=SPEC_SCHEMA,
        )
