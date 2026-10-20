"""Run the eval suites and score them (W1.9).

Every suite answers one question about behaviour, through the *real* code path the app
uses — not a reimplementation:

``rule.vector``   the rule engine still gets the frozen answer for every pack vector
``parse``         the deterministic parser maps every recorded answer to its label
``model.parse``   a *recorded* model reply set still maps to the same labels
``rag``           the law desk retrieves the expected cited document, or refuses honestly
``scenario``      a demo scenario still walks the interview to the same end state
``register``      a deviation is registered, acknowledged, restored and synced

Scoring rules that keep the number honest:

- **Coverage is a gate.** Every case in the file must produce an outcome. A runner that
  scores fewer cases fails with ``EvalError`` instead of reporting a smaller denominator.
- **No exceptions are swallowed.** A case that raises is a *failed* case with the exception
  in its reason: "the sloppy input never stalls" is a measurement, not a promise.
- **A language breakdown is reported**, because a model that is good in English and broken
  in Bangla is not good enough for this product.
"""

from __future__ import annotations

import json
import pathlib
import re
import shutil
import tempfile
from dataclasses import dataclass
from typing import Any, Sequence

from .. import compliance
from ..agent import Session
from ..demo import DemoRunner, load_scenario
from ..interview import load_book
from ..interview.flow import FlowBook
from ..interview.parse import DECISIONS, parse_answer
from ..spec import apply_patch
from .cases import EvalCase, EvalError

HARNESS_VERSION = "eval-harness-0.1.0"
REPORT_SCHEMA_VERSION = "0.1.0"

#: Fixed revision clock so a scored scenario is byte-identical between runs.
EVAL_AT = "2026-10-20T00:00:00+06:00"

@dataclass(frozen=True)
class CaseOutcome:
    case_id: str
    suite: str
    lang: str | None
    split: str
    passed: bool
    got: Any
    want: Any
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "caseId": self.case_id,
            "suite": self.suite,
            "lang": self.lang,
            "split": self.split,
            "passed": self.passed,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class SuiteResult:
    name: str
    cases: int
    passed: int
    failed: int
    accuracy: float
    metrics: dict[str, float]
    model: bool
    failures: tuple[CaseOutcome, ...] = ()
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "cases": self.cases,
            "passed": self.passed,
            "failed": self.failed,
            "accuracy": self.accuracy,
            "metrics": dict(sorted(self.metrics.items())),
            "model": self.model,
            "note": self.note,
            "failures": [outcome.to_dict() for outcome in self.failures],
        }


def _score(
    case: EvalCase, passed: bool, got: Any, want: Any, reason: str = ""
) -> CaseOutcome:
    return CaseOutcome(
        case_id=case.id,
        suite=case.suite,
        lang=case.lang,
        split=case.split,
        passed=passed,
        got=got,
        want=want,
        reason=reason,
    )


def _same_value(got: Any, want: Any) -> bool:
    if isinstance(want, bool) or isinstance(got, bool):
        return got is want
    if want is None or got is None:
        return got is want
    if isinstance(want, (int, float)):
        number: Any = got
        if isinstance(got, str):
            try:
                number = float(got.strip())
            except ValueError:
                return False
        if not isinstance(number, (int, float)):
            return False
        # Numbers compare at the precision the app shows the user (two decimals); anything
        # finer is a conversion-rounding artefact, not a behavioural difference.
        return round(float(number), 2) == round(float(want), 2)
    return " ".join(str(got).split()) == " ".join(str(want).split())


def _lang_metrics(outcomes: Sequence[CaseOutcome]) -> dict[str, float]:
    metrics: dict[str, float] = {}
    for lang in ("bn", "en"):
        subset = [outcome for outcome in outcomes if outcome.lang == lang]
        if subset:
            metrics[f"accuracy:{lang}"] = round(
                sum(1 for outcome in subset if outcome.passed) / len(subset), 4
            )
    return metrics


