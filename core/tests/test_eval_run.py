"""Eval runners + scoring (W1.9): every case is scored, no exception is a free pass."""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core import compliance
from archres_core.agent import LawDesk
from archres_core.eval import (
    EVAL_AT,
    CaseOutcome,
    EvalCase,
    EvalError,
    build_report,
    dumps_report,
    load_cases,
    load_replies,
    render_markdown,
    run_model_suite,
    run_parse_suite,
    run_rag_suite,
    run_register_suite,
    run_rule_suite,
    run_scenario_suite,
)
from archres_core.eval.run import (
    _same_value,
    _score,
    _summarize,
    _writes_what_the_user_said,
    run_model_safety_suite,
)
from archres_core.interview import load_book
from archres_core.rag import HashingEmbedder, LexicalReranker, service_from_paths

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK_PATH = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
CASES = ROOT / "data" / "eval" / "chat-v0" / "cases.jsonl"
REPLIES = ROOT / "data" / "eval" / "chat-v0" / "replies" / "stock.jsonl"


@pytest.fixture(scope="module")
def pack() -> dict:
    return compliance.load_pack(PACK_PATH)


@pytest.fixture(scope="module")
def book():
    return load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml")


@pytest.fixture(scope="module")
def cases() -> dict[str, list[EvalCase]]:
    grouped: dict[str, list[EvalCase]] = {}
    for case in load_cases(CASES):
        grouped.setdefault(case.suite, []).append(case)
    return grouped


@pytest.fixture(scope="module")
def desk():
    return LawDesk(
        service_from_paths(CORPUS, embedder=HashingEmbedder(), reranker=LexicalReranker())
    )


def _mutated(case: EvalCase, **expect) -> EvalCase:
    return EvalCase(
        id=case.id,
        suite=case.suite,
        lang=case.lang,
        split=case.split,
        source=case.source,
        input=case.input,
        expect={**case.expect, **expect},
    )


# --------------------------------------------------------------------- scoring


def test_numbers_compare_at_display_precision_and_booleans_stay_strict() -> None:
    assert _same_value(1.801, 1.8)
    assert not _same_value(0.002, 1.8)
    assert _same_value(True, True)
    assert not _same_value(True, False)
    assert not _same_value(1, True)
    assert _same_value(" Dhanmondi ", "Dhanmondi")


def test_a_short_outcome_list_is_an_error_not_a_smaller_denominator() -> None:
    cases = [
        EvalCase(
            id="parse:a",
            suite="parse",
            lang="en",
            split="train",
            source={},
            input={"questionId": "area-name", "answerText": "x"},
            expect={"decision": "accept", "value": "x"},
        ),
        EvalCase(
            id="parse:b",
            suite="parse",
            lang="en",
            split="train",
            source={},
            input={"questionId": "area-name", "answerText": "y"},
            expect={"decision": "accept", "value": "y"},
        ),
    ]
    outcomes = [_score(cases[0], True, "x", "x")]
    with pytest.raises(EvalError, match="skipped"):
        _summarize("parse", cases, outcomes, model=False)


def test_an_outcome_for_an_unknown_case_is_an_error() -> None:
    cases = [
        EvalCase(
            id="parse:a",
            suite="parse",
            lang="en",
            split="train",
            source={},
            input={"questionId": "area-name", "answerText": "x"},
            expect={"decision": "accept", "value": "x"},
        ),
        EvalCase(
            id="parse:b",
            suite="parse",
            lang="en",
            split="train",
            source={},
            input={"questionId": "area-name", "answerText": "y"},
            expect={"decision": "accept", "value": "y"},
        ),
    ]
    stray = _score(cases[0], True, "x", "x")
    unknown = CaseOutcome(
        case_id="parse:not-in-the-file",
        suite="parse",
        lang="en",
        split="train",
        passed=True,
        got="z",
        want="z",
    )
    with pytest.raises(EvalError, match="unknown cases"):
        _summarize("parse", cases, [stray, unknown], model=False)


