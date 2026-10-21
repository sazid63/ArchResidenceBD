"""The RFT round (W4.1): sample -> verify -> keep, and the truth is the scripted labels.

The laws these tests hold:

- **the model never sees the answer** - the prompt carries the system and the user turn
  only, so a kept sample is the model's own answer and not an echo of the truth;
- **the truth is the scripted labels** - an answer that disagrees is dropped, with the
  reason written down;
- **a kept answer becomes training data** - the record keeps the question and the labels
  and takes the model's own words, and it validates against the SFT schema;
- **a dropped sample is evidence** - the round's ledger says what was dropped and why.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.agent.client import ScriptedClient
from archres_core.training.rft import (
    RFT_VERSION,
    build_rft_records,
    judge_answer,
    judge_repair,
    read_code,
    round_document,
    sample_round,
    same_value,
)
from archres_core.training.records import RecordError, validate_record

ROOT = pathlib.Path(__file__).resolve().parents[2]
SFT_SCHEMA = ROOT / "spec" / "schemas" / "sft-record.schema.json"
REPAIR_TRAIN = ROOT / "data" / "training" / "repair-v1" / "train.jsonl"


def _record(record_id: str = "chat-parse-area-name-slp-as-given-bn") -> dict:
    """A scripted record in the shape the dataset holds."""
    return {
        "schemaVersion": "0.1.0",
        "id": record_id,
        "kind": "chat",
        "task": "interview.parse",
        "lang": "bn",
        "difficulty": "sloppy",
        "status": "verified",
        "source": {"kind": "scripted", "promptVersion": "chat-system-v0", "seed": 7},
        "input": {
            "answerText": "hDanmondi",
            "questionId": "area-name",
            "generator": "build_chat_dataset-0.1.0",
        },
        "labels": {
            "decision": "accept",
            "pointer": "/site/address/areaName",
            "questionId": "area-name",
            "value": "hDanmondi",
        },
        "messages": [
            {"role": "system", "content": "You are Archie."},
            {"role": "user", "content": "ব্যবহারকারী বললেন: hDanmondi"},
            {
                "role": "assistant",
                "content": '{"decision":"accept","pointer":"/site/address/areaName",'
                '"value":"hDanmondi"}',
            },
        ],
    }


def _good_answer() -> str:
    return (
        '{"confidence":"high","decision":"accept","echo":"hDanmondi",'
        '"pointer":"/site/address/areaName","value":"hDanmondi"}'
    )


def test_an_answer_that_agrees_with_the_truth_is_kept() -> None:
    record = _record()
    value, reason = judge_answer(record, _good_answer())
    assert reason == ""
    assert value is not None and value["decision"] == "accept"


def test_an_answer_that_differs_is_dropped_with_the_reason() -> None:
    record = _record()
    value, reason = judge_answer(
        record, '{"decision":"ask_again","pointer":"/site/address/areaName","value":"x"}'
    )
    assert reason
    assert "decision" in reason
    assert value is not None  # the answer was readable - it was simply wrong


def test_an_unreadable_answer_is_dropped() -> None:
    record = _record()
    payload, reason = judge_answer(record, "I could not read that")
    assert payload == {}
    assert reason.startswith("unreadable")


def test_a_number_within_a_hair_is_the_same_number() -> None:
    assert same_value(133.78, 133.78)
    assert same_value(133.78, "133.78")
    assert same_value(133.78, 133.7800000001)
    assert not same_value(133.78, 133.79)
    assert not same_value("hDanmondi", "Dhanmondi")


def test_the_model_never_sees_the_scripted_answer() -> None:
    """The prompt carries the question, not the truth - or the round would teach nothing."""
    client = ScriptedClient(replies=[_good_answer()])
    sample_round(client, [_record()], samples=1)
    prompt = client.calls[0]["messages"]
    assert [message["role"] for message in prompt] == ["system", "user"]
    assert "hDanmondi" in prompt[1]["content"]
    assert not any(
        '"pointer"' in message["content"] for message in prompt
    ), "the truth must not be in the prompt"


def test_a_round_samples_every_record_the_tasks_ask_for() -> None:
    records = [_record("chat-parse-one-bn"), _record("chat-parse-two-bn")]
    records.append({**_record("chat-ask-one-bn"), "task": "interview.ask"})
    client = ScriptedClient(replies=[_good_answer()] * 4)
    samples = sample_round(client, records, samples=2)
    assert len(samples) == 4, "two parse records, two samples each"
    assert {sample.record_id for sample in samples} == {"chat-parse-one-bn", "chat-parse-two-bn"}


def test_a_dropped_sample_is_recorded_with_its_reason() -> None:
    """A dropped sample is evidence, not waste: the reason is what the next round reads."""
    client = ScriptedClient(replies=[_good_answer(), "not json at all"])
    samples = sample_round(client, [_record()], samples=2)
    assert [sample.kept for sample in samples] == [True, False]
    document = round_document(
        samples, round_id="r1", model="archie-chat-v0", temperature=0.7, samples_per_record=2
    )
    assert document["version"] == RFT_VERSION
    assert document["counts"]["sampled"] == 2
    assert document["counts"]["kept"] == 1
    assert document["counts"]["dropped"] == 1
    assert document["counts"]["recordsWithAKeptSample"] == 1
    assert document["dropReasons"] == {"unreadable": 1}


def test_a_kept_sample_becomes_a_training_record() -> None:
    record = _record()
    client = ScriptedClient(replies=[_good_answer()])
    samples = sample_round(client, [record], samples=1)
    built = build_rft_records(samples, [record], round_id="r1", model="archie-chat-v0")
    assert len(built) == 1
    rft = built[0]
    assert rft["id"] == "rft-r1-chat-parse-area-name-slp-as-given-bn-1"
    assert rft["source"] == {"kind": "rft", "batch": "r1", "model": "archie-chat-v0"}
    assert rft["status"] == "verified"
    # the assistant's turn is the model's own answer, and the labels are the truth
    assistant = [message for message in rft["messages"] if message["role"] == "assistant"]
    assert len(assistant) == 1
    assert assistant[0]["content"] == _good_answer()
    assert rft["labels"] == record["labels"]


def test_an_rft_record_validates_against_the_sft_schema() -> None:
    """The round's records are training records - the schema says so, and it must hold."""
    schema = json.loads(SFT_SCHEMA.read_text(encoding="utf-8"))
    record = _record()
    client = ScriptedClient(replies=[_good_answer()])
    samples = sample_round(client, [record], samples=1)
    built = build_rft_records(samples, [record], round_id="r1", model="archie-chat-v0")
    validate_record(built[0], schema)


