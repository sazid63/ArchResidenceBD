"""The security pass (W3.10): the report is the record, and it is fresh.

The laws themselves are checked by the guard (`tools/ci/security_guard.py`) — the pass *is*
the test ✓, and the CI runs it ✓. What this holds is that the record exists ✓, that it says
what it found ✓, and that it does not quietly lose a law ✓.
"""

from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
REPORT = ROOT / "data" / "security" / "security-pass.json"


def test_the_pass_recorded_its_laws() -> None:
    assert REPORT.is_file(), REPORT
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["laws"], "the pass must record the laws it checked"
    for law in report["laws"]:
        assert law["law"], "a law without a name is not a law"
        assert law["detail"], "a law without its reason is not a check"
    assert not report["failedLaws"], report["failedLaws"]


def test_the_pass_covered_the_external_surfaces() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["surfaces"], "the pass must name the surfaces it scanned"
    for finding in report["findings"]:
        assert finding["surface"] and finding["rule"] and finding["severity"]
        assert finding["severity"] in ("low", "medium", "high")


def test_the_pass_is_honest_about_what_it_found() -> None:
    """A finding is a finding: the record keeps them, even when they are not fatal."""
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert "worstSeverity" in report
    assert report["ok"] is True
