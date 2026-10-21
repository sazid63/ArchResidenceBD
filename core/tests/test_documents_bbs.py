"""The BBS final (W3.4): the schedule as the engineer's two documents."""

from __future__ import annotations

import json
import pathlib
import re
import zipfile

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.rebar import build_bbs, design_rebar
from archres_core.documents.bbs import render_bbs_pages, render_bbs_sheets
from archres_core.documents.pdf import Page, write_pdf
from archres_core.documents.xlsx import Sheet, write_xlsx

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
OUT = ROOT / "data" / "documents"


def _bbs() -> dict:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    return build_bbs(rebar)


def test_the_workbook_is_a_readable_zip_with_the_sheets(tmp_path: pathlib.Path) -> None:
    bbs = _bbs()
    path = write_xlsx(tmp_path / "test.xlsx", render_bbs_sheets(bbs))
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        names = set(archive.namelist())
        assert "xl/workbook.xml" in names
        assert "xl/styles.xml" in names
        assert "xl/worksheets/sheet2.xml" in names
        sheet = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
    first = bbs["items"][0]
    assert first["mark"] in sheet
    assert str(first["lengthMm"]) in sheet
    # the header row is a header (bold), not a value
    assert "Mark" in sheet


def test_the_workbook_numbers_are_numbers_not_text(tmp_path: pathlib.Path) -> None:
    bbs = _bbs()
    path = write_xlsx(tmp_path / "test.xlsx", render_bbs_sheets(bbs))
    with zipfile.ZipFile(path) as archive:
        sheet = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
    first = bbs["items"][0]
    assert f"<v>{first['lengthMm']!r}</v>" in sheet


def test_the_pdf_has_the_pages_and_the_schedule_on_them(tmp_path: pathlib.Path) -> None:
    bbs = _bbs()
    pages = render_bbs_pages(bbs)
    assert len(pages) >= 3
    path = write_pdf(tmp_path / "test.pdf", pages, title="Bar Schedule")
    data = path.read_bytes()
    assert data.startswith(b"%PDF")
    assert data.rstrip().endswith(b"%%EOF")
    assert b"/Type /Page" in data
    first = bbs["items"][0]
    assert str(first["mark"]).encode("latin-1") in data


def test_the_pdf_cross_reference_points_at_the_objects(tmp_path: pathlib.Path) -> None:
    path = write_pdf(tmp_path / "test.pdf", [Page()], title="x")
    data = path.read_bytes()
    start = int(re.search(rb"startxref\s+(\d+)", data).group(1))
    assert data[start : start + 4] == b"xref"
    entries = re.findall(rb"^(\d{10}) 00000 n", data[start:], re.M)
    assert entries
    for offset in entries:
        position = int(offset)
        assert data[position : position + 4].endswith(b"obj") or b" obj" in data[position : position + 20]


def test_the_committed_documents_carry_the_schedule() -> None:
    bbs = _bbs()
    xlsx = OUT / "bar-schedule.xlsx"
    pdf = OUT / "bar-schedule.pdf"
    assert xlsx.is_file() and pdf.is_file()
    with zipfile.ZipFile(xlsx) as archive:
        sheet = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
    for item in bbs["items"][:5]:
        assert item["mark"] in sheet
    manifest = json.loads((OUT / "bar-schedule-manifest.json").read_text(encoding="utf-8"))
    assert manifest["bars"] == bbs["totals"]["barCount"]
    assert manifest["weightKg"] == bbs["totals"]["weightKg"]


def test_the_assumptions_travel_with_the_document() -> None:
    bbs = _bbs()
    pages = render_bbs_pages(bbs)
    text = "\n".join(line.text for line in pages[-1].lines)
    assert "ASSUMPTIONS" in text
    for item in bbs["assumptions"][:3]:
        assert str(item["pointer"]) in text