def test_language_breakdown_is_reported() -> None:
    case = EvalCase(
        id="parse:a",
        suite="parse",
        lang="bn",
        split="train",
        source={},
        input={"questionId": "area-name", "answerText": "x"},
        expect={"decision": "accept", "value": "x"},
    )
    result = _summarize("parse", [case], [_score(case, True, "x", "x")], model=False)
    assert result.metrics["accuracy:bn"] == 1.0
    assert "accuracy:en" not in result.metrics


# ------------------------------------------------------------------ rule.vector


def test_every_pack_vector_passes(cases, pack) -> None:
    result = run_rule_suite(cases["rule.vector"], pack)
    assert result.cases == len(cases["rule.vector"]) == 49
    assert result.passed == result.cases
    assert not result.failures


def test_a_vector_that_left_the_pack_fails_loudly(cases, pack) -> None:
    case = _mutated(cases["rule.vector"][0])
    broken = EvalCase(
        id=case.id,
        suite=case.suite,
        lang=case.lang,
        split=case.split,
        source=case.source,
        input={**case.input, "vector": "vector-that-does-not-exist"},
        expect=case.expect,
    )
    result = run_rule_suite([broken], pack)
    assert result.failed == 1
    assert "missing from the pack" in result.failures[0].reason


# ----------------------------------------------------------------------- parse


def test_parse_replay_accounts_for_every_recorded_answer(cases, book) -> None:
    result = run_parse_suite(cases["parse"], book)
    assert result.cases == len(cases["parse"])
    assert result.metrics["neverStalled"] == 1.0
    assert result.metrics["agreement:clean"] == 1.0
    assert len(result.failures) == result.failed


def test_a_wrong_expectation_is_a_failure_not_a_crash(cases, book) -> None:
    clean = next(case for case in cases["parse"] if case.input.get("operator") in (None, "clean"))
    broken = _mutated(clean, decision="escalate")
    result = run_parse_suite([broken], book)
    assert result.failed == 1
    assert "escalate" in result.failures[0].reason


def test_an_unknown_question_is_a_failed_case_and_a_stall(cases, book) -> None:
    clean = cases["parse"][0]
    broken = EvalCase(
        id=clean.id,
        suite=clean.suite,
        lang=clean.lang,
        split=clean.split,
        source=clean.source,
        input={"questionId": "no-such-question", "answerText": "x"},
        expect=clean.expect,
    )
    result = run_parse_suite([broken], book)
    assert result.failed == 1
    assert result.metrics["neverStalled"] == 0.0


def test_a_pointer_drift_is_caught(cases, book) -> None:
    clean = next(case for case in cases["parse"] if case.input.get("operator") in (None, "clean"))
    broken = _mutated(clean, pointer="/somewhere/else")
    result = run_parse_suite([broken], book)
    assert result.failed == 1
    assert "pointer" in result.failures[0].reason


# ------------------------------------------------------------------ model.safety


def test_the_safety_suite_contains_every_wrong_reading(cases, book) -> None:
    """The recorded replies replayed through the app's seam: no wrong write, ever."""
    replies = load_replies(REPLIES)
    result = run_model_safety_suite(cases["model.safety"], replies, book)
    assert result.cases == 60
    assert result.failed == 0
    assert result.metrics["safeWriteRate"] == 1.0
    # The stock model is wrong often, and the seam refuses those readings visibly.
    assert result.metrics["refusalRate"] > 0.0
    assert result.metrics["wrongWrites"] == 0


def test_the_suites_own_check_catches_a_wrong_write(cases, book) -> None:
    """The suite re-derives the yardstick itself, so a seam bug cannot hide a wrong write."""
    case = next(
        item
        for item in cases["model.safety"]
        if item.input["questionId"] == "plot-area"
    )
    question = book.question(case.input["questionId"])
    text = case.input["answerText"]
    assert _writes_what_the_user_said(question, 100.0, text) is False
    assert _writes_what_the_user_said(question, 334.45, "5 কাঠা") is True