def _summarize(
    name: str,
    cases: Sequence[EvalCase],
    outcomes: Sequence[CaseOutcome],
    *,
    model: bool,
    metrics: dict[str, float] | None = None,
    note: str = "",
) -> SuiteResult:
    if len(outcomes) != len(cases):
        raise EvalError(
            f"{name}: scored {len(outcomes)} of {len(cases)} cases - a case was skipped, "
            "and a skipped case is not a pass"
        )
    by_id = {case.id for case in cases}
    unknown = [outcome.case_id for outcome in outcomes if outcome.case_id not in by_id]
    if unknown:
        raise EvalError(f"{name}: scored unknown cases {sorted(unknown)[:3]}")
    passed = sum(1 for outcome in outcomes if outcome.passed)
    combined = {f"accuracy": round(passed / len(cases), 4)}
    combined.update(_lang_metrics(outcomes))
    combined.update(metrics or {})
    failures = tuple(sorted((o for o in outcomes if not o.passed), key=lambda o: o.case_id))
    return SuiteResult(
        name=name,
        cases=len(cases),
        passed=passed,
        failed=len(failures),
        accuracy=combined["accuracy"],
        metrics=combined,
        model=model,
        failures=failures,
        note=note,
    )


# ------------------------------------------------------------------ rule.vector


def run_rule_suite(cases: Sequence[EvalCase], pack: dict[str, Any]) -> SuiteResult:
    rows = {row["id"]: row for row in compliance.run_vectors(pack)}
    outcomes: list[CaseOutcome] = []
    for case in cases:
        vector = case.input["vector"]
        row = rows.get(vector)
        if row is None:
            outcomes.append(_score(case, False, None, True, "vector is missing from the pack"))
            continue
        outcomes.append(
            _score(
                case,
                bool(row["ok"]),
                {"ok": row["ok"], "got": row["got"]},
                {"ok": True, "expect": row["expect"]},
                "" if row["ok"] else "pack vector no longer matches its frozen expectation",
            )
        )
    return _summarize("rule.vector", cases, outcomes, model=False)


# ------------------------------------------------------------------------ parse


def _parse_book(root: pathlib.Path) -> FlowBook:
    return load_book(root / "spec" / "flows" / "phase-flow-book.yaml")


#: The two vocabularies name the same outcome: "the user does not know" (``skip`` is the
#: parser's word, ``fallback`` the dataset's). Mapping them is a vocabulary fix, not a pass.
DECISION_ALIASES = {"skip": "fallback", "default": "fallback"}


def _decision_agrees(parsed: str, want: str) -> bool:
    return DECISION_ALIASES.get(parsed, parsed) == want


def run_parse_suite(cases: Sequence[EvalCase], book: FlowBook) -> SuiteResult:
    """Replay every recorded answer through the *deterministic* parser.

    What is gated here is the parser's safety contract, not its reach: it must answer for
    every input (``neverStalled``), it must never accept a value the dataset does not
    accept, and it must never accept a *different* value than the one the dataset records.
    Where the parser asks again or escalates on an answer the dataset does accept, that is
    a **visible deferral** to the model seam - reported per input kind, because that gap is
    exactly what the ``model.parse`` suite has to close.

    ``unit`` is deliberately not compared: the dataset labels a canonical unit (``m2``),
    while ``ParseResult.unit`` is the unit the user typed. Comparing them would report a
    vocabulary difference as a bug.
    """
    by_id = book.by_id
    outcomes: list[CaseOutcome] = []
    per_operator: dict[str, list[int]] = {}
    stalled = 0

    for case in cases:
        question = by_id.get(case.input["questionId"])
        if question is None:
            stalled += 1
            outcomes.append(_score(case, False, None, case.expect, "unknown question id"))
            continue
        operator = case.input.get("operator") or "clean"
        bucket = per_operator.setdefault(operator, [0, 0])
        bucket[1] += 1
        try:
            parsed = parse_answer(question, case.input["answerText"])
        except Exception as exc:  # noqa: BLE001 - a raise *is* the failure being measured
            stalled += 1
            outcomes.append(_score(case, False, None, case.expect, f"raised {type(exc).__name__}: {exc}"))
            continue
        if parsed.decision not in DECISIONS:
            stalled += 1
            outcomes.append(
                _score(case, False, {"decision": parsed.decision}, case.expect, "decision is not in DECISIONS")
            )
            continue

        got = {
            "decision": parsed.decision,
            "value": parsed.value,
            "pointer": question.maps_to,
        }
        want_view = {
            "decision": case.expect["decision"],
            "value": case.expect.get("value"),
            "pointer": case.expect.get("pointer"),
        }
        if got["pointer"] != want_view["pointer"]:
            # The question-to-spec mapping drifted: that is a data bug, never a pass.
            outcomes.append(
                _score(case, False, got, want_view, f"pointer {got['pointer']!r} != {want_view['pointer']!r}")
            )
            continue
        if not _decision_agrees(parsed.decision, want_view["decision"]):
            outcomes.append(
                _score(
                    case,
                    False,
                    got,
                    want_view,
                    f"decision {parsed.decision!r} != {want_view['decision']!r} ({parsed.reason})"
                    + (" [deferral to the model seam]" if parsed.decision in ("ask_again", "escalate") else ""),
                )
            )
            continue
        if want_view["decision"] == "accept" and not _same_value(parsed.value, want_view["value"]):
            outcomes.append(
                _score(case, False, got, want_view, f"value {parsed.value!r} != {want_view['value']!r}")
            )
            continue
        bucket[0] += 1
        outcomes.append(_score(case, True, got, want_view))

    metrics: dict[str, float] = {"neverStalled": round(1 - stalled / len(cases), 4)}
    # The gaps that matter, per input kind - reported so a parser regression is visible even
    # when the overall agreement number barely moves.
    for operator in sorted(per_operator):
        passed, total = per_operator[operator]
        if total >= 5:
            metrics[f"agreement:{operator}"] = round(passed / total, 4)
    return _summarize("parse", cases, outcomes, model=False, metrics=metrics)


