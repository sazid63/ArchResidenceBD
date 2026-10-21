"""Render the BBS final (W3.4): the bar schedule as an xlsx and a PDF.

Usage (from the repo root):
  uv run --directory core python ../tools/documents/render_bbs.py --write
  uv run --directory core python ../tools/documents/render_bbs.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.rebar import build_bbs, design_rebar
from archres_core.documents.bbs import render_bbs_pages, render_bbs_sheets
from archres_core.documents.pdf import write_pdf
from archres_core.documents.xlsx import write_xlsx
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
OUT = ROOT / "data" / "documents"
XLSX = OUT / "bar-schedule.xlsx"
PDF = OUT / "bar-schedule.pdf"
MANIFEST = OUT / "bar-schedule-manifest.json"


def _bbs() -> dict:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    return build_bbs(rebar)


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Render the BBS final (xlsx + PDF).")
    parser.add_argument("--write", action="store_true", help="write the documents")
    parser.add_argument("--check", action="store_true", help="verify the committed documents")
    args = parser.parse_args()

    bbs = _bbs()
    sheets = render_bbs_sheets(bbs)
    pages = render_bbs_pages(bbs)

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
        # The documents must carry the schedule's own numbers.
        import zipfile

        with zipfile.ZipFile(XLSX) as archive:
            sheet_xml = archive.read("xl/worksheets/sheet2.xml").decode("utf-8")
        first = bbs["items"][0]
        for value in (str(first["mark"]), str(first["lengthMm"]), str(first["weightKg"])):
            if value not in sheet_xml:
                problems.append(f"the workbook does not carry {value}")
        pdf_bytes = PDF.read_bytes()
        if not pdf_bytes.startswith(b"%PDF") or b"%%EOF" not in pdf_bytes:
            problems.append("the PDF is not a PDF")
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the committed bar-schedule documents are complete")
        return 0

    write_xlsx(XLSX, sheets)
    write_pdf(PDF, pages, title="ArchResidenceBD - Bar Schedule")
    manifest = {
        "projectId": bbs.get("projectId"),
        "bars": (bbs.get("totals") or {}).get("barCount"),
        "weightKg": (bbs.get("totals") or {}).get("weightKg"),
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
        f"{manifest['bars']} bars, {manifest['weightKg']} kg, {len(pages)} pages"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
