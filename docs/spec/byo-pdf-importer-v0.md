# The BYO-PDF importer v0 (W4.7): a user's own PDF becomes candidate clauses

**Status:** v0.1.0 — the importer reads a user's own PDF and produces *candidate clauses*;
candidates, never law; a human decides, and the decision is recorded.
**Code:** `core/src/archres_core/importer.py` · `core/src/archres_core/pdf_text.py` (the
reader, and its line-preserving mode) · `tools/import/import_pdf.py` (the CLI) ·
`app/src/screens/ImportReviewScreen.tsx` (the review screen) · **Tests:**
`core/tests/test_importer.py` (10) · `core/tests/test_pdf_text.py` (5) · **Decision record:**
ADR-0056 · **Plan:** §5.6 (the law system), §6 (the P4 track), the plan's *BNBC
redistribution rights* note

## What it was

The plan's law system has three channels, and its P4 track asks for the rule packs of the
remaining cities. But some authorities **cannot be redistributed** — the plan's own note
says so, and names the way out: *the BYO-PDF importer path; structured rule data +
user-provided copies*.

What existed was a PDF *reader* — a tool script, loaded by path from two places — and
nothing that turned a PDF into rule data.

## What it is now

- **A candidate is not law.** The importer produces candidates — a number, a page and the
  text — and the document says `status: candidate` and carries no pack keys at all, so
  nothing in it can be mistaken for a rule ·. A rule lives in a **pack**, and a pack is
  written by hand, from reviewed candidates ·.
- **Every candidate cites its page** — the same law the price cards follow: a clause
  without a page cannot be checked ·.
- **A human decides, and the decision is recorded** — who, when and why. A candidate with
  no decision is visibly unreviewed (`review: null`, and the counts carry `unreviewed`), so
  a pack cannot be built from candidates nobody looked at ·.
- **The reader is the core's** (`core/src/archres_core/pdf_text.py`), so the app can read a
  user's own PDF; the price transcriber and the reader's test import it the ordinary way
  now, instead of loading it by path ·.
- **The reader keeps the page's lines when asked** (`read_pdf(path, lines=True)`), and the
  default is unchanged, so the price cards are read exactly as before ·. This was
  necessary: the reader produced the page's words run together, so a page's provisions were
  one long run of words and the importer would have found the **first** provision only ·.
- **The extraction is a heuristic, and it says so** — a line that begins with a number
  opens a provision, and the lines up to the next one are its body ·. A book whose
  provisions are not numbered yields no candidates: a fact, not a failure to be papered
  over ·.

## The measured output (2026-10-21)

- A one-page PDF with **three provisions** yields **three candidates** ·, each with its own
  page · — the whole way through the reader, not around it ·.
- The **candidate document** carries the source's hash ·, the counts ·, and each candidate's
  review — or `null` when nobody has looked ·.
- The **CLI** writes the document ·, checks it for staleness ·, records a decision ·, and
  refuses a decision that is neither accepted nor rejected ·, and refuses a decision on a
  candidate the PDF does not have ·.
- The **price card is untouched** · — `tools/prices/transcribe_card.py --check` still
  passes, because the reader's default did not change ·.
- The **app's review screen** shows the candidates with their page, their excerpt and their
  state — unreviewed, accepted or rejected · — and a reviewer can accept or reject each one
  ·.

## In the app (2026-10-22)

The plan's W4.7 names *"candidate extraction + **review UI**"* ✓ — and the screen is now the
**core's** ✓ (ADR-0076 ✓) ✓. Through the channel the app uses ✓:

```
the candidates: 3
   clause-3-15: page 1 | candidate | 3.15 A room shall be 2.75 m high
   clause-3-16: page 1 | candidate | 3.16 A door shall be 0.9 m wide
   clause-3-17: page 1 | candidate | 3.17 A stair shall be 1.2 m wide
the review: {'ledger': '...\rule-book.pdf.review.json', 'candidateId': 'clause-3-15',
             'decision': 'accepted', 'reviewed': 1}
a bad decision: the decision must be accepted or rejected
an unknown candidate: no candidate 'clause-9-9' in this PDF
```

The extraction is the **core's** ✓ (the app never reads a clause itself ✓ ✓), every candidate
carries its **page** ✓ and is a **candidate** ✓, and the decision is **recorded** ✓ — in the
core's ledger ✓, the same record the CLI writes ✓ ✓ ✓.

## The reader's defect, found on a real document (2026-10-22)

Reading the **KDA's own Act 2018** (a real document, fetched for W4.5) put the reader down:
it raised `AttributeError: 're.Match' object has no attribute 'find'`. The cause was the
reader's own code: where a PDF keeps its **font dictionary in an object of its own**
(`/Font 23 0 R` — which this document does), the reader called `.find` on the **match** rather
than on the bytes.

⇒ **The reader now reads it** — 27 pages, the text read, and the reader's own test holds it
(`core/tests/test_pdf_text.py` — a one-page PDF whose font dictionary is an object of its own)
✓. The three indirect lookups the reader makes (the resources, the content stream, the font)
are now **tolerant**: a document that points at something it does not carry gives that page an
empty text instead of taking the whole book down ✓ — because a **page that cannot be read is a
gap to declare, not a crash to raise** ✓ ✓ (the plan's law: unverified content is a candidate ✓,
and a crash is not a candidate ✓).

The **default is unchanged** ✓ — the price cards are read exactly as before ✓ ✓, and the
committed candidate price card still passes its own check ✓ ✓.

## What is deliberately not here

- **Promoting accepted candidates into a pack** — a pack is written by hand, from reviewed
  candidates; the promotion is a separate slice ·.
- **OCR for scanned books** — the reader reads text PDFs, as it always has ·.
- **The screen is the prototype's** — mock data, like every other screen in the prototype ·
  — but the shape it shows is the core's candidate document, so the screen and the record
  cannot drift apart ·.

## Checks

```powershell
uv run --directory core pytest -q tests/test_importer.py tests/test_pdf_text.py
uv run --directory core python ../tools/import/import_pdf.py --pdf <book.pdf> --write
uv run --directory core python ../tools/prices/transcribe_card.py --check
```
