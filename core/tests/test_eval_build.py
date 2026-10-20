"""Eval case building (W1.9): authored data is validated, the compiled set is reproducible."""

from __future__ import annotations

import hashlib
import json
import pathlib

import pytest
import yaml

from archres_core import compliance
from archres_core.eval import (
    build_cases,
    build_manifest,
    build_model_cases,
    build_parse_cases,
    coverage_probes,
    dataset_parse_records,
    dumps_split,
    load_authored,
    load_cases,
    load_split,
    replies_document,
    split_document,
)
from archres_core.eval.build import _answer_text
from archres_core.eval.cases import EvalError, cases_bytes
from archres_core.rag.corpus import load_corpus

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "eval" / "chat-v0"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
DATASET = ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl"
AUTHORED = OUT / "authored.yaml"
SPLIT = OUT / "split.json"
CASES = OUT / "cases.jsonl"
MANIFEST = OUT / "manifest.json"


@pytest.fixture(scope="module")
def pack() -> dict:
    return compliance.load_pack(PACK)


@pytest.fixture(scope="module")
def built(pack) -> list:
    return build_cases(
        pack=pack,
        dataset_path=DATASET,
        authored_path=AUTHORED,
        split=load_split(SPLIT),
        corpus_doc_ids=[document.id for document in load_corpus(CORPUS).docs],
    )


# ------------------------------------------------------------------ the real build


def test_the_build_covers_every_suite_and_pins_the_cases(built) -> None:
    committed = load_cases(CASES)
    assert cases_bytes(built) == CASES.read_bytes()
    assert sorted(case.id for case in built) == sorted(case.id for case in committed)
    ids = [case.id for case in built]
    assert len(ids) == len(set(ids))


def test_model_cases_are_a_holdout_sample_of_the_parse_cases(built) -> None:
    parse = [case for case in built if case.suite == "parse"]
    sample = [case for case in built if case.suite == "model.parse"]
    assert sample
    assert len(sample) == len({case.id for case in sample})
    assert all(case.split == "holdout" for case in sample)
    by_id = {case.id: case for case in parse}
    for case in sample:
        source = by_id[f"parse:{case.source['recordId']}"]
        assert source.split == "holdout"
        assert case.input["questionId"] == source.input["questionId"]
        assert case.input["answerText"] == source.input["answerText"]


def test_engine_suites_are_marked_engine(built) -> None:
    for case in built:
        if case.suite in ("rule.vector", "register"):
            assert case.split == "engine"
    assert any(case.suite == "rule.vector" for case in built)
    assert any(case.suite == "register" for case in built)


def test_the_manifest_matches_the_committed_case_file(built) -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert manifest["cases"]["count"] == len(built)
    assert manifest["cases"]["sha256"] == hashlib.sha256(cases_bytes(built)).hexdigest()
    assert manifest["cases"]["bytes"] == len(cases_bytes(built))
    assert sum(manifest["suites"].values()) == len(built)
    assert sum(manifest["splits"].values()) == len(built)
    assert manifest["splitDocument"]["sha256"] == hashlib.sha256(
        dumps_split(load_split(SPLIT)).encode("utf-8")
    ).hexdigest()
    assert manifest["replies"]["stock"]["count"] > 0
    assert set(manifest["pins"]) == {"datasetSha256", "packSha256", "corpusSha256"}


def test_an_authored_document_id_must_exist_in_the_corpus(pack) -> None:
    document = yaml.safe_load(AUTHORED.read_text(encoding="utf-8"))
    document["rag"][0]["docId"] = "rajuk@2008.1:provision:does-not-exist:en"
    path = pathlib.Path(AUTHORED).with_name("authored-broken.yaml")
    try:
        path.write_text(yaml.safe_dump(document, allow_unicode=True), encoding="utf-8")
        with pytest.raises(EvalError, match="is not in the corpus"):
            build_cases(
                pack=pack,
                dataset_path=DATASET,
                authored_path=path,
                split=load_split(SPLIT),
                corpus_doc_ids=[document.id for document in load_corpus(CORPUS).docs],
            )
    finally:
        path.unlink(missing_ok=True)


# --------------------------------------------------------------- authored validation


def _authored(tmp_path, **blocks) -> pathlib.Path:
    path = tmp_path / "authored.yaml"
    path.write_text(yaml.safe_dump(blocks, allow_unicode=True), encoding="utf-8")
    return path


def test_authored_rejects_an_unknown_block(tmp_path) -> None:
    path = _authored(tmp_path, rag=[], mystery=[])
    with pytest.raises(EvalError, match="unknown keys"):
        load_authored(path)


def test_authored_rejects_a_non_list_block(tmp_path) -> None:
    path = tmp_path / "authored.yaml"
    path.write_text("rag: {}\n", encoding="utf-8")
    with pytest.raises(EvalError, match="must be a list"):
        load_authored(path)


def test_authored_rejects_a_missing_or_extra_rag_key(tmp_path) -> None:
    split = split_document(["area-name"], ["dhaka-house-bn"])
    good = {
        "id": "rag:x",
        "lang": "en",
        "query": "q",
        "mode": "answer",
        "docId": "d",
    }
    for mutate, message in (
        (lambda item: item.pop("docId"), "missing keys"),
        (lambda item: item.update(extra=1), "unknown keys"),
        (lambda item: item.update(mode="maybe"), "mode must be"),
        (lambda item: item.update(lang="fr"), "lang must be"),
    ):
        item = dict(good)
        mutate(item)
        path = _authored(tmp_path, rag=[item])
        with pytest.raises(EvalError, match=message):
            from archres_core.eval import build_authored_cases

            build_authored_cases(load_authored(path), split=split)


