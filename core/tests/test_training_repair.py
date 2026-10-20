"""Repair SFT substrate (W1.7): mutations, portable traces, verified records, the corpus.

No CAD engine here: the committed corpus is checked offline against the same laws the builder
enforces at record time, and the record builder is exercised with synthetic launcher output.
The live replay (`--check --engine`) runs in the weekly cad job and on the dev machine.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.cad import load_case_document
from archres_core.training import (
    MUTATIONS,
    RecordError,
    RepairError,
    apply_mutation,
    build_repair_record,
    load_jsonl,
    mutation_by_id,
    normalize_failure,
    record_id,
    render_trace,
    validate_record,
    verification_failure,
    verify_repair_record,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"
TARGET = ROOT / "tools" / "cad" / "candidates" / "geometry_build.py"
SCHEMA = ROOT / "spec" / "schemas" / "sft-record.schema.json"
CORPUS = ROOT / "data" / "training" / "repair-v0"


def _schema() -> dict:
    return json.loads(SCHEMA.read_text(encoding="utf-8"))


def _target() -> str:
    return TARGET.read_text(encoding="utf-8")


def _cases() -> list[dict]:
    return load_case_document(CASES)


def _raw_case(case_id: str) -> dict:
    return next(case for case in _cases() if case["id"] == case_id)


def _exception_failure(mutation) -> dict:
    return normalize_failure(
        {
            "errorType": mutation.expected,
            "message": "boom",
            "frames": [
                {"file": "candidate.py", "line": 123, "source": "main()"},
                {"file": "candidate.py", "line": 94, "source": "    params = _param()"},
            ],
        },
        "engine_error",
    )


def _record(mutation):
    raw = _raw_case(mutation.case_id)
    if mutation.expected == "verification":
        failure = verification_failure(mutation.expected_check, "measured mismatch")
    else:
        failure = _exception_failure(mutation)
    return build_repair_record(
        mutation=mutation,
        broken_source=apply_mutation(_target(), mutation),
        target_source=_target(),
        case_id=mutation.case_id,
        case_kind=raw["kind"],
        params=raw["params"],
        expect=raw["expect"],
        failure=failure,
    )


def test_every_mutation_applies_to_the_committed_candidate() -> None:
    source = _target()
    for mutation in MUTATIONS:
        broken = apply_mutation(source, mutation)
        assert broken != source
        assert broken.count(mutation.new) == 1
        assert broken.replace(mutation.new, mutation.old, 1) == source


def test_a_drifted_candidate_is_an_error_not_a_new_bug() -> None:
    with pytest.raises(RepairError, match="expected exactly one occurrence"):
        apply_mutation("print('something else')", mutation_by_id("call-typo"))


def test_an_unknown_mutation_is_an_error() -> None:
    with pytest.raises(RepairError, match="unknown mutation"):
        mutation_by_id("made-up")


def test_a_record_id_is_schema_safe() -> None:
    for mutation in MUTATIONS:
        value = record_id(mutation)
        assert value.startswith("repair-")
        assert all(ch.islower() or ch.isdigit() or ch == "-" for ch in value)
        assert "." not in value


def test_a_trace_keeps_only_candidate_frames_and_no_machine_paths() -> None:
    failure = normalize_failure(
        {
            "errorType": "NameError",
            "message": "name '_param' is not defined",
            "frames": [
                {"file": "launcher.py", "line": 137, "source": "runpy.run_path(...)"},
                {"file": "candidate.py", "line": 123, "source": "main()"},
                {"file": "candidate.py", "line": 94, "source": "    params = _param()"},
            ],
        },
        "engine_error",
    )
    assert [frame["line"] for frame in failure["frames"]] == [123, 94]
    assert failure["line"] == 94
    assert failure["sourceLine"] == "    params = _param()"
    assert failure["trace"].startswith("NameError: name '_param' is not defined")
    assert "launcher.py" not in failure["trace"]


def test_a_trace_that_is_not_a_candidate_failure_is_refused() -> None:
    for code in (None, "timeout", "no_result"):
        with pytest.raises(RepairError):
            normalize_failure({}, code)


def test_a_verification_failure_has_a_readable_trace() -> None:
    failure = verification_failure("totals.volumeM3", "total volumeM3 is 5.508, expected 6.964..6.968")
    assert failure["code"] == "verification"
    assert failure["trace"].startswith("verification failed: totals.volumeM3:")
    assert "5.508" in failure["trace"]
    assert render_trace(failure) == failure["trace"]


def test_the_builder_makes_schema_valid_records_for_both_failure_kinds() -> None:
    schema = _schema()
    for mutation in MUTATIONS:
        record = _record(mutation)
        validate_record(record, schema)
        assert record["kind"] == "repair"
        assert record["task"] == "repair.fix"
        assert record["lang"] == "code"
        assert record["difficulty"] == "broken"
        assert [message["role"] for message in record["messages"]] == [
            "system",
            "user",
            "assistant",
        ]
        assert record["messages"][2]["content"] == _target()
        assert record["messages"][0]["content"].startswith("You are Archie's CAD repair step.")


def test_the_committed_corpus_verifies_offline() -> None:
    records = load_jsonl(CORPUS / "dataset.jsonl")
    assert records
    assert {record["input"]["mutation"]["id"] for record in records} == {
        mutation.id for mutation in MUTATIONS
    }
    schema = _schema()
    target = _target()
    cases = _cases()
    for record in records:
        verify_repair_record(record, schema=schema, target_source=target, cases=cases)


def test_a_tampered_label_is_refused() -> None:
    record = _record(mutation_by_id("call-typo"))
    record["labels"]["errorType"] = "TypeError"
    with pytest.raises(RepairError, match="labels do not mirror"):
        verify_repair_record(record, schema=_schema(), target_source=_target(), cases=_cases())


def test_tampered_code_is_refused() -> None:
    record = _record(mutation_by_id("call-typo"))
    record["input"]["code"] += "\n# a hand edit"
    with pytest.raises(RepairError, match="not the declared mutation"):
        verify_repair_record(record, schema=_schema(), target_source=_target(), cases=_cases())


def test_a_tampered_trace_is_refused() -> None:
    record = _record(mutation_by_id("call-typo"))
    record["input"]["failure"]["trace"] = "NameError: something else"
    with pytest.raises(RepairError, match="canonical rendered form"):
        verify_repair_record(record, schema=_schema(), target_source=_target(), cases=_cases())


def test_a_machine_path_is_refused() -> None:
    record = _record(mutation_by_id("call-typo"))
    record["input"]["mutation"]["description"] = r"broken on C:\Users\someone\project"
    with pytest.raises(RepairError, match="machine path"):
        verify_repair_record(record, schema=_schema(), target_source=_target(), cases=_cases())


def test_a_repair_record_must_be_code_and_broken() -> None:
    record = _record(mutation_by_id("call-typo"))
    record["lang"] = "en"
    with pytest.raises(RecordError, match="invalid at lang"):
        validate_record(record, _schema())


def test_a_chat_record_still_validates_against_the_extended_schema() -> None:
    chat = load_jsonl(ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl")[0]
    validate_record(chat, _schema())


def _run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "cp1252"  # a piped Windows console is not UTF-8
    return subprocess.run(
        [sys.executable, str(ROOT / "tools" / "training" / "build_repair_dataset.py"), *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
        env=env,
    )


def test_the_cli_check_is_fresh_offline_on_a_cp1252_console() -> None:
    result = _run_cli("--check")
    assert result.returncode == 0, result.stderr
    assert "fresh" in result.stdout
