"""The PDF reader (W2.7 follow-up): the official lists have to be readable to be quotable."""

from __future__ import annotations

import importlib.util
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _reader():
    """The reader, from the core (W4.7: the core owns it, so the app can read a PDF)."""
    from archres_core import pdf_text

    return pdf_text


def _tiny_pdf(text: str) -> bytes:
    """A one-page PDF with a text layer (the smallest thing the reader must handle)."""
    content = f"BT /F1 12 Tf 10 100 Td ({text}) Tj ET".encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    start = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    return bytes(out)


def test_the_reader_reads_a_page(tmp_path: pathlib.Path) -> None:
    guard = _reader()
    path = tmp_path / "tiny.pdf"
    path.write_bytes(_tiny_pdf("Cement per bag 520.00"))
    document = guard.read_pdf(path)
    assert len(document.pages) == 1
    assert "Cement per bag 520.00" in document.page_text(1)


def test_the_reader_finds_text_and_its_page(tmp_path: pathlib.Path) -> None:
    guard = _reader()
    path = tmp_path / "tiny.pdf"
    path.write_bytes(_tiny_pdf("Sand per cft 1900.00"))
    document = guard.read_pdf(path)
    hits = document.find("sand")
    assert hits and hits[0][0] == 1
    assert "Sand per cft" in hits[0][1]


def _tiny_pdf_lines(lines: list[str]) -> bytes:
    """A one-page PDF with one line of text per row (the shape a book has)."""
    body = "".join(
        f"BT /F1 12 Tf 10 {100 - 14 * index} Td ({line}) Tj ET\n"
        for index, line in enumerate(lines)
    )
    content = body.encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body_item in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body_item + b"\nendobj\n"
    start = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    return bytes(out)


def test_the_reader_can_keep_the_pages_lines(tmp_path: pathlib.Path) -> None:
    """With ``lines`` the page keeps its lines - and the default still does not.

    The BYO-PDF importer (W4.7) needs the lines, because a numbered provision opens a
    line; the price cards are read with the words run together, so the default must not
    change under it.
    """
    guard = _reader()
    path = tmp_path / "lines.pdf"
    path.write_bytes(_tiny_pdf_lines(["3.15 A room", "3.16 A door"]))

    with_lines = guard.read_pdf(path, lines=True)
    assert with_lines.page_text(1).splitlines() == ["3.15 A room", "3.16 A door"]

    without_lines = guard.read_pdf(path)
    assert without_lines.page_text(1).splitlines() == ["3.15 A room3.16 A door"]


def test_the_reader_refuses_a_file_that_is_not_a_pdf(tmp_path: pathlib.Path) -> None:
    guard = _reader()
    path = tmp_path / "not.pdf"
    path.write_bytes(b"just text")
    with pytest.raises(guard.PdfError):
        guard.read_pdf(path)


def test_the_cached_books_read_and_carry_the_rows_this_project_needs() -> None:
    """The real books, when they are cached (they are not committed - 22 MB of PDF)."""
    guard = _reader()
    cache = ROOT / "data" / "cache" / "sources"
    pwd = sorted((cache / "pwd-schedule-of-rates-pdf").glob("*.pdf"))
    if not pwd:
        pytest.skip("the SoR books are not cached here (fetch them with the price service)")
    document = guard.read_pdf(pwd[0])
    assert len(document.pages) > 300
    text = document.page_text(14)
    assert "Head mason" in text
    assert "520.00" in document.page_text(20), "the cement row must be on page 20"
