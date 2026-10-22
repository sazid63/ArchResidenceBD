"""The BYO-PDF importer (W4.7): candidates, never law — and a human decides.

The laws these tests hold:

- **a candidate is not a rule** — the importer produces candidates with a number, a page and
  the text, and nothing that could be mistaken for law;
- **every candidate cites its page** — a clause without a page cannot be checked;
- **a human decides** — the ledger records who accepted or rejected each candidate, and a
  candidate with no decision is *not reviewed* and says so;
- **the PDF reader is the core's** — so the app can read a user's own PDF.
"""

from __future__ import annotations

import json
import pathlib
import zlib

import pytest

from archres_core.importer import (
    DECISION_ACCEPTED,
    DECISION_REJECTED,
    STATUS_CANDIDATE,
    Candidate,
    ImporterError,
    Review,
    candidate_document,
    candidates_from_pdf,
    extract_candidates,
    load_review,
    save_review,
)
from archres_core.pdf_text import PdfDocument, PdfError, PdfPage


def _pdf(pages: list[str]) -> bytes:
    """A tiny PDF with one text layer per page (one line of text per row)."""
    objects: list[bytes] = []
    page_count = len(pages)
    # 1: the catalogue, 2: the page tree, 3: the font, then a page + a content per page.
    kids = " ".join(f"{3 + 2 * index} 0 R" for index in range(page_count))
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(
        f"<< /Type /Pages /Kids [{kids}] /Count {page_count} >>".encode("latin-1")
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for index, text in enumerate(pages):
        content = f"BT /F1 12 Tf 10 100 Td ({text}) Tj ET".encode("latin-1")
        stream = zlib.compress(content)
        page = 3 + 2 * index
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {page + 1} 0 R >>".encode(
                "latin-1"
            )
        )
        objects.append(
            b"<< /Length "
            + str(len(stream)).encode("latin-1")
            + b" /Filter /FlateDecode >>\nstream\n"
            + stream
            + b"\nendstream"
        )
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode("latin-1") + body + b"\nendobj\n"
    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode("latin-1")
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode("latin-1")
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode(
            "latin-1"
        )
    )
    return bytes(out)


def _book_pdf(lines: list[str]) -> bytes:
    """A one-page PDF whose text sits on separate lines (the shape a book has)."""
    body = "".join(
        f"BT /F1 12 Tf 10 {100 - 14 * index} Td ({line}) Tj ET\n"
        for index, line in enumerate(lines)
    )
    content = body.encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, item in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + item + b"\nendobj\n"
    start = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    return bytes(out)


def _document(pages: list[str]) -> PdfDocument:
    return PdfDocument(path=pathlib.Path("book.pdf"), pages=[PdfPage(number=i + 1, text=t) for i, t in enumerate(pages)])


def test_the_candidates_are_candidates_and_never_law() -> None:
    """The importer produces candidates, and says so."""
    document = _document(["3.15 The height of a room shall be 2.75 m", "3.16 A door shall be 0.9 m"])
    candidates = extract_candidates(document)
    assert candidates
    for candidate in candidates:
        assert candidate.status == STATUS_CANDIDATE
        assert candidate.page >= 1
        assert candidate.number
    payload = candidate_document("book.pdf", candidates, source_sha256="0" * 64)
    assert payload["status"] == STATUS_CANDIDATE
    # and nothing in it looks like a rule: no pack keys, no rule ids
    text = json.dumps(payload)
    assert "tables" not in text
    assert "authority" not in text
    assert "regime" not in text


def test_every_candidate_cites_its_page() -> None:
    """A clause without a page cannot be checked."""
    document = _document(["1.1 First\n1.2 Second\n2.1 Third"])
    candidates = extract_candidates(document)
    assert [candidate.page for candidate in candidates] == [1, 1, 1]
    assert [candidate.number for candidate in candidates] == ["1.1", "1.2", "2.1"]


def test_a_bangla_number_is_recognised() -> None:
    """The product speaks Bangla: a Bangla numeral opens a provision too."""
    document = _document(["১.১১ আবারতার ডাড"])
    candidates = extract_candidates(document)
    assert candidates
    assert candidates[0].number.startswith("১")


def test_a_numbered_provisions_body_is_taken_with_it() -> None:
    """The lines that follow a number belong to it."""
    document = _document(["4.1 A rule\nwith its body\n4.2 The next rule"])
    candidates = extract_candidates(document)
    assert len(candidates) == 2
    assert "with its body" in candidates[0].text
    assert "4.2" not in candidates[0].text


def test_a_book_with_no_numbered_provisions_yields_no_candidates() -> None:
    """No candidates is a fact, not a failure to be papered over."""
    document = _document(["A page of prose with no numbered provision at all"])
    assert extract_candidates(document) == []


def test_a_bracketed_number_opens_a_provision() -> None:
    """The books the plan points at number their clauses "(1)", "(a)" — those open too."""
    document = _document(["(1) The first clause\n(2) The second clause"])
    candidates = extract_candidates(document)
    assert [candidate.number for candidate in candidates] == ["1", "2"]
    assert "The second clause" in candidates[1].text


