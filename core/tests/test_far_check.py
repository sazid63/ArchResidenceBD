"""The FAR check (the gazette's own text layer vs the pack): the laws it holds.

- **the pack's numbers are checked against the source's own digits** — the gazette's text
  layer carries them (the Bangla letters are mangled ✓, the digits are not ✓), so a row
  the layer carries is a row the pack agrees with ✓ ✓;
- **a second, independent copy** — the Chattogram CDA's own copy of the same schedule ✓ —
  checks the same rows ✓ ✓, and the pack was transcribed from neither ✓ ✓;
- **a row no document carries is a gap, not a disagreement** ✓ ✓ — it is reported as
  *not checked* ✓, and the check does not claim it agrees ✓ ✓ (ADR-0080 ✓ ✓);
- **the check fails when a row disagrees** ✓ ✓ — a disagreement is a real fault ✓.
"""

from __future__ import annotations

import importlib.util
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _check():
    """The check, loaded from the tool (it is the tool's own logic ✓)."""
    path = ROOT / "tools" / "rules" / "gazette" / "check_far.py"
    spec = importlib.util.spec_from_file_location("check_far", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_far_check_reads_a_row_the_documents_carry() -> None:
    """A row of three numbers, and a row of six ✓ — and the "NR" the gazette writes ✓."""
    guard = _check()
    assert guard._trailing_run("6.0 3.15 67.5") == ["6.0", "3.15", "67.5"]
    assert guard._trailing_run("6.0 3.15 67.5 6.0 2.5 67.5") == [
        "6.0",
        "3.15",
        "67.5",
        "6.0",
        "2.5",
        "67.5",
    ]
    # a footnote marker at the end of a row is not part of it ✓
    assert guard._trailing_run("12.0 5.50 50.0 12.0 9.50 50.0[2]") == [
        "12.0",
        "5.50",
        "50.0",
        "12.0",
        "9.50",
        "50.0",
    ]
    # and "NR" - the gazette's own word for *not permitted* ✓
    assert guard._value("NR*") == "NR"
    assert guard._value("6.50") == 6.5


def test_the_far_check_reads_the_area_range_off_a_row() -> None:
    """The CDA prints the area range in the same line ✓ — the numbers are at the end ✓."""
    guard = _check()
    line = "134 sqm up to 2 katha 6.0 3.15 67.5 6.0 2.50 67.5"
    assert guard._trailing_run(line) == ["6.0", "3.15", "67.5", "6.0", "2.50", "67.5"]


def test_the_far_check_agrees_with_the_pack_and_reports_the_gaps() -> None:
    """A row the document carries is checked ✓; a row it does not carry is a gap ✓."""
    guard = _check()
    want = {"roadWidthM": 6.0, "far": 3.15, "mgcPercent": 67.5}
    assert guard._agrees(want, (6.0, 3.15, 67.5))
    assert not guard._agrees(want, (6.0, 3.35, 65.0))
    assert guard._agrees({"roadWidthM": 18.0, "far": "NR", "mgcPercent": 50.0},
                         (18.0, "NR", 50.0))


def test_the_far_check_runs_against_the_cached_documents() -> None:
    """The check itself, on the real documents (when they are cached ✓)."""
    guard = _check()
    if not guard.GAZETTE.is_file():
        pytest.skip("the gazette is not cached here (fetch it with the source service)")
    import yaml

    pack = yaml.safe_load(guard.PACK.read_text(encoding="utf-8"))
    pages = guard._pages_of(pack["citations"]["far-3ka"]["pdfPage"])
    problems, checked, unchecked = guard.check(
        guard.read_pdf(guard.GAZETTE, lines=True), pack, "the gazette", pages
    )
    assert problems == []
    assert checked == 34, "the gazette's own text layer carries 34 of the pack's rows"
    assert unchecked == 0