def test_authored_rejects_a_register_case_without_ops(tmp_path) -> None:
    split = split_document(["area-name"], ["dhaka-house-bn"])
    item = {
        "id": "register:x",
        "spec": "spec/examples/new-project.json",
        "ops": [],
        "ruleRef": "r",
        "pointer": "/p",
        "restoreValue": 1,
        "entryId": "e",
        "remainingAfterRestore": [],
    }
    path = _authored(tmp_path, register=[item])
    from archres_core.eval import build_authored_cases

    with pytest.raises(EvalError, match="ops must be"):
        build_authored_cases(load_authored(path), split=split)


def test_coverage_probes_are_reported_data_not_cases() -> None:
    probes = coverage_probes(load_authored(AUTHORED))
    assert probes
    assert all(set(probe) == {"lang", "query", "note"} for probe in probes)
    assert {probe["lang"] for probe in probes} <= {"bn", "en"}


# --------------------------------------------------------------- dataset replay


def test_a_clean_record_takes_its_answer_text_from_the_prompt() -> None:
    record = {
        "id": "chat-parse-x-clean-bn",
        "input": {"questionId": "corner-plot", "base": False},
        "messages": [
            {"role": "system", "content": "Question: corner-plot"},
            {"role": "user", "content": "প্রশ্ন আইডি corner-plot (...)। ব্যবহারকারী বললেন: না"},
            {"role": "assistant", "content": "{}"},
        ],
    }
    assert _answer_text(record) == "না"


def test_an_english_clean_record_is_read_too() -> None:
    record = {
        "id": "chat-parse-x-clean-en",
        "input": {"questionId": "area-name", "base": "Dhanmondi"},
        "messages": [
            {"role": "user", "content": "Question id area-name (...). The user answered: Dahnmondi"},
        ],
    }
    assert _answer_text(record) == "Dahnmondi"


def test_an_answer_text_that_disagrees_with_the_prompt_is_an_error() -> None:
    record = {
        "id": "chat-parse-x",
        "input": {"questionId": "area-name", "answerText": "Mirpur"},
        "messages": [{"role": "user", "content": "The user answered: Dhanmondi"}],
    }
    with pytest.raises(EvalError, match="disagrees"):
        _answer_text(record)


def test_a_record_without_any_answer_text_is_an_error() -> None:
    record = {"id": "chat-parse-x", "input": {"questionId": "area-name"}, "messages": []}
    with pytest.raises(EvalError, match="no answer text"):
        _answer_text(record)


def test_parse_cases_only_come_from_verified_records() -> None:
    records = dataset_parse_records(DATASET)
    unverified = [
        record
        for record in records
        if record.get("status") != "verified"
    ]
    assert not unverified
    cases = build_parse_cases(records)
    assert len(cases) == len(records)


def test_model_sample_is_stable_and_holdout_only() -> None:
    cases = build_parse_cases(dataset_parse_records(DATASET))
    first = build_model_cases(cases)
    second = build_model_cases(list(reversed(cases)))
    assert [case.id for case in first] == [case.id for case in second]
    assert all(case.split == "holdout" for case in first)
    with pytest.raises(EvalError):
        build_model_cases([case for case in cases if case.split != "holdout"])


# ------------------------------------------------------------------- reply pins


def test_replies_document_pins_a_file(tmp_path) -> None:
    path = tmp_path / "stock.jsonl"
    path.write_text(
        "\n".join(
            json.dumps({"caseId": case_id, "reply": "{}"}) for case_id in ("a", "b")
        )
        + "\n",
        encoding="utf-8",
    )
    pin = replies_document(path)
    assert pin["count"] == 2
    assert len(pin["sha256"]) == 64


def test_replies_document_rejects_duplicates_and_bare_rows(tmp_path) -> None:
    path = tmp_path / "stock.jsonl"
    path.write_text('{"caseId": "a"}\n{"caseId": "a"}\n', encoding="utf-8")
    with pytest.raises(EvalError, match="duplicate caseId"):
        replies_document(path)
    path.write_text('{"reply": "{}"}\n', encoding="utf-8")
    with pytest.raises(EvalError, match="no caseId"):
        replies_document(path)
    with pytest.raises(EvalError, match="not found"):
        replies_document(tmp_path / "missing.jsonl")


def test_manifest_pins_the_split_document(built) -> None:
    split = load_split(SPLIT)
    manifest = build_manifest(
        root=ROOT,
        cases=built,
        case_bytes=cases_bytes(built),
        case_path="data/eval/chat-v0/cases.jsonl",
        split_path=SPLIT,
        split=split,
        dataset_path=DATASET,
        pack_path=PACK,
        pack_sha256=compliance.pack_sha256(PACK),
        corpus_path=CORPUS,
        replies={},
    )
    assert manifest["splitDocument"]["path"] == "data/eval/chat-v0/split.json"
    assert manifest["splitDocument"]["holdoutQuestions"] == len(split["questions"]["holdout"])
    assert manifest["replies"] == {}
