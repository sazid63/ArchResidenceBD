"""A small PDF writer (stdlib only) - the printable form of a table.

The plan's documents come in pairs: the **xlsx** an engineer edits ✓ and the **PDF** an
engineer prints and signs ✓. A PDF with text can be written with the standard library: the
built-in Helvetica faces need no embedding ✓, so the file is small ✓ and opens everywhere ✓.

What it is for, and what it is not:

- **It is for tables and text** ✓ — the BBS, the BOQ, a report ✓.
- **It is not for drawings** ✓ — the drawing set's PDF comes from the engine ✓ (W3.3 ✓), where
  the vector geometry lives ✓. A drawing printed from a text writer would be a lie about what
  the document is ✓.
- **The Bangla is the browser's job** ✓ — the plan prints the Bangla reports through
  HTML→print-PDF ✓ "for correct glyph shaping" ✓; the built-in PDF faces have no Bengali ✓, so
  a Bangla PDF from this writer would be unreadable ✓. It writes what it can write correctly ✓.
"""

from __future__ import annotations

import pathlib
from dataclasses import dataclass, field

#: A4 portrait, in PostScript points (1/72 inch).
PAGE_WIDTH = 595.28
PAGE_HEIGHT = 841.89

#: The margins.
MARGIN = 40.0

#: The line height of the body text.
LINE_HEIGHT = 11.0

#: The built-in faces (no embedding needed).
FONT_REGULAR = "Helvetica"
FONT_BOLD = "Helvetica-Bold"


class PdfError(RuntimeError):
    """The PDF could not be written (never a silent gap)."""


@dataclass
class TextLine:
    """One line of text, and where it sits."""

    text: str
    size: float = 9.0
    bold: bool = False
    x: float = MARGIN
    y: float = 0.0  # measured from the top of the page
    gray: float = 0.0


@dataclass
class Page:
    """One page: its lines."""

    lines: list[TextLine] = field(default_factory=list)

    def add(self, text: str, *, size: float = 9.0, bold: bool = False, x: float = MARGIN, y: float = 0.0, gray: float = 0.0) -> None:
        self.lines.append(
            TextLine(text=text, size=size, bold=bold, x=x, y=y, gray=gray)
        )


def _escape(text: str) -> str:
    return (
        str(text)
        .replace("\\", r"\\")
        .replace("(", r"\(")
        .replace(")", r"\)")
    )


def _check_encodable(text: str) -> str:
    """Refuse text the PDF's font cannot carry.

    The built-in faces are WinAnsi (cp1252): a Bangla line or a curly quote would silently
    become "?" in the finished document, and a document that quietly mangles its text is worse
    than one that refuses. The Bangla belongs to the browser's print (the plan's HTML->print-PDF
    route); this writer says so instead of pretending.
    """
    try:
        str(text).encode("cp1252")
    except UnicodeEncodeError as exc:
        raise PdfError(
            f"the text cannot be written in the PDF's font (WinAnsi): {text!r} "
            "(the Bangla reports are the browser's print - HTML->print-PDF)"
        ) from exc
    return str(text)


def _page_stream(page: Page) -> str:
    parts = ["BT"]
    for line in page.lines:
        font = FONT_BOLD if line.bold else FONT_REGULAR
        parts.append(f"/{font} {line.size:g} Tf")
        parts.append(f"{line.gray:g} g")
        parts.append(f"1 0 0 1 {line.x:.2f} {PAGE_HEIGHT - line.y:.2f} Tm")
        parts.append(f"({_escape(_check_encodable(line.text))}) Tj")
    parts.append("ET")
    return "\n".join(parts).encode("latin-1", errors="replace").decode("latin-1")


def write_pdf(path: str | pathlib.Path, pages: list[Page], *, title: str = "") -> pathlib.Path:
    """Write the pages as a PDF and check that what came out is a PDF."""
    if not pages:
        raise PdfError("a PDF needs at least one page")
    objects: list[bytes] = []

    def add(body: str) -> int:
        objects.append(body.encode("latin-1", errors="replace"))
        return len(objects)

    catalog_id = add("")  # 1 - filled below
    pages_id = add("")  # 2 - filled below
    font_regular = add(
        f"<< /Type /Font /Subtype /Type1 /BaseFont /{FONT_REGULAR} /Encoding /WinAnsiEncoding >>"
    )
    font_bold = add(
        f"<< /Type /Font /Subtype /Type1 /BaseFont /{FONT_BOLD} /Encoding /WinAnsiEncoding >>"
    )
    page_ids: list[int] = []
    for page in pages:
        stream = _page_stream(page)
        content_id = add(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")
        page_ids.append(
            add(
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {PAGE_WIDTH:.2f} "
                f"{PAGE_HEIGHT:.2f}] /Resources << /Font << /F1 {font_regular} 0 R /F2 "
                f"{font_bold} 0 R >> >> /Contents {content_id} 0 R >>"
            )
        )
    info_id = add(f"<< /Title ({_escape(title)}) /Producer (NativeCAD (ArchResidenceBD)) >>")
    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode()
    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{pid} 0 R' for pid in page_ids)}] "
        f"/Count {len(page_ids)} >>"
    ).encode()

    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"
    start_xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets[1:]:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R /Info {info_id} 0 R >>\n".encode()
    out += f"startxref\n{start_xref}\n%%EOF\n".encode()

    data = bytes(out)
    if not data.startswith(b"%PDF") or b"%%EOF" not in data:
        raise PdfError("the PDF was not written correctly")
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return target


__all__ = [
    "FONT_BOLD",
    "FONT_REGULAR",
    "LINE_HEIGHT",
    "MARGIN",
    "PAGE_HEIGHT",
    "PAGE_WIDTH",
    "Page",
    "PdfError",
    "TextLine",
    "write_pdf",
]