# ------------------------------------------------------------------ model.parse


def test_the_recorded_stock_replies_score(cases) -> None:
    replies = load_replies(REPLIES)
    result = run_model_suite(cases["model.parse"], replies)
    assert result.cases == 60
    # A case passes only when the decision *and* the accepted value are right, so the
    # decision-only rate can never be lower than the pass rate.
    assert result.metrics["decisionAccuracy"] >= result.passed / result.cases
    assert result.metrics["valueAccuracy"] <= result.metrics["decisionAccuracy"]


def test_a_missing_reply_is_a_failed_case(cases) -> None:
    result = run_model_suite(cases["model.parse"][:2], {})
    assert result.failed == 2
    assert "no recorded reply" in result.failures[0].reason


def test_a_reply_that_is_not_json_is_a_failed_case(cases) -> None:
    case = cases["model.parse"][0]
    result = run_model_suite([case], {case.id: "I think the answer is 42"})
    assert result.failed == 1
    assert "not a JSON object" in result.failures[0].reason


def test_a_fenced_json_object_is_accepted(cases) -> None:
    case = cases["model.parse"][0]
    reply = "```json\n" + json.dumps({"decision": case.expect["decision"], "value": case.expect.get("value")}) + "\n```"
    result = run_model_suite([case], {case.id: reply})
    assert result.passed == 1


def test_a_wrong_decision_fails_even_with_a_good_value(cases) -> None:
    case = cases["model.parse"][0]
    reply = json.dumps({"decision": "escalate", "value": case.expect.get("value")})
    result = run_model_suite([case], {case.id: reply})
    assert result.failed == 1
    assert "decision 'escalate'" in result.failures[0].reason


def test_a_wrong_value_fails_and_moves_value_accuracy(cases) -> None:
    case = next(case for case in cases["model.parse"] if case.expect["decision"] == "accept")
    reply = json.dumps({"decision": "accept", "value": "definitely-wrong"})
    result = run_model_suite([case], {case.id: reply})
    assert result.failed == 1
    assert result.metrics["valueAccuracy"] == 0.0


def test_value_accuracy_is_absent_without_accepted_values(cases) -> None:
    case = next(case for case in cases["model.parse"] if case.expect["decision"] != "accept")
    reply = json.dumps({"decision": case.expect["decision"], "value": case.expect.get("value")})
    result = run_model_suite([case], {case.id: reply})
    assert result.passed == 1
    assert "valueAccuracy" not in result.metrics


def test_load_replies_rejects_a_missing_file_and_bad_rows(tmp_path) -> None:
    with pytest.raises(EvalError, match="record_ baseline|record_baseline"):
        load_replies(tmp_path / "missing.jsonl")
    path = tmp_path / "rows.jsonl"
    path.write_text('{"caseId": "a", "reply": 1}\n', encoding="utf-8")
    with pytest.raises(EvalError, match="reply must be"):
        load_replies(path)
    path.write_text("{oops\n", encoding="utf-8")
    with pytest.raises(EvalError, match="not valid JSON"):
        load_replies(path)
    path.write_text('{"caseId": "", "reply": "x"}\n', encoding="utf-8")
    with pytest.raises(EvalError, match="missing caseId"):
        load_replies(path)


# ------------------------------------------------------------------------- rag


def test_every_authored_rag_case_is_retrieved_or_declared(cases, desk) -> None:
    result = run_rag_suite(cases["rag"], desk)
    assert result.cases == len(cases["rag"])
    assert result.metrics["citationRecall"] == 1.0
    assert result.metrics["abstentionAccuracy"] == 1.0
    assert result.passed == result.cases


def test_a_wrong_doc_id_fails_with_the_miss_reason(cases, desk) -> None:
    case = next(case for case in cases["rag"] if case.expect["mode"] == "answer")
    broken = _mutated(case, docId="rajuk@2008.1:provision:not-a-document:en")
    result = run_rag_suite([broken], desk)
    assert result.failed == 1
    assert "not in top-5" in result.failures[0].reason


