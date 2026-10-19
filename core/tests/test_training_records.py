"""SFT record plumbing (W1.5) - canonical JSONL and the schema contract."""

from __future__ import annotations

import hashlib
import json
import pathlib

import pytest

from archres_core.training import records

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "spec" / "schemas" / "sft-record.schema.json").read_text(encoding="utf-8"))


def _record(record_id: str = "chat-ask-setup-project-name-en") -> dict:
    return {
        "schemaVersion": "0.1.0",
        "id": record_id,
        "kind": "chat",
        "task": "interview.ask",
        "lang": "en",
        "messages": [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "ask"},
            {"role": "assistant", "content": "What should we call this project?"},
        ],
        "labels": {"questionId": "project-name", "phaseId": "setup", "mapsTo": "/project/name"},
        "input": {"generator": "build_chat_dataset-0.1.0", "questionId": "project-name"},
        "source": {"kind": "scripted", "promptVersion": "chat-system-v0"},
        "difficulty": "clean",
        "status": "verified",
    }


def test_canonical_dumps_is_sorted_and_compact() -> None:
    record = _record()
    text = records.dumps_record(record)
    assert text == json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    assert "\n" not in text


def test_write_jsonl_is_byte_stable_and_sorted(tmp_path: pathlib.Path) -> None:
    first = _record("chat-parse-a")
    second = _record("chat-ask-b")
    path = tmp_path / "data.jsonl"
    stats = records.write_jsonl([first, second], path)
    payload = path.read_bytes()
    assert payload.endswith(b"\n")
    assert stats["records"] == 2
    assert stats["bytes"] == len(payload)
    assert stats["sha256"] == hashlib.sha256(payload).hexdigest()
    lines = payload.decode("utf-8").splitlines()
    assert [json.loads(line)["id"] for line in lines] == ["chat-ask-b", "chat-parse-a"]


def test_load_jsonl_skips_blank_lines(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "data.jsonl"
    records.write_jsonl([_record()], path)
    path.write_text(path.read_text(encoding="utf-8") + "\n\n", encoding="utf-8")
    assert records.load_jsonl(path) == [_record()]


def test_validate_record_accepts_a_valid_record() -> None:
    records.validate_record(_record(), SCHEMA)


def test_validate_record_reports_bad_generator_without_crashing() -> None:
    record = _record()
    record["input"]["generator"] = "build_chat_dataset@0.1.0"
    with pytest.raises(records.RecordError) as excinfo:
        records.validate_record(record, SCHEMA)
    assert "input/generator" in str(excinfo.value)


def test_make_id_is_a_schema_safe_slug() -> None:
    assert records.make_id("Chat", "Parse", "Plot Area", "bn") == "chat-parse-plot-area-bn"
    assert records.make_id("a", "b--c", "") == "a-b-c"


def test_hashes_are_of_exact_bytes(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "x.txt"
    path.write_bytes(b"hello\n")
    assert records.sha256_file(path) == hashlib.sha256(b"hello\n").hexdigest()
    assert records.sha256_text("hello\n") == records.sha256_file(path)
