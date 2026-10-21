"""Render the BOQ final (W3.5): the priced schedule as an xlsx and a PDF.

The BOQ is priced from the **price service** (W2.7 ✓), so the document carries the card's
identity and its candidate status ✓, and the Deviation Register's entries are flagged on the
lines they price ✓.

Usage (from the repo root):
  uv run --directory core python ../tools/documents/render_boq.py --write
  uv run --directory core python ../tools/documents/render_boq.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import (
    build_boq,
    design_foundation,
    design_rebar,
    design_takeoff,
    design_typical_floor,
)
from archres_core.documents.boq import render_boq_pages, render_boq_sheets
from archres_core.documents.pdf import write_pdf
from archres_core.documents.xlsx import write_xlsx
from archres_core.pricing import apply_override, apply_pricing, pricing_block, resolve_card
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
OUT = ROOT / "data" / "documents"
XLSX = OUT / "bill-of-quantities.xlsx"
PDF = OUT / "bill-of-quantities.pdf"
MANIFEST = OUT / "bill-of-quantities-manifest.json"
AT = "2026-10-21T00:00:00+00:00"


def _boq() -> tuple[dict, list[dict]]:
    """The priced BOQ and the Deviation Register that goes with it."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    card = json.loads(CARD.read_text(encoding="utf-8"))
    region = str(((spec.get("site") or {}).get("address") or {}).get("district") or "dhaka").lower()
    resolved = resolve_card(card, region)
    spec = apply_pricing(spec, pricing_block(resolved), at=AT)
    spec = apply_override(
        spec,
        spec["pricing"],
        card,
        "cement-opc-43",
        575.0,
        reason="local mill quote",
        at=AT,
    )
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)
    # The BOQ is priced from the **spec's** pricing block - the one the override changed - so
    # the document cannot contradict the spec it came from.
    boq = build_boq(takeoff, spec["pricing"])
    return boq, list(spec.get("deviations") or [])


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Render the BOQ final (xlsx + PDF).")
    parser.add_argument("--write", action="store_true", help="write the documents")
    parser.add_argument("--check", action="store_true", help="verify the committed documents")
    args = parser.parse_args()

    boq, register = _boq()
    sheets = render_boq_sheets(boq, register)
    pages = render_boq_pages(boq, register)

    if args.check:
        problems: list[str] = []
        if not XLSX.is_file():
            problems.append(f"missing {XLSX.relative_to(ROOT).as_posix()}")
        if not PDF.is_file():
            problems.append(f"missing {PDF.relative_to(ROOT).as_posix()}")
        if problems:
            for problem in problems:
                print(f"FAIL {problem}", file=sys.stderr)
            return 1
        import zipfile

        with zipfile.ZipFile(XLSX) as archive:
            schedule = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
        for line in boq["lines"][:4]:
            label = (line.get("label") or {}).get("en", "")
            if label and label not in schedule:
                problems.append(f"the workbook does not carry {label!r}")
        if any(entry.get("id") == "price-cement-opc-43" for entry in register):
            if "DEVIATION" not in schedule:
                problems.append("the workbook does not flag the price deviation")
        pdf_bytes = PDF.read_bytes()
        if not pdf_bytes.startswith(b"%PDF") or b"%%EOF" not in pdf_bytes:
            problems.append("the PDF is not a PDF")
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the committed bill-of-quantities documents are complete")
        return 0

    write_xlsx(XLSX, sheets)
    write_pdf(PDF, pages, title="ArchResidenceBD - Bill of Quantities")
    totals = boq.get("totals") or {}
    manifest = {
        "projectId": boq.get("projectId"),
        "cardId": (boq.get("rateCard") or {}).get("cardId"),
        "cardStatus": (boq.get("rateCard") or {}).get("status"),
        "totalBdt": totals.get("amountBdt"),
        "pricedLines": totals.get("pricedLines"),
        "unpricedLines": len(totals.get("unpricedLines") or []),
        "deviations": len(register),
        "sheets": [sheet.name for sheet in sheets],
        "pages": len(pages),
        "xlsxBytes": XLSX.stat().st_size,
        "pdfBytes": PDF.stat().st_size,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        f"wrote {XLSX.relative_to(ROOT).as_posix()} ({manifest['xlsxBytes']} B) and "
        f"{PDF.relative_to(ROOT).as_posix()} ({manifest['pdfBytes']} B): "
        f"{manifest['totalBdt']} BDT, {manifest['pricedLines']} priced, "
        f"{manifest['unpricedLines']} unpriced, {manifest['deviations']} deviation(s), "
        f"{manifest['pages']} pages"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
