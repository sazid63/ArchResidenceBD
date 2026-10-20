"""Run a CAD case set and report it (W1.8).

Two layers, on purpose:

* **suite** - offline, no engine. Every case must be loadable, its script must exist, and the
  expectation must demand something real. This layer runs in the ordinary Python test job and
  in CI everywhere, so a broken case file or a candidate that vanished cannot hide behind
  "the runner had no CAD today".
* **execution** - needs a CAD engine. Each case runs the candidate headless and the measured
  document is scored. When a case claims ``determinism``, the candidate runs **twice** and the
  two verdict signatures must match exactly (plan §9: identical outputs under optimisation).

``run_execution`` never silently degrades: a missing engine is an error the caller sees.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import tempfile
from dataclasses import dataclass, field
from typing import Any, Iterable

from .cases import CadCase, CadError, load_cases
from .engine import EngineInfo, find_engine
from .runner import RunOutcome, run_candidate
from .verify import CaseVerdict, verify_result

__all__ = [
    "SuiteReport",
    "ExecutionReport",
    "check_cases",
    "run_execution",
    "dumps_report",
    "render_markdown",
    "artifact_tree_sha",
]

REPORT_VERSION = "cad-verify-0.1.0"


@dataclass
class SuiteReport:
    """Offline statement about the case set."""

    root: pathlib.Path
    cases: list[CadCase]
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failures

    def as_dict(self) -> dict[str, Any]:
        return {
            "reportVersion": REPORT_VERSION,
            "layer": "suite",
            "ok": self.ok,
            "cases": len(self.cases),
            "kinds": _counts(case.kind for case in self.cases),
            "determinism": sum(1 for case in self.cases if case.determinism),
            "failures": list(self.failures),
            "warnings": list(self.warnings),
        }


@dataclass
class CaseRun:
    """A case's outcome plus the runs behind it."""

    case: CadCase
    verdict: CaseVerdict
    outcomes: list[RunOutcome]
    determinism_ok: bool | None = None
    determinism_note: str = ""

    @property
    def ok(self) -> bool:
        return self.verdict.ok and self.determinism_ok is not False

    def as_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "caseId": self.case.id,
            "kind": self.case.kind,
            "script": str(self.case.script),
            "ok": self.ok,
            "determinism": self.determinism_ok,
            "runs": [outcome.duration_ms for outcome in self.outcomes],
            "verdict": self.verdict.as_dict(),
        }
        if self.determinism_note:
            payload["determinismNote"] = self.determinism_note
        return payload


@dataclass
class ExecutionReport:
    """Everything the execution layer measured, plus where each run's evidence lives."""

    engine: EngineInfo | None
    runs: list[CaseRun]
    workdir: pathlib.Path
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors and all(run.ok for run in self.runs)

    @property
    def passed(self) -> int:
        return sum(1 for run in self.runs if run.ok)

    @property
    def total(self) -> int:
        return len(self.runs)

    @property
    def accuracy(self) -> float:
        return round(self.passed / self.total, 4) if self.total else 0.0

    def failures(self) -> list[dict[str, Any]]:
        return [run.as_dict() for run in self.runs if not run.ok]

    def as_dict(self) -> dict[str, Any]:
        return {
            "reportVersion": REPORT_VERSION,
            "layer": "execution",
            "ok": self.ok,
            "engine": str(self.engine.path) if self.engine else None,
            "engineSource": self.engine.source if self.engine else None,
            "engineVersion": next(
                (run.verdict.engine_version for run in self.runs if run.verdict.engine_version),
                None,
            ),
            "cases": self.total,
            "passed": self.passed,
            "accuracy": self.accuracy,
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "runs": [run.as_dict() for run in self.runs],
        }


