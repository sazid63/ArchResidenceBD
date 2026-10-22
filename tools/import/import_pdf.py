"""The BYO-PDF importer's CLI: the user's own PDF becomes candidate clauses.

    uv run --directory core python ../tools/import/import_pdf.py --pdf <file> --write
    uv run --directory core python ../tools/import/import_pdf.py --pdf <file> --check
    uv run --directory core python ../tools/import/import_pdf.py --pdf <file> --review accept cl-1
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

from archres_core.importer import (
    DECISION_ACCEPTED,
    DECISION_REJECTED,
    ImporterError,
    Review,
    candidate_document,
    candidates_from_pdf,
    load_review,
    review_ledger_path,
    save_review,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "import"


def _sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Import a user's own PDF as candidate clauses (candidates, never law)."
    )
    parser.add_argument("--pdf", required=True, help="the PDF to read")
    parser.add_argument("--out", help="where to write the candidate document")
    parser.add_argument("--write", action="store_true", help="write the candidate document")
    parser.add_argument("--check", action="store_true", help="fail when the document is stale")
    parser.add_argument(
        "--review",
        nargs=2,
        metavar=("DECISION", "CANDIDATE_ID"),
        help="record a review decision (accepted or rejected) for a candidate",
    )
    parser.add_argument("--reviewer", default="", help="who is reviewing")
    parser.add_argument("--note", default="", help="a note on the decision")
    parser.add_argument("--at", default="", help="when the decision was made (ISO 8601)")
    args = parser.parse_args(argv)

    pdf = pathlib.Path(args.pdf)
    if not pdf.is_file():
        print(f"no such PDF: {pdf}", file=sys.stderr)
        return 1
    try:
        candidates = candidates_from_pdf(pdf)
    except ImporterError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    out = pathlib.Path(args.out) if args.out else OUT / f"{pdf.stem}.candidates.json"
    # the ledger's home is the core's decision (ADR-0081) - so the CLI and the app read
    # and write the same one, and a decision made in one is visible in the other.
    ledger = review_ledger_path(pdf, data=ROOT / "data")
    reviews = list(load_review(ledger))

    if args.review:
        decision, candidate_id = args.review
        if decision not in (DECISION_ACCEPTED, DECISION_REJECTED):
            print(
                f"the decision must be {DECISION_ACCEPTED} or {DECISION_REJECTED}, got {decision!r}",
                file=sys.stderr,
            )
            return 1
        if not any(candidate.id == candidate_id for candidate in candidates):
            print(f"no candidate {candidate_id!r} in this PDF", file=sys.stderr)
            return 1
        reviews = [review for review in reviews if review.candidate_id != candidate_id]
        reviews.append(
            Review(
                candidate_id=candidate_id,
                decision=decision,
                reviewed_by=args.reviewer,
                reviewed_at=args.at,
                note=args.note,
            )
        )
        save_review(ledger, reviews)
        print(f"recorded {decision} for {candidate_id} in {ledger.name}")

    document = candidate_document(
        pdf, candidates, source_sha256=_sha256(pdf), reviews=reviews
    )

    text = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.check:
        if not out.is_file():
            print(f"FAIL {out.name} is missing", file=sys.stderr)
            return 1
        if out.read_text(encoding="utf-8") != text:
            print(f"FAIL {out.name} is stale", file=sys.stderr)
            return 1
        print(f"{out.name} is fresh: {len(candidates)} candidate(s)")
        return 0
    if args.write:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {out.name}: {len(candidates)} candidate(s) - candidates, never law")
        return 0
    print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