def test_a_bracketed_letter_opens_a_provision() -> None:
    """A lettered sub-clause — "(a)" — is a provision too."""
    document = _document(["(a) the first limb\n(b) the second limb"])
    candidates = extract_candidates(document)
    assert [candidate.number for candidate in candidates] == ["a", "b"]


def test_a_section_number_opens_a_provision() -> None:
    """A section number — "1." — opens a provision too."""
    document = _document(["1. Short title\n2. Definitions"])
    candidates = extract_candidates(document)
    assert [candidate.number for candidate in candidates] == ["1", "2"]


def test_a_bracketed_number_is_cited_with_its_page() -> None:
    """A bracketed number opens under every section, so the page is part of its citation."""
    document = _document(["(1) on the first page", "(1) on the second page"])
    candidates = extract_candidates(document)
    assert len(candidates) == 2
    assert candidates[0].id != candidates[1].id
    assert [candidate.page for candidate in candidates] == [1, 2]
    assert all(candidate.id.endswith("-p1") or candidate.id.endswith("-p2") for candidate in candidates)


def test_two_bracketed_numbers_on_one_page_are_counted_apart() -> None:
    """Two clauses that open with the same number on one page are two clauses."""
    document = _document(["(1) the first\n(1) the second"])
    candidates = extract_candidates(document)
    assert len(candidates) == 2
    assert candidates[0].id != candidates[1].id


def test_the_clause_body_beats_the_contents_list_entry() -> None:
    """The contents list carries a section's title; the body carries the clause.

    The same number seen twice is the same clause, and the **longer** text is the one a
    reviewer must check — so the body replaces the contents list's entry.
    """
    document = _document(["1. Short title, extent and commencement.", "1. This Act may be called the Building Construction Act, 1952."])
    candidates = extract_candidates(document)
    assert len(candidates) == 1
    assert "This Act may be called" in candidates[0].text
    assert candidates[0].page == 2


def test_a_year_is_not_a_section() -> None:
    """A printer's imprint — "1985." — is not a section."""
    document = _document(["PUBLISHED BY THE GOVERNMENT OF BANGLADESH.\n1985."])
    assert extract_candidates(document) == []


def test_the_same_number_twice_is_one_candidate() -> None:
    """The ids must be unique, or the review would count one clause twice."""
    document = _document(["5.1 One\n5.2 Two\n5.1 One again"])
    candidates = extract_candidates(document)
    assert len({candidate.id for candidate in candidates}) == len(candidates)


def test_a_human_decides_and_the_ledger_says_so() -> None:
    """A candidate with no decision is not reviewed, and the ledger says so."""
    candidates = [
        Candidate(id="clause-1-1", number="1.1", page=1, text="1.1 Something"),
        Candidate(id="clause-1-2", number="1.2", page=1, text="1.2 Something else"),
    ]
    reviews = [
        Review(
            candidate_id="clause-1-1",
            decision=DECISION_ACCEPTED,
            reviewed_by="an engineer",
            reviewed_at="2026-10-21T00:00:00+06:00",
            note="matches the gazette",
        )
    ]
    ledger = candidate_document(
        "book.pdf", candidates, source_sha256="0" * 64, reviews=reviews
    )
    assert ledger["counts"] == {
        "candidates": 2,
        "reviewed": 1,
        "accepted": 1,
        "rejected": 0,
        "unreviewed": 1,
    }
    assert ledger["candidates"][1]["review"] is None, "an unreviewed candidate must say so"


def test_the_ledger_round_trips(tmp_path: pathlib.Path) -> None:
    """The ledger is the evidence that a rule entered the pack deliberately."""
    path = tmp_path / "review.json"
    reviews = [
        Review(
            candidate_id="clause-2-1",
            decision=DECISION_REJECTED,
            reviewed_by="an engineer",
            reviewed_at="2026-10-21T00:00:00+06:00",
            note="not a clause",
        )
    ]
    save_review(path, reviews)
    assert load_review(path) == reviews
    assert load_review(tmp_path / "nothing.json") == []


def test_a_real_pdf_gives_one_candidate_per_provision(tmp_path: pathlib.Path) -> None:
    """The whole way through: a book's page, read by the core's reader, then the importer.

    This is the case the line-preserving mode exists for: without the page's lines every
    provision on the page would be one long run of words, and the importer would find the
    first one only.
    """
    path = tmp_path / "book.pdf"
    path.write_bytes(
        _book_pdf(
            [
                "3.15 A room shall be 2.75 m high",
                "3.16 A door shall be 0.9 m wide",
                "3.17 A stair shall be 1.2 m wide",
            ]
        )
    )
    candidates = candidates_from_pdf(path)
    assert [candidate.number for candidate in candidates] == ["3.15", "3.16", "3.17"]
    assert all(candidate.page == 1 for candidate in candidates)
    assert "2.75 m" in candidates[0].text
    assert "1.2 m" in candidates[2].text


def test_a_pdf_that_is_not_a_pdf_is_an_error(tmp_path: pathlib.Path) -> None:
    """A broken PDF is an error, never an empty candidate list."""
    path = tmp_path / "broken.pdf"
    path.write_bytes(b"this is not a PDF")
    with pytest.raises(ImporterError):
        candidates_from_pdf(path)