def _counts(values: Iterable[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for value in values:
        out[str(value)] = out.get(str(value), 0) + 1
    return dict(sorted(out.items()))


def check_cases(
    path: str | pathlib.Path,
    *,
    root: str | pathlib.Path | None = None,
) -> SuiteReport:
    """Offline check of a case set: shape, script presence, and honest expectations."""
    report = SuiteReport(root=pathlib.Path(root or "."), cases=[])
    try:
        cases = load_cases(path, root=root)
    except CadError as exc:
        report.failures.append(str(exc))
        return report
    report.cases = cases
    for case in cases:
        if not case.script.is_file():
            report.failures.append(f"{case.id}: candidate script is missing: {case.script}")
            continue
        if case.script.suffix.lower() != ".py":
            report.failures.append(f"{case.id}: candidate is not a Python macro: {case.script}")
        if not case.notes:
            report.warnings.append(f"{case.id}: no notes (why does this case exist?)")
    if not cases:
        report.failures.append("the case set is empty")
    return report


def artifact_tree_sha(directory: pathlib.Path) -> str:
    """Hash a directory's contents (relative path + bytes) - for byte-stability claims."""
    digest = hashlib.sha256()
    for file in sorted(directory.rglob("*")):
        if file.is_file():
            digest.update(file.relative_to(directory).as_posix().encode("utf-8"))
            digest.update(b"\0")
            digest.update(file.read_bytes())
            digest.update(b"\0")
    return digest.hexdigest()


def run_execution(
    cases: list[CadCase],
    *,
    engine: EngineInfo | None = None,
    workdir: str | pathlib.Path | None = None,
    keep: bool = False,
    launcher: str | pathlib.Path | None = None,
) -> ExecutionReport:
    """Execute every case headless; determinism cases run twice and must match exactly."""
    if engine is None:
        try:
            engine = find_engine()
        except CadError as exc:
            return ExecutionReport(
                engine=None,
                runs=[],
                workdir=pathlib.Path(workdir or "."),
                errors=[str(exc)],
            )
    root = pathlib.Path(workdir) if workdir is not None else pathlib.Path(tempfile.mkdtemp(prefix="cad-verify-"))
    root.mkdir(parents=True, exist_ok=True)
    runs: list[CaseRun] = []
    for case in cases:
        case_dir = root / case.id
        if case_dir.exists() and not keep:  # never reuse evidence from an earlier run
            shutil.rmtree(case_dir)
        params = {"kind": case.kind, "params": case.params, "caseId": case.id}
        first = run_candidate(
            engine,
            case.script,
            params,
            case_dir / "run1",
            timeout_ms=case.timeout_ms,
            launcher=launcher,
        )
        verdict = verify_result(case, first)
        outcomes = [first]
        determinism_ok: bool | None = None
        note = ""
        if case.determinism:
            second = run_candidate(
                engine,
                case.script,
                params,
                case_dir / "run2",
                timeout_ms=case.timeout_ms,
                launcher=launcher,
            )
            outcomes.append(second)
            second_verdict = verify_result(case, second)
            first_signature = verdict.signature()
            second_signature = second_verdict.signature()
            determinism_ok = first_signature == second_signature
            if not determinism_ok:
                note = _signature_diff(first_signature, second_signature)
            else:
                first_tree = artifact_tree_sha(first.artifacts_dir)
                second_tree = artifact_tree_sha(second.artifacts_dir)
                if first_tree != second_tree:
                    determinism_ok = False
                    note = (
                        "artifact bytes differ between two runs "
                        f"({first_tree[:12]} != {second_tree[:12]})"
                    )
        runs.append(
            CaseRun(
                case=case,
                verdict=verdict,
                outcomes=outcomes,
                determinism_ok=determinism_ok,
                determinism_note=note,
            )
        )
    # Scratch runs are left in the OS temp directory on purpose: a failing run's directory is
    # the evidence a repair step trains on, and the report points at it either way.
    return ExecutionReport(engine=engine, runs=runs, workdir=root)


def _signature_diff(first: dict[str, Any], second: dict[str, Any]) -> str:
    parts: list[str] = []
    if first.get("code") != second.get("code"):
        parts.append(f"code {first.get('code')!r} != {second.get('code')!r}")
    if first.get("totals") != second.get("totals"):
        parts.append(f"totals {first.get('totals')} != {second.get('totals')}")
    if first.get("artifactHashes") != second.get("artifactHashes"):
        parts.append("artifact hashes differ")
    if first.get("failures") != second.get("failures"):
        parts.append("failure sets differ")
    return "; ".join(parts) or "verdicts differ"


def dumps_report(report: ExecutionReport | SuiteReport) -> str:
    return json.dumps(report.as_dict(), ensure_ascii=False, indent=1, sort_keys=True) + "\n"


def render_markdown(report: ExecutionReport | SuiteReport) -> str:
    """A short human report; the JSON is authoritative, this is for a log or a PR."""
    payload = report.as_dict()
    lines = [f"# CAD verify ({payload['layer']})", ""]
    if payload["layer"] == "suite":
        lines.append(f"- cases: {payload['cases']} ({payload['determinism']} determinism)")
        lines.append(f"- kinds: {payload['kinds']}")
        lines.append(f"- **{'PASS' if payload['ok'] else 'FAIL'}**")
        for failure in payload["failures"]:
            lines.append(f"  - {failure}")
        for warning in payload["warnings"]:
            lines.append(f"  - (warning) {warning}")
        return "\n".join(lines) + "\n"
    lines.append(f"- engine: `{payload['engine']}` ({payload['engineSource']}, {payload['engineVersion']})")
    lines.append(f"- cases: {payload['passed']}/{payload['cases']} passed (accuracy {payload['accuracy']})")
    for error in payload["errors"]:
        lines.append(f"- error: {error}")
    for run in payload["runs"]:
        mark = "PASS" if run["ok"] else "FAIL"
        timing = ", ".join(f"{value / 1000.0:.2f}s" for value in run["runs"])
        lines.append(f"- {mark} `{run['caseId']}` ({timing})")
        for failure in run["verdict"]["failures"]:
            lines.append(f"    - {failure['check']}: {failure['message']}")
        if run["determinism"] is False:
            lines.append(f"    - determinism: {run.get('determinismNote', 'verdicts differ')}")
    return "\n".join(lines) + "\n"
