"""W4.7 in the app: the importer through the channel, and the reviewer's ledger."""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.bridge import Bridge

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _book(path: pathlib.Path) -> pathlib.Path:
    """A one-page PDF with three numbered provisions ✓ ✓."""
    lines = [
        "3.15 A room shall be 2.75 m high",
        "3.16 A door shall be 0.9 m wide",
        "3.17 A stair shall be 1.2 m wide",
    ]
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
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n".encode()
    )
    path.write_bytes(bytes(out))
    return path


def test_a_pdf_becomes_candidates_through_the_channel(tmp_path: pathlib.Path) -> None:
    book = _book(tmp_path / "rule-book.pdf")
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "import.candidates", "params": {"pdf": str(book)}}
    )
    result = reply["result"]
    assert result["count"] == 3
    for candidate in result["candidates"]:
        # candidates, never law ✓ - and every one cites its page ✓
        assert candidate["status"] == "candidate"
        assert candidate["page"] >= 1
        assert candidate["number"]


def test_a_reviewers_decision_is_recorded(tmp_path: pathlib.Path) -> None:
    book = _book(tmp_path / "rule-book.pdf")
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {
            "id": "1",
            "method": "import.review",
            "params": {
                "pdf": str(book),
                "candidateId": "clause-3-15",
                "decision": "accepted",
                "reviewedBy": "an engineer",
                "reviewedAt": "2026-10-22T00:00:00+06:00",
            },
        }
    )
    assert reply["result"]["decision"] == "accepted"
    ledger = pathlib.Path(reply["result"]["ledger"])
    assert ledger.is_file()
    document = json.loads(ledger.read_text(encoding="utf-8"))
    assert document["reviews"][0]["candidateId"] == "clause-3-15"
    assert document["reviews"][0]["reviewedBy"] == "an engineer"


def test_the_decision_comes_back_with_the_candidates(tmp_path: pathlib.Path) -> None:
    """A reload must not lose the decision ✓ — the ledger is the evidence ✓ ✓.

    The app shows the candidates it read ✓, and a candidate that was reviewed shows it ✓
    — not "not reviewed" ✓ ✓.
    """
    book = _book(tmp_path / "rule-book.pdf")
    bridge = Bridge(root=ROOT)
    bridge.handle(
        {
            "id": "1",
            "method": "import.review",
            "params": {
                "pdf": str(book),
                "candidateId": "clause-3-15",
                "decision": "accepted",
                "reviewedBy": "an engineer",
                "reviewedAt": "2026-10-22T00:00:00+06:00",
            },
        }
    )
    reply = bridge.handle(
        {"id": "2", "method": "import.candidates", "params": {"pdf": str(book)}}
    )
    rows = {row["id"]: row for row in reply["result"]["candidates"]}
    assert rows["clause-3-15"]["review"]["decision"] == "accepted"
    assert rows["clause-3-15"]["review"]["reviewedBy"] == "an engineer"
    # and the ones nobody looked at are visibly unreviewed ✓
    assert rows["clause-3-16"]["review"] is None


def test_the_ledger_lives_in_the_apps_own_folder(tmp_path: pathlib.Path) -> None:
    """The app must not write into the user's own folders ✓ — the ledger is the app's ✓."""
    book = _book(tmp_path / "rule-book.pdf")
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {
            "id": "1",
            "method": "import.review",
            "params": {
                "pdf": str(book),
                "candidateId": "clause-3-15",
                "decision": "accepted",
            },
        }
    )
    ledger = pathlib.Path(reply["result"]["ledger"])
    assert ledger.parent == ROOT / "data" / "import"
    assert ledger.parent != book.parent
    # and nothing was written beside the user's own PDF ✓
    assert not (tmp_path / "rule-book.pdf.review.json").exists()


def test_a_bad_decision_is_refused(tmp_path: pathlib.Path) -> None:
    book = _book(tmp_path / "rule-book.pdf")
    reply = Bridge(root=ROOT).handle(
        {
            "id": "1",
            "method": "import.review",
            "params": {
                "pdf": str(book),
                "candidateId": "clause-3-15",
                "decision": "maybe",
            },
        }
    )
    assert reply["error"]["code"] == "invalid_params"


def test_an_unknown_candidate_is_refused(tmp_path: pathlib.Path) -> None:
    book = _book(tmp_path / "rule-book.pdf")
    reply = Bridge(root=ROOT).handle(
        {
            "id": "1",
            "method": "import.review",
            "params": {
                "pdf": str(book),
                "candidateId": "clause-9-9",
                "decision": "accepted",
            },
        }
    )
    assert reply["error"]["code"] == "invalid_params"
    assert "no candidate" in reply["error"]["message"]