# ------------------------------------------------------------------ model.parse


def load_replies(path: str | pathlib.Path) -> dict[str, str]:
    """Load a recorded reply set: one ``{caseId, reply}`` per line."""
    file = pathlib.Path(path)
    if not file.is_file():
        raise EvalError(
            f"no recorded replies at {file} - run tools/eval/record_baseline.py first; "
            "an unmeasured model is not a passing model"
        )
    replies: dict[str, str] = {}
    for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise EvalError(f"{file.name} line {number}: not valid JSON: {exc}") from None
        case_id = row.get("caseId")
        reply = row.get("reply")
        if not isinstance(case_id, str) or not case_id:
            raise EvalError(f"{file.name} line {number}: missing caseId")
        if not isinstance(reply, str):
            raise EvalError(f"{file.name} line {number}: reply must be a string")
        replies[case_id] = reply
    return replies


_JSON_OBJECT = re.compile(r"\{.*\}", re.DOTALL)


def _reply_object(reply: str) -> dict[str, Any] | None:
    match = _JSON_OBJECT.search(reply)
    if not match:
        return None
    try:
        value = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def run_model_suite(cases: Sequence[EvalCase], replies: dict[str, str]) -> SuiteResult:
    outcomes: list[CaseOutcome] = []
    decision_ok = 0
    value_ok = 0
    value_total = 0
    for case in cases:
        reply = replies.get(case.id)
        if reply is None:
            outcomes.append(_score(case, False, None, case.expect, "no recorded reply for this case"))
            continue
        payload = _reply_object(reply)
        if payload is None:
            outcomes.append(_score(case, False, reply[:200], case.expect, "reply is not a JSON object"))
            continue
        got_decision = payload.get("decision")
        got_value = payload.get("value")
        same_decision = got_decision == case.expect["decision"]
        decision_ok += int(same_decision)
        # Accepting with the wrong value is the worst outcome the app can produce: the user
        # sees a clean confirmation and the spec quietly holds a number they never gave.
        checks_value = case.expect["decision"] == "accept" and case.expect.get("value") is not None
        same_value = not checks_value or _same_value(got_value, case.expect["value"])
        if checks_value:
            value_total += 1
            value_ok += int(same_value and same_decision)
        if not same_decision:
            outcomes.append(
                _score(
                    case,
                    False,
                    {"decision": got_decision, "value": got_value},
                    case.expect,
                    f"decision {got_decision!r} != {case.expect['decision']!r}",
                )
            )
        elif not same_value:
            outcomes.append(
                _score(
                    case,
                    False,
                    {"decision": got_decision, "value": got_value},
                    case.expect,
                    f"value {got_value!r} != {case.expect['value']!r} under accept",
                )
            )
        else:
            outcomes.append(_score(case, True, {"decision": got_decision, "value": got_value}, case.expect))
    metrics = {
        "decisionAccuracy": round(decision_ok / len(cases), 4),
    }
    # No accepted-value cases means no value measurement. Omitting the metric makes a gate
    # on it fail loudly ("the suite reports no such metric"); defaulting to 1.0 would let a
    # case-set edit pass a hard floor without measuring anything.
    if value_total:
        metrics["valueAccuracy"] = round(value_ok / value_total, 4)
    return _summarize("model.parse", cases, outcomes, model=True, metrics=metrics)