def test_a_dropped_sample_becomes_no_record() -> None:
    record = _record()
    client = ScriptedClient(replies=["not json at all"])
    samples = sample_round(client, [record], samples=1)
    assert build_rft_records(samples, [record], round_id="r1", model="archie-chat-v0") == []


def test_a_model_that_cannot_be_reached_is_a_dropped_sample() -> None:
    """A fleet that is down must not look like a fleet that was wrong."""

    class Broken:
        name = "broken"

        def complete(self, messages, *, max_tokens=256, temperature=0.0):  # noqa: ANN001
            from archres_core.agent.client import ModelError

            raise ModelError("the router is not running")

    samples = sample_round(Broken(), [_record()], samples=1)
    assert len(samples) == 1
    assert samples[0].kept is False
    assert samples[0].reason.startswith("unreachable")


def test_a_round_needs_at_least_one_sample() -> None:
    with pytest.raises(ValueError):
        sample_round(ScriptedClient(), [_record()], samples=0)


def _repair_record() -> dict:
    """A real repair record from the committed training side."""
    from archres_core.training.records import load_jsonl

    return load_jsonl(REPAIR_TRAIN)[0]


def test_a_fenced_macro_is_unwrapped() -> None:
    """The models fence their code; the engine must not be asked to run the fence."""
    assert read_code("```python\nprint('hi')\n```") == "print('hi')"
    assert read_code("print('hi')") == "print('hi')"


def test_a_fix_that_verifies_is_kept() -> None:
    """The engine says it works - that is the truth, not the text's appearance."""
    record = _repair_record()
    seen: list[str] = []

    def verify(source: str, case_id: str, params: dict) -> tuple[bool, str]:
        seen.append(case_id)
        return True, ""

    payload, reason = judge_repair(record, "```python\npass\n```", verify=verify)
    assert reason == ""
    assert payload["passed"] is True
    assert payload["caseId"] == record["input"]["caseId"]
    assert seen == [record["input"]["caseId"]]


def test_a_fix_that_fails_is_dropped_with_the_reason() -> None:
    """A repair is not judged by whether it looks like the known-good one."""
    record = _repair_record()

    def verify(source: str, case_id: str, params: dict) -> tuple[bool, str]:
        return False, "pads.1x1: the pad count is 1, expected 2"

    payload, reason = judge_repair(record, "pass", verify=verify)
    assert reason.startswith("failed:")
    assert "pads.1x1" in reason
    assert payload["passed"] is False


def test_an_answer_with_no_code_is_dropped() -> None:
    record = _repair_record()
    payload, reason = judge_repair(
        record, "   ", verify=lambda source, case_id, params: (True, "")
    )
    assert reason.startswith("unreadable")
    assert payload == {}


def test_a_repair_round_keeps_only_the_fixes_that_work() -> None:
    """The whole way through: the model's own macro, judged by the engine, into a record."""
    record = _repair_record()
    client = ScriptedClient(replies=["```python\nimport FreeCAD\n```", "```python\nbroken\n```"])
    calls: list[str] = []

    def verify(source: str, case_id: str, params: dict) -> tuple[bool, str]:
        calls.append(source)
        return ("FreeCAD" in source), "the macro did not build the pads"

    samples = sample_round(
        client,
        [record],
        samples=2,
        tasks=("repair.fix",),
        judge=lambda rec, answer: judge_repair(rec, answer, verify=verify),
    )
    assert [sample.kept for sample in samples] == [True, False]

    built = build_rft_records(
        samples, [record], round_id="r1", model="archie-repair", verify_checks=("rft.case",)
    )
    assert len(built) == 1
    rft = built[0]
    assert rft["source"] == {"kind": "rft", "batch": "r1", "model": "archie-repair"}
    assert rft["status"] == "verified"
    assert rft["verifyChecks"] == ["rft.case"]
    assistant = [message for message in rft["messages"] if message["role"] == "assistant"]
    assert assistant[0]["content"] == "```python\nimport FreeCAD\n```"
    # the record still says what the failure was - that truth did not change
    assert rft["labels"] == record["labels"]


def test_a_repair_rft_record_validates_against_the_sft_schema() -> None:
    """A kept fix is a training record - the schema says so, and it must hold."""
    schema = json.loads(SFT_SCHEMA.read_text(encoding="utf-8"))
    record = _repair_record()
    client = ScriptedClient(replies=["```python\\nimport FreeCAD\\n```"])
    samples = sample_round(
        client,
        [record],
        samples=1,
        tasks=("repair.fix",),
        judge=lambda rec, answer: judge_repair(
            rec, answer, verify=lambda source, case_id, params: (True, "")
        ),
    )
    built = build_rft_records(
        samples, [record], round_id="r1", model="archie-repair", verify_checks=("rft.case",)
    )
    validate_record(built[0], schema)