def test_abstention_metric_is_absent_without_gap_cases(cases, desk) -> None:
    case = next(case for case in cases["rag"] if case.expect["mode"] == "answer")
    result = run_rag_suite([case], desk)
    assert "abstentionAccuracy" not in result.metrics


def test_answering_a_declared_gap_is_a_failure(cases, desk) -> None:
    case = next(case for case in cases["rag"] if case.expect["mode"] == "declared_gap")
    broken = _mutated(case, mode="answer")
    result = run_rag_suite([broken], desk)
    assert result.failed == 1
    assert "status 'declared_gap' != 'retrieved'" in result.failures[0].reason


# -------------------------------------------------------------------- scenario


def test_the_bn_demo_scenario_reaches_the_frozen_end_state(cases) -> None:
    case = next(case for case in cases["scenario"] if case.lang == "bn")
    result = run_scenario_suite([case], ROOT)
    assert result.passed == 1, result.failures


def test_a_scenario_expectation_drift_is_a_failure(cases) -> None:
    case = next(case for case in cases["scenario"] if case.lang == "en")
    broken = _mutated(case, steps=case.expect["steps"] + 1)
    result = run_scenario_suite([broken], ROOT)
    assert result.failed == 1
    assert "steps" in result.failures[0].reason


# -------------------------------------------------------------------- register


def test_every_register_round_trip_passes(cases, pack) -> None:
    result = run_register_suite(cases["register"], pack, PACK_PATH, ROOT)
    assert result.cases == 3
    assert result.passed == 3, result.failures


def test_a_register_entry_that_does_not_exist_fails(cases, pack) -> None:
    broken = _mutated(cases["register"][0], entryId="dev-not-a-real-entry")
    result = run_register_suite([broken], pack, PACK_PATH, ROOT)
    assert result.failed == 1
    assert "missing" in result.failures[0].reason


def test_a_restore_value_drift_fails(cases, pack) -> None:
    case = cases["register"][0]
    broken = _mutated(case, restoreValue=float(case.expect["restoreValue"]) + 5)
    result = run_register_suite([broken], pack, PACK_PATH, ROOT)
    assert result.failed == 1
    assert "restored" in result.failures[0].reason


# ---------------------------------------------------------------------- report


def _suite(name: str, cases: int, passed: int, **metrics):
    entries = [
        EvalCase(
            id=f"{name}:{index}",
            suite=name,
            lang="en",
            split="holdout",
            source={},
            input={},
            expect={},
        )
        for index in range(cases)
    ]
    outcomes = [
        _score(case, index < passed, None, None, "" if index < passed else "failed")
        for index, case in enumerate(entries)
    ]
    return _summarize(name, entries, outcomes, model=False, metrics=metrics)


def test_report_fails_when_a_gate_fails() -> None:
    suite = _suite("rag", 2, 1)
    report = build_report(
        suites=[suite],
        cases=[EvalCase(id=f"rag:{i}", suite="rag", lang="en", split="holdout", source={}, input={}, expect={}) for i in range(2)],
        gates=[{"suite": "rag", "metric": "accuracy", "floor": 1.0}],
        model="stock",
        pins={"casesSha256": "x"},
    )
    assert report["ok"] is False
    assert report["gates"][0]["ok"] is False
    assert report["cases"]["complete"] is True


def test_report_rejects_a_gate_naming_something_that_does_not_exist() -> None:
    suite = _suite("rag", 1, 1)
    with pytest.raises(EvalError, match="unknown suite"):
        build_report(suites=[suite], cases=[], gates=[{"suite": "nope", "metric": "accuracy", "floor": 1.0}], model=None, pins={})
    with pytest.raises(EvalError, match="no such metric"):
        build_report(suites=[suite], cases=[], gates=[{"suite": "rag", "metric": "nope", "floor": 1.0}], model=None, pins={})


