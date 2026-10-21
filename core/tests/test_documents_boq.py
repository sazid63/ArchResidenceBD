"""The BOQ final (W3.5): the priced schedule as the engineer's two documents."""

from __future__ import annotations

import json
import pathlib
import zipfile

import pytest

from archres_core.documents.boq import render_boq_pages, render_boq_sheets
from archres_core.documents.pdf import Page, PdfError, write_pdf
from archres_core.documents.xlsx import Sheet, write_xlsx

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "documents"


def _documents() -> tuple[dict, list[dict]]:
    import importlib.util
    import sys

    path = ROOT / "tools" / "documents" / "render_boq.py"
    spec = importlib.util.spec_from_file_location("render_boq", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["render_boq"] = module
    spec.loader.exec_module(module)
    return module._boq()


def test_the_workbook_carries_the_schedule_the_totals_and_the_deviations(tmp_path: pathlib.Path) -> None:
    boq, register = _documents()
    path = write_xlsx(tmp_path / "test.xlsx", render_boq_sheets(boq, register))
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        assert "xl/worksheets/sheet2.xml" in names
        schedule = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
        summary = archive.read("xl/worksheets/sheet5.xml").decode("utf-8")
    for line in boq["lines"]:
        label = (line.get("label") or {}).get("en", "")
        assert label in schedule, label
    assert "DEVIATION" in schedule, "the price deviation must be flagged on its line"
    assert str(boq["totals"]["amountBdt"]) in summary


def test_the_workbook_says_which_card_priced_it_and_that_it_is_a_candidate(tmp_path: pathlib.Path) -> None:
    boq, register = _documents()
    path = write_xlsx(tmp_path / "test.xlsx", render_boq_sheets(boq, register))
    with zipfile.ZipFile(path) as archive:
        cover = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
    assert boq["rateCard"]["cardId"] in cover
    assert "candidate" in cover
    assert "not for construction" in cover


def test_the_pdf_has_a_page_per_phase_and_the_totals(tmp_path: pathlib.Path) -> None:
    boq, register = _documents()
    pages = render_boq_pages(boq, register)
    phases = {str(line.get("phase")) for line in boq["lines"]}
    assert len(pages) == len(phases) + 2  # the title block, one page per phase, the totals
    path = write_pdf(tmp_path / "test.pdf", pages, title="BOQ")
    data = path.read_bytes()
    assert data.startswith(b"%PDF")
    for phase in phases:
        assert phase.encode("latin-1") in data


def test_the_pdf_refuses_text_its_font_cannot_carry(tmp_path: pathlib.Path) -> None:
    page = Page()
    page.add("সিমেন্ট", y=60)
    with pytest.raises(PdfError):
        write_pdf(tmp_path / "test.pdf", [page])


def test_the_committed_documents_carry_the_boq() -> None:
    boq, register = _documents()
    manifest = json.loads((OUT / "bill-of-quantities-manifest.json").read_text(encoding="utf-8"))
    assert manifest["totalBdt"] == boq["totals"]["amountBdt"]
    assert manifest["pricedLines"] == boq["totals"]["pricedLines"]
    assert manifest["unpricedLines"] == len(boq["totals"]["unpricedLines"])
    assert manifest["cardId"] == boq["rateCard"]["cardId"]
    assert manifest["cardStatus"] == "candidate"


def test_the_boq_is_priced_from_the_spec_so_the_two_cannot_disagree() -> None:
    boq, register = _documents()
    # The override the demo applies (575 BDT/bag for the cement) must be in the document.
    cement = next(
        line for line in boq["lines"] if line.get("rateKey") == "cement-opc-43"
    )
    assert cement["rateBdt"] == 575.0
    assert cement["amountBdt"] == round(cement["quantity"] * 575.0, 2)
    assert any(entry.get("id") == "price-cement-opc-43" for entry in register)