# -------------------------------------------------------------------------- rag


def run_rag_suite(cases: Sequence[EvalCase], desk: Any) -> SuiteResult:
    outcomes: list[CaseOutcome] = []
    cited = 0
    status_ok = 0
    gap_cases = 0
    for case in cases:
        want = case.expect
        try:
            answer = desk.ask(case.input["query"], k=5)
        except Exception as exc:  # noqa: BLE001 - a raise is a failed case, not a crash
            outcomes.append(_score(case, False, None, want, f"raised {type(exc).__name__}: {exc}"))
            continue
        doc_ids = [hit.doc_id for hit in answer.hits]
        got = {"status": answer.status, "docs": doc_ids, "degraded": list(answer.degraded)}
        in_top = want["docId"] in doc_ids
        cited += int(in_top)
        want_status = "declared_gap" if want["mode"] == "declared_gap" else "retrieved"
        same_status = answer.status == want_status
        status_ok += int(same_status)
        if want["mode"] == "declared_gap":
            gap_cases += 1
        if in_top and same_status:
            outcomes.append(_score(case, True, got, want))
        else:
            reason = (
                f"{want['docId']} not in top-5"
                if not in_top
                else f"status {answer.status!r} != {want_status!r}"
            )
            outcomes.append(_score(case, False, got, want, reason))
    metrics = {
        "citationRecall": round(cited / len(cases), 4),
        "statusAccuracy": round(status_ok / len(cases), 4),
    }
    # Same rule as valueAccuracy: no declared-gap cases means no abstention measurement.
    if gap_cases:
        metrics["abstentionAccuracy"] = round(
            sum(
                1
                for outcome, case in zip(outcomes, cases)
                if case.expect["mode"] == "declared_gap" and outcome.passed
            )
            / gap_cases,
            4,
        )
    return _summarize("rag", cases, outcomes, model=False, metrics=metrics)


# --------------------------------------------------------------------- scenario


def run_scenario_suite(
    cases: Sequence[EvalCase], root: pathlib.Path, workdir: pathlib.Path | None = None
) -> SuiteResult:
    book = _parse_book(root)
    outcomes: list[CaseOutcome] = []
    owned = workdir is None
    work = pathlib.Path(workdir or tempfile.mkdtemp(prefix="archres-eval-"))
    try:
        for index, case in enumerate(cases):
            want = case.expect
            try:
                scenario = load_scenario(root / case.input["scenario"], book)
                spec = scenario.spec()
                spec.setdefault("project", {})["language"] = scenario.language
                session = Session.create(
                    book,
                    work / f"scenario-{index}" / "store",
                    spec,
                    language=scenario.language,
                    flows=list(scenario.flows),
                    at=EVAL_AT,
                )
                report = DemoRunner(session, scenario).run()
            except Exception as exc:  # noqa: BLE001 - a failed scenario is a failed case
                outcomes.append(_score(case, False, None, want, f"raised {type(exc).__name__}: {exc}"))
                continue
            got = {
                "steps": report.steps,
                "coverage": len(report.coverage),
                "openEssential": list(report.open_essential),
                "decisions": dict(sorted(report.decisions.items())),
                "revision": (report.revision or {}).get("number"),
            }
            problems = [
                f"{key}: {got[key]!r} != {want[key]!r}"
                for key in ("steps", "coverage", "openEssential", "decisions", "revision")
                if got[key] != want[key]
            ]
            outcomes.append(_score(case, not problems, got, want, "; ".join(problems)))
    finally:
        if owned:
            shutil.rmtree(work, ignore_errors=True)
    return _summarize("scenario", cases, outcomes, model=False)


# --------------------------------------------------------------------- register