def test_report_passes_when_every_gate_holds() -> None:
    suite = _suite("rag", 2, 2)
    report = build_report(
        suites=[suite],
        cases=[EvalCase(id=f"rag:{i}", suite="rag", lang="en", split="holdout", source={}, input={}, expect={}) for i in range(2)],
        gates=[{"suite": "rag", "metric": "accuracy", "floor": 1.0}],
        model=None,
        pins={},
        coverage_probes=[{"lang": "en", "query": "q", "note": "n"}],
    )
    assert report["ok"] is True
    assert report["coverageProbes"][0]["topHit"] is None


def test_the_report_document_is_stable_and_markdown_names_the_gates() -> None:
    suite = _suite("rag", 1, 0)
    report = build_report(
        suites=[suite],
        cases=[EvalCase(id="rag:0", suite="rag", lang="en", split="holdout", source={}, input={}, expect={})],
        gates=[{"suite": "rag", "metric": "accuracy", "floor": 1.0}],
        model="stock",
        pins={},
    )
    text = dumps_report(report)
    assert text.endswith("\n")
    assert text == dumps_report(json.loads(text))
    markdown = render_markdown(report)
    assert "FAIL" in markdown
    assert "| rag |" in markdown
    assert "rag:0" in markdown


def test_eval_clock_is_fixed_so_scenarios_are_reproducible() -> None:
    assert EVAL_AT.endswith("+06:00")


# ------------------------------------------------------------------------ the CLI


def _cli(*args: str, encoding: str = "utf-8", env_overrides: dict | None = None):
    import os
    import subprocess
    import sys

    env = dict(os.environ)
    env.update(env_overrides or {})
    return subprocess.run(
        [sys.executable, *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding=encoding,
        errors="replace",
        env=env,
        timeout=600,
    )


def test_the_eval_cli_passes_on_the_committed_set() -> None:
    result = _cli(str(ROOT / "tools" / "eval" / "run_eval.py"))
    assert result.returncode == 0, result.stdout + result.stderr
    # the golden project is the 716th case (715 in the frozen set + the golden run)
    assert "716/716 cases" in result.stdout
    # the plan's v1 gates are live: the BOQ band, and the engineer's check as a named pending gate
    assert "gate golden/boqDeviationPct" in result.stdout
    assert "gate golden/engineerCheckSigned" in result.stdout
    assert "[PENDING (owner item #9)]" in result.stdout
    assert "PASS" in result.stdout


def test_the_eval_cli_refuses_a_reply_file_that_does_not_match_its_pin(
    tmp_path: pathlib.Path,
) -> None:
    source = ROOT / "data" / "eval" / "chat-v0" / "replies" / "stock.jsonl"
    tampered = tmp_path / "stock.jsonl"
    # Append one byte: still valid JSONL (a blank line is ignored), definitely not the pinned
    # bytes. A content-string replace is fragile: it can silently not match, and a CRLF checkout
    # can then make the copy differ by line endings alone (a false pass on Windows, a failure on
    # Linux). The pin is over bytes, so the test must change bytes.
    tampered.write_bytes(source.read_bytes() + b"\n")
    result = _cli(
        str(ROOT / "tools" / "eval" / "run_eval.py"),
        "--model",
        "stock",
        "--replies",
        str(tampered),
        "--no-gates",
        "--no-probes",
    )
    assert result.returncode == 1
    assert "does not match the manifest pin" in result.stderr


def test_the_eval_cli_survives_a_cp1252_console() -> None:
    """Failures and probes carry Bangla queries; a captured cp1252 stdout must not raise."""
    result = _cli(
        str(ROOT / "tools" / "eval" / "run_eval.py"),
        encoding="cp1252",
        env_overrides={"PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"},
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "UnicodeEncodeError" not in result.stderr


def test_the_case_builder_check_is_the_ci_invariant() -> None:
    result = _cli(str(ROOT / "tools" / "eval" / "build_cases.py"), "--check")
    assert result.returncode == 0, result.stdout + result.stderr
    assert "fresh" in result.stdout
