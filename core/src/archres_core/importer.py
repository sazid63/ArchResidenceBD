"""The BYO-PDF importer (W4.7): a user's own PDF becomes candidate clauses — **candidates, never law**.

The plan's §5.6 gives the law system three channels, and §6's P4 track asks for *rule packs
for the remaining cities* — but some authorities cannot be redistributed (BNBC · the plan's own
note ·), so the path for those is **user-provided copies**: the user brings their own PDF · and
the app reads it ·.

The discipline, and the whole point of this module:

- **A candidate is not law.** The importer produces *candidates* — a number, a page and the text
  — and nothing else ··. It never writes a rule, never edits a pack, and never claims a
  candidate is a rule ··.
- **Every candidate cites its page** — the same law the price cards follow (a number carries
  its source ·), because a clause without a page cannot be checked ··.
- **A human decides.** The review ledger records who accepted or rejected each candidate, and
  when — and the ledger is the *evidence* that a rule entered the pack deliberately ··.

The extraction itself is a **heuristic**, and it says so — the reader does not interpret the
layout (it reads the words on a page ··), so the importer finds *numbered provisions* by
their number and takes the text that follows them as the body ··. It does not guess what
a clause means — that is the reviewer's job, with the page in front of them ··.
"""

from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from .pdf_text import PdfDocument, PdfError, read_pdf

#: A numbered provision: "3.15", "3.15.2", "১.১৫" — digits, a dot, digits. The number
#: is the **whole** dotted run (a provision may be numbered 3.15.2 ·), and the trailing dot
#: is what tells a number from prose.
_NUMBERED = re.compile(
    r"^(?P<number>\d{1,4}(?:\.\d{1,4})+|[০-৩]{1,4}(?:[.।][০-৩]{1,4})+)"
)

#: How much of a candidate's text the excerpt carries.
EXCERPT_CHARS = 400

#: The candidate's status — always this, until a human promotes it into a pack.
STATUS_CANDIDATE = "candidate"

#: The decisions a reviewer may record.
DECISION_ACCEPTED = "accepted"
DECISION_REJECTED = "rejected"


class ImporterError(RuntimeError):
    """The PDF could not be turned into candidates (never a silent gap)."""


@dataclass(frozen=True)
class Candidate:
    """One candidate clause: a number, the page it is on, and the text that follows it."""

    id: str
    number: str
    page: int
    text: str
    status: str = STATUS_CANDIDATE

    @property
    def excerpt(self) -> str:
        """The first words of the candidate — enough to recognise it, not to rule on it."""
        flat = " ".join(self.text.split())
        return flat[:EXCERPT_CHARS]

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "number": self.number,
            "page": self.page,
            "text": self.text,
            "excerpt": self.excerpt,
            "status": self.status,
        }


@dataclass(frozen=True)
class Review:
    """One reviewer's decision on one candidate."""

    candidate_id: str
    decision: str
    reviewed_by: str
    reviewed_at: str
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "candidateId": self.candidate_id,
            "decision": self.decision,
            "reviewedBy": self.reviewed_by,
            "reviewedAt": self.reviewed_at,
            "note": self.note,
        }


def _lines(page_text: str) -> list[str]:
    return [line.strip() for line in page_text.splitlines()]


def _slug(number: str) -> str:
    """A stable id for a provision number ("3.15" -> "3-15"; Bangla digits are kept)."""
    cleaned = number.replace(".", "-").replace("।", "-")
    return f"clause-{cleaned}"


def _candidate(
    number: str, page: int, lines: list[str], seen: set[str]
) -> Candidate | None:
    """One candidate, if its number has not been seen before."""
    identifier = _slug(number)
    if identifier in seen:
        return None
    seen.add(identifier)
    return Candidate(id=identifier, number=number, page=page, text="\n".join(lines))