def run_register_suite(
    cases: Sequence[EvalCase], pack: dict[str, Any], pack_path: pathlib.Path, root: pathlib.Path
) -> SuiteResult:
    outcomes: list[CaseOutcome] = []
    for case in cases:
        want = case.expect
        spec = json.loads((root / case.input["spec"]).read_text(encoding="utf-8"))
        try:
            deviating = apply_patch(spec, case.input["ops"], provenance={"source": "user"}, at=EVAL_AT)
            verdict_set = _evaluate(deviating, pack, pack_path)
            verdict = next(
                (
                    row
                    for row in verdict_set["verdicts"]
                    if (row.get("measured") or {}).get("path") == want["pointer"]
                ),
                None,
            )
            if verdict is None:
                outcomes.append(_score(case, False, None, want, "no verdict for the pointer"))
                continue
            registered = compliance.apply_register(deviating, verdict_set, at=EVAL_AT)
            entry_ids = [item["id"] for item in registered.get("deviations", [])]
            entry = next((item for item in registered.get("deviations", []) if item["id"] == want["entryId"]), None)
            if entry is None:
                outcomes.append(
                    _score(case, False, {"entryIds": entry_ids}, want, f"register is missing {want['entryId']!r}")
                )
                continue
            quiet_index = entry_ids.index(entry["id"])

            acknowledged = apply_patch(
                registered,
                [
                    {"op": "add", "path": f"/deviations/{quiet_index}/rationale", "value": "Accepted by owner."},
                    {"op": "replace", "path": f"/deviations/{quiet_index}/acknowledged", "value": True},
                ],
                provenance={"source": "user"},
                at=EVAL_AT,
            )
            re_run = _evaluate(acknowledged, pack, pack_path)
            synced = compliance.apply_register(acknowledged, re_run, at=EVAL_AT)
            kept = next(item for item in synced["deviations"] if item["id"] == want["entryId"])

            restored = compliance.restore_patch(synced, verdict, at=EVAL_AT)
            after = compliance.apply_register(restored, _evaluate(restored, pack, pack_path), at=EVAL_AT)
            after_ids = [entry["id"] for entry in after.get("deviations", [])]
            idempotent = compliance.register_ops(synced, re_run, at=EVAL_AT) == []
        except Exception as exc:  # noqa: BLE001 - a failed round-trip is a failed case
            outcomes.append(_score(case, False, None, want, f"raised {type(exc).__name__}: {exc}"))
            continue

        got = {
            "status": verdict.get("status"),
            "ruleRef": verdict.get("ruleRef"),
            "restoredValue": _value_at(restored, want["pointer"]),
            "entryIds": entry_ids,
            "remainingAfterRestore": after_ids,
            "acknowledged": kept.get("acknowledged"),
            "rationale": kept.get("rationale"),
            "idempotent": idempotent,
        }
        problems = []
        if verdict.get("status") != "deviation":
            problems.append(f"status {verdict.get('status')!r} != 'deviation'")
        if verdict.get("ruleRef") != want["ruleRef"]:
            problems.append(f"ruleRef {verdict.get('ruleRef')!r} != {want['ruleRef']!r}")
        if entry is None:
            problems.append(f"register is missing {want['entryId']!r}")
        if not _same_value(got["restoredValue"], want["restoreValue"]):
            problems.append(f"restored {got['restoredValue']!r} != {want['restoreValue']!r}")
        if after_ids != list(want["remainingAfterRestore"]):
            problems.append(f"after restore {after_ids!r} != {list(want['remainingAfterRestore'])!r}")
        if kept.get("acknowledged") is not True or kept.get("rationale") != "Accepted by owner.":
            problems.append("the acknowledgement was not kept across the re-run")
        if not idempotent:
            problems.append("a synced register still emitted ops")
        outcomes.append(_score(case, not problems, got, want, "; ".join(problems)))
    return _summarize("register", cases, outcomes, model=False)


def _evaluate(spec: dict[str, Any], pack: dict[str, Any], pack_path: pathlib.Path) -> dict[str, Any]:
    return compliance.evaluate_spec(spec, pack, pack_path=pack_path, evaluated_at=EVAL_AT)


def _value_at(spec: dict[str, Any], pointer: str) -> Any:
    node: Any = spec
    for token in pointer.strip("/").split("/"):
        if isinstance(node, list):
            if token.isdigit():
                node = node[int(token)]
            else:
                node = next(item for item in node if item.get("id") == token)
        else:
            node = node[token]
    return node


# ---------------------------------------------------------------------- report


