# ADR-0056 — A user's own PDF becomes candidate clauses: candidates, never law

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W4.7 (the BYO-PDF importer) ·
**Plan:** §5.6 (the law system) · §6 (the P4 track: the rule packs for the remaining cities) ·
the plan's *BNBC redistribution rights* note (*user-provided copies*) · **Related:** ADR-0003
(the rule pack), ADR-0001 (the launch plan — the pack is a candidate until an engineer signs)
**Code:** `core/src/archres_core/importer.py` (the importer) ·
`core/src/archres_core/pdf_text.py` (the reader — the core's, and its line-preserving mode) ·
`tools/import/import_pdf.py` (the CLI) · `app/src/screens/ImportReviewScreen.tsx` (the review
screen) · **Tests:** `core/tests/test_importer.py` (10) · `core/tests/test_pdf_text.py` (5) ·
**Spec:** `docs/spec/byo-pdf-importer-v0.md`

## Context

The plan's law system has three channels (§5.6) and its P4 track asks for the rule packs of
the remaining cities (§6). But some authorities **cannot be redistributed** — the plan's own
note says so, and names the way out: *the BYO-PDF importer path; structured rule data +
user-provided copies*.

So the path is: the user brings their own PDF, the app reads it, and the clauses in it
become candidates a human can look at. What existed before W4.7 was a PDF *reader* — a
tool script, loaded by path from two places — and nothing at all that turned a PDF into
rule data.

## Decisions

1. **A candidate is not law.** The importer produces *candidates*: a number, a page and the
   text. The document says `status: candidate` and carries no pack keys at all — no
   `tables`, no `authority`, no `regime` — so nothing in it can be mistaken for a rule ·
   ·. A rule lives in a **pack**, and a pack is written by hand, from reviewed candidates ·
   ·.
2. **Every candidate cites its page** — the same law the price cards follow (a number
   carries its source) ·, because a clause without a page cannot be checked · ·.
3. **A human decides, and the decision is recorded** — who, when, and why ·. The ledger is
   the *evidence* that a rule entered a pack deliberately ·, and a candidate with no
   decision is visibly unreviewed (`review: null`, and the counts carry `unreviewed`) · ·
   so a pack cannot be built from candidates nobody looked at · ·.
4. **The PDF reader is the core's** (`core/src/archres_core/pdf_text.py`) ·. The app is a
   shell over the core, so a user's own PDF has to be readable *from* the core · — and the
   price transcriber and the reader's own test now import it the ordinary way instead of
   loading it by path · ·.
5. **The reader gained a line-preserving mode** (`read_pdf(path, lines=True)`) ·, and the
   **default is unchanged** · so the price cards are read exactly as before · ·. This was
   necessary, not decorative: the reader produced the page's words *run together*, so a
   page's provisions were one long run of words and the importer would have found the
   **first** provision only · — a line is where the text moves to a different height on the
   page, which is the lightest reading of the layout · ·.
6. **The extraction is a heuristic, and it says so** ·. A line that begins with a number
   opens a provision, and the lines up to the next one are its body · ·. A book whose
   provisions are not numbered yields **no candidates** — that is a fact, not a failure to
   be papered over · ·.

## Consequences

- **The plan's BYO-PDF path now exists** ·: a user's own PDF → candidates → a human's
  decisions · ·, and the review screen is where those decisions are made · ·.
- **The price card is untouched** · — the reader's default is the same as before, and
  `tools/prices/transcribe_card.py --check` still passes · ·.
- **The review screen is the app's prototype screen** ·, with mock data like every other
  screen in the prototype · — the shape it shows is the core's candidate document ·, so
  the screen and the record cannot drift apart · ·.
- **What is deliberately not here** ·: promoting accepted candidates into a pack (a pack is
  written by hand, from reviewed candidates) · ·, and OCR for scanned books (the reader
  reads text PDFs, as it always has) · ·.