def extract_candidates(document: PdfDocument) -> list[Candidate]:
    """The numbered provisions in a document, as candidates.

    The heuristic is honest about what it is: a line that begins with a number is the **start**
    of a provision, and the lines up to the next one are its body ··. A book whose
    provisions are not numbered yields no candidates — and that is a fact, not a failure to
    be papered over ··.
    """
    candidates: list[Candidate] = []
    seen: set[str] = set()
    for page in document.pages:
        current_number: str | None = None
        current_text: list[str] = []
        for line in _lines(page.text):
            match = _NUMBERED.match(line)
            if match:
                if current_number is not None and current_text:
                    candidate = _candidate(current_number, page.number, current_text, seen)
                    if candidate is not None:
                        candidates.append(candidate)
                current_number = match.group("number")
                current_text = [line]
            elif current_number is not None:
                if line:
                    current_text.append(line)
        if current_number is not None and current_text:
            candidate = _candidate(current_number, page.number, current_text, seen)
            if candidate is not None:
                candidates.append(candidate)
    return candidates


def candidates_from_pdf(path: str | pathlib.Path) -> list[Candidate]:
    """The candidates in a PDF (the reader is the core's ·).

    The reader is asked for the page's **lines** · — a numbered provision opens a line ·,
    and without the lines every provision on a page would be one long run of words · ·.
    """
    try:
        document = read_pdf(pathlib.Path(path), lines=True)
    except PdfError as exc:
        raise ImporterError(f"the PDF could not be read: {exc}") from exc
    return extract_candidates(document)


def _rows(
    candidates: Sequence[Candidate], reviews: Iterable[Review]
) -> list[dict[str, Any]]:
    """The candidates with each one's review (or ``None`` when nobody has looked)."""
    by_id = {review.candidate_id: review for review in reviews}
    return [
        {
            **candidate.as_dict(),
            "review": by_id[candidate.id].as_dict() if candidate.id in by_id else None,
        }
        for candidate in candidates
    ]


def _counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    """How many candidates there are, and how many of them a human has decided on."""
    reviewed = sum(1 for row in rows if row["review"] is not None)
    accepted = sum(
        1 for row in rows if row["review"] and row["review"]["decision"] == DECISION_ACCEPTED
    )
    return {
        "candidates": len(rows),
        "reviewed": reviewed,
        "accepted": accepted,
        "rejected": reviewed - accepted,
        "unreviewed": len(rows) - reviewed,
    }


def candidate_document(
    path: str | pathlib.Path,
    candidates: Sequence[Candidate],
    *,
    source_sha256: str,
    reviews: Iterable[Review] = (),
) -> dict[str, Any]:
    """The candidate document: what the importer found, and where it came from.

    It is a **candidate** document · — not a pack, not a rule — and it says so ·, and it
    carries the source's hash · so a reviewer can tell which copy they were looking at
    ··.

    The review is **part of the document** ·: every candidate carries the decision a human
    made on it, or ``None`` when nobody has looked at it yet · — so a candidate with no
    decision is visibly unreviewed ·, and a pack cannot be built from candidates that
    nobody looked at ··.
    """
    rows = _rows(candidates, reviews)
    return {
        "schemaVersion": "0.1.0",
        "status": STATUS_CANDIDATE,
        "source": {
            "fileName": pathlib.Path(path).name,
            "sha256": source_sha256,
        },
        "counts": _counts(rows),
        "candidates": rows,
    }


def load_review(path: str | pathlib.Path) -> list[Review]:
    """The ledger's decisions."""
    target = pathlib.Path(path)
    if not target.is_file():
        return []
    document = json.loads(target.read_text(encoding="utf-8"))
    return [
        Review(
            candidate_id=str(row.get("candidateId") or ""),
            decision=str(row.get("decision") or ""),
            reviewed_by=str(row.get("reviewedBy") or ""),
            reviewed_at=str(row.get("reviewedAt") or ""),
            note=str(row.get("note") or ""),
        )
        for row in document.get("reviews") or []
    ]


def save_review(
    path: str | pathlib.Path, reviews: Sequence[Review]
) -> pathlib.Path:
    """Write the ledger."""
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    document = {
        "schemaVersion": "0.1.0",
        "reviews": [review.as_dict() for review in reviews],
    }
    target.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return target


__all__ = [
    "DECISION_ACCEPTED",
    "DECISION_REJECTED",
    "EXCERPT_CHARS",
    "STATUS_CANDIDATE",
    "Candidate",
    "ImporterError",
    "Review",
    "candidate_document",
    "candidates_from_pdf",
    "extract_candidates",
    "load_review",
    "save_review",
]