def build_report(
    *,
    suites: Sequence[SuiteResult],
    cases: Sequence[EvalCase],
    gates: Sequence[dict[str, Any]],
    model: str | None,
    pins: dict[str, Any],
    coverage_probes: Sequence[dict[str, Any]] = (),
    desk: Any = None,
) -> dict[str, Any]:
    scored = sum(suite.cases for suite in suites)
    gate_rows = []
    for gate in gates:
        suite = next((row for row in suites if row.name == gate["suite"]), None)
        if suite is None:
            raise EvalError(f"gate names an unknown suite {gate['suite']!r}")
        value = suite.metrics.get(gate["metric"])
        if value is None:
            raise EvalError(f"gate {gate['suite']}/{gate['metric']}: the suite reports no such metric")
        gate_rows.append(
            {
                "suite": gate["suite"],
                "metric": gate["metric"],
                "floor": gate["floor"],
                "value": value,
                "ok": value >= gate["floor"],
                "note": gate.get("note", ""),
            }
        )

    probes = []
    for probe in coverage_probes:
        row: dict[str, Any] = {
            "lang": probe["lang"],
            "query": probe["query"],
            "note": probe.get("note", ""),
            "topHit": None,
            "topScore": None,
        }
        if desk is not None:
            try:
                answer = desk.ask(probe["query"], k=3)
                if answer.hits:
                    row["topHit"] = answer.hits[0].doc_id
                    row["topScore"] = answer.hits[0].scores.get("fused")
            except Exception as exc:  # noqa: BLE001 - a probe is evidence, not a gate
                row["note"] = f"{row['note']} (probe raised {type(exc).__name__}: {exc})".strip()
        probes.append(row)

    return {
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "harnessVersion": HARNESS_VERSION,
        "model": model,
        "pins": dict(sorted(pins.items())),
        "cases": {"expected": len(cases), "scored": scored, "complete": scored == len(cases)},
        "suites": [suite.to_dict() for suite in suites],
        "gates": gate_rows,
        "coverageProbes": probes,
        "ok": scored == len(cases) and all(row["ok"] for row in gate_rows),
    }


def dumps_report(report: dict[str, Any]) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Eval report — harness " + report["harnessVersion"],
        "",
        f"model: **{report['model'] or 'none (deterministic only)'}** · "
        f"cases: {report['cases']['scored']}/{report['cases']['expected']} · "
        f"**{'PASS' if report['ok'] else 'FAIL'}**",
        "",
        "| suite | cases | passed | accuracy | model |",
        "|---|---|---|---|---|",
    ]
    for suite in report["suites"]:
        lines.append(
            f"| {suite['name']} | {suite['cases']} | {suite['passed']} | "
            f"{suite['accuracy']:.3f} | {'yes' if suite['model'] else 'no'} |"
        )
    lines += ["", "## Gates", "", "| suite | metric | floor | value | ok |", "|---|---|---|---|---|"]
    for gate in report["gates"]:
        lines.append(
            f"| {gate['suite']} | {gate['metric']} | {gate['floor']:.3f} | "
            f"{gate['value']:.3f} | {'yes' if gate['ok'] else '**NO**'} |"
        )
    if report.get("coverageProbes"):
        lines += [
            "",
            "## Coverage probes (reported, not gated)",
            "",
            "| lang | question | top hit | note |",
            "|---|---|---|---|",
        ]
        for probe in report["coverageProbes"]:
            lines.append(
                f"| {probe['lang']} | {probe['query']} | {probe['topHit'] or '—'} | {probe['note']} |"
            )
    failures = [
        (suite["name"], failure)
        for suite in report["suites"]
        for failure in suite["failures"]
    ]
    if failures:
        lines += ["", "## Failures", ""]
        for suite_name, failure in failures[:60]:
            lines.append(f"- `{suite_name}` `{failure['caseId']}`: {failure['reason']}")
        if len(failures) > 60:
            lines.append(f"- … and {len(failures) - 60} more")
    return "\n".join(lines) + "\n"


__all__ = [
    "CaseOutcome",
    "EVAL_AT",
    "HARNESS_VERSION",
    "REPORT_SCHEMA_VERSION",
    "SuiteResult",
    "build_report",
    "dumps_report",
    "load_replies",
    "render_markdown",
    "run_model_suite",
    "run_parse_suite",
    "run_rag_suite",
    "run_register_suite",
    "run_rule_suite",
    "run_scenario_suite",
]
