"""A small xlsx writer (stdlib only) - the engineer's editable document.

The plan's deliverables are **xlsx + PDF** (§6: the BBS and the BOQ). An xlsx is a zip of XML,
so it can be written with the standard library - no new dependency, and a file the engineer's
spreadsheet opens and edits ✓.

What it writes, and what it refuses to write:

- **Real cells**, not a CSV with an xlsx name ✓: numbers stay numbers ✓ (a spreadsheet can
  sum them ✓), strings stay strings ✓, and the header row is bold ✓.
- **A sheet per table** ✓ with the column widths set ✓, so the document reads like a document
  and not like a dump ✓.
- **Nothing it cannot verify.** The writer checks its own zip when it is done ✓ - a workbook
  that is not a valid zip is a broken deliverable ✓.
"""

from __future__ import annotations

import io
import pathlib
import zipfile
from dataclasses import dataclass, field
from typing import Any


class DocumentError(RuntimeError):
    """The document could not be written (never a silent gap)."""


@dataclass
class Cell:
    """One cell: a value, and whether it is a header."""

    value: Any
    header: bool = False
    number_format: str | None = None


@dataclass
class Sheet:
    """One sheet: a name, a header row and the rows under it."""

    name: str
    header: tuple[str, ...] = ()
    rows: list[list[Any]] = field(default_factory=list)
    widths: tuple[int, ...] = ()

    def add(self, *values: Any) -> None:
        self.rows.append(list(values))


def _column_name(index: int) -> str:
    """The spreadsheet column name for an index (0 = A, 26 = AA)."""
    name = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


#: The number formats the writer knows, and the style each one uses.
NUMBER_FORMATS = {"0.000": 2, "0.00": 3}


def _cell_xml(reference: str, cell: Cell, style_default: int, style_header: int) -> str:
    if cell.header:
        style = style_header
    elif cell.number_format:
        style = NUMBER_FORMATS.get(cell.number_format)
        if style is None:
            raise DocumentError(f"unknown number format: {cell.number_format!r}")
    else:
        style = 0
    value = cell.value
    if isinstance(value, bool):
        return f'<c r="{reference}" s="{style}" t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)):
        return f'<c r="{reference}" s="{style}"><v>{value!r}</v></c>'
    text = "" if value is None else str(value)
    text = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return (
        f'<c r="{reference}" s="{style}" t="inlineStr"><is><t xml:space="preserve">'
        f"{text}</t></is></c>"
    )


def _number_format(value: Any) -> str | None:
    """The format a number wants: a weight to three decimals, a rate to two."""
    if isinstance(value, bool) or not isinstance(value, float):
        return None
    if abs(value - round(value, 2)) < 1e-9:
        return "0.00"
    return "0.000"


def _sheet_xml(sheet: Sheet) -> str:
    rows_xml: list[str] = []
    if sheet.header:
        cells = "".join(
            _cell_xml(f"{_column_name(index)}1", Cell(value, header=True), 0, 1)
            for index, value in enumerate(sheet.header)
        )
        rows_xml.append(f'<row r="1">{cells}</row>')
    for offset, row in enumerate(sheet.rows, start=2 if sheet.header else 1):
        cells = "".join(
            _cell_xml(
                f"{_column_name(index)}{offset}",
                Cell(value, number_format=_number_format(value)),
                0,
                1,
            )
            for index, value in enumerate(row)
        )
        rows_xml.append(f'<row r="{offset}">{cells}</row>')
    cols = ""
    if sheet.widths:
        parts = "".join(
            f'<col min="{index + 1}" max="{index + 1}" width="{width}" customWidth="1"/>'
            for index, width in enumerate(sheet.widths)
        )
        cols = f"<cols>{parts}</cols>"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"{cols}<sheetData>{''.join(rows_xml)}</sheetData></worksheet>"
    )


CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    "{sheets}"
    "</Types>"
)

ROOT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    "</Relationships>"
)

STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/>'
    '<numFmt numFmtId="165" formatCode="0.00"/></numFmts>'
    '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    "</styleSheet>"
)


def write_xlsx(path: str | pathlib.Path, sheets: list[Sheet]) -> pathlib.Path:
    """Write the workbook and check that what came out is a readable zip."""
    if not sheets:
        raise DocumentError("a workbook needs at least one sheet")
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    sheet_entries = []
    rels = []
    overrides = []
    for index, sheet in enumerate(sheets, start=1):
        sheet_entries.append(
            f'<sheet name="{_escape(sheet.name)}" sheetId="{index}" r:id="rId{index}"/>'
        )
        rels.append(
            f'<Relationship Id="rId{index}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{index}.xml"/>'
        )
        overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{index}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    styles_rel = f'<Relationship Id="rId{len(sheets) + 1}" '
    styles_rel += (
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheet_entries)}</sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(rels)}{styles_rel}</Relationships>'
    )
    content_types = CONTENT_TYPES.format(sheets="".join(overrides))

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", ROOT_RELS)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/styles.xml", STYLES)
        for index, sheet in enumerate(sheets, start=1):
            archive.writestr(f"xl/worksheets/sheet{index}.xml", _sheet_xml(sheet))
    data = buffer.getvalue()
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        broken = archive.testzip()
        if broken is not None:
            raise DocumentError(f"the workbook is not a readable zip: {broken}")
        names = set(archive.namelist())
    for required in ("[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml"):
        if required not in names:
            raise DocumentError(f"the workbook is missing {required}")
    target.write_bytes(data)
    return target


def _escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


__all__ = ["Cell", "DocumentError", "Sheet", "write_xlsx"]
