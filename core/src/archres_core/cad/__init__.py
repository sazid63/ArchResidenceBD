"""CAD execution-verify harness v0 (W1.8) - run candidate scripts headless, measure, judge.

Layers: ``engine`` (locate ``freecadcmd``), ``runner`` (one engine process, deadline,
measured result), ``launcher`` (runs *inside* the engine), ``cases`` (case model),
``verify`` (expectations -> failures with evidence), ``suite`` (offline + execution layers).

Nothing here imports FreeCAD: the engine is a subprocess, and this package stays importable
on a machine with no CAD installed. The harness is the trusted judge - a candidate script
builds geometry and never reports its own numbers.

See docs/spec/cad-verify-v0.md and ADR-0016.
"""

from __future__ import annotations

from .cases import Bounds, CadCase, CadError, ObjectExpectation, load_case_document, load_cases
from .engine import ENV_VAR, EngineInfo, EngineMissing, find_engine
from .runner import RunOutcome, run_candidate
from .suite import (
    REPORT_VERSION,
    CaseRun,
    ExecutionReport,
    SuiteReport,
    artifact_tree_sha,
    check_cases,
    dumps_report,
    render_markdown,
    run_execution,
)
from .verify import CaseVerdict, Failure, verify_result

__all__ = [
    "Bounds",
    "CadCase",
    "CadError",
    "CaseRun",
    "CaseVerdict",
    "ENV_VAR",
    "EngineInfo",
    "EngineMissing",
    "ExecutionReport",
    "Failure",
    "ObjectExpectation",
    "REPORT_VERSION",
    "RunOutcome",
    "SuiteReport",
    "artifact_tree_sha",
    "check_cases",
    "dumps_report",
    "find_engine",
    "load_case_document",
    "load_cases",
    "render_markdown",
    "run_candidate",
    "run_execution",
    "verify_result",
]
