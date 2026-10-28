# ADR-0081 — The importer reads the numbering the books use, and the reader reads the gazette

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W4.7 (the BYO-PDF importer —
the reader and the extraction) · **Plan:** §5.6 (the law system) · §9 (the quality gates:
unverified content is a candidate) · **Related:** ADR-0080 (a page the reader cannot read is
a gap, not a crash), ADR-0056 (the importer), ADR-0003 (the rule packs)
**Code:** `core/src/archres_core/importer.py` (the extraction) ·
`core/src/archres_core/pdf_text.py` (the reader) ·
**Tests:** `core/tests/test_importer.py` (17) · `core/tests/test_pdf_text.py` (9) ·
**Spec:** `docs/spec/byo-pdf-importer-v0.md`

## Context

The W4.5 hunt fetched the authorities' own documents, and reading them with the repo's own
reader found **two defects** and **one gap**.

**The defects** (both in the reader, both real):

1. the font dictionary is sometimes an object of its own (`/Font 23 0 R` ✓), and the reader
   called `.find` on the **match** rather than on the bytes ✓ ✗ — so it fell over ✓ ✗;
2. the **ToUnicode CMap** parser read a `bfrange`'s **array** of destinations as if they
   were the next range's own numbers ✓ ✗ — which built a range of **ten billion** codes ✓ ✗
   and raised `OverflowError` ✓ ✗.

Defect 2 was worse than a crash on a rare file: it meant the reader **could not read the
RAJUK gazette at all** ✓ ✗ — and the gazette is the source the repo's own **rule pack** is
transcribed from ✓ ✓. The gazette's own recipe used a different tool (pymupdf ✓), so the gap
was invisible ✓ ✗.

**The gap** was in the importer ✓: the extraction only read a **dotted** number ("3.15" ✓),
so the books the plan points at — which number their clauses "(1)" ✓, "(a)" ✓ and "1." ✓ —
yielded **no candidates at all** ✓ ✗. The feature whose whole purpose is to read a user's
own copy of a book that cannot be redistributed found **nothing** in the books ✓ ✗.

## Decisions

1. **The reader reads the gazette** — a `bfrange` is read **whole** ✓ (an array is an array ✓,
   a start code is a start code ✓), and a range that cannot be a mapping (longer than a
   font's code space ✓, or a destination past the last code point ✓) is **dropped** ✓ — a
   misread of the file, not a mapping ✓ ✓ (ADR-0080 ✓ ✓: a gap to declare, not a crash to
   raise ✓ ✓).
2. **The importer reads the numbering the books use** — all three forms ✓: a dotted run
   ("3.15" ✓), a section number ("1." ✓, "12A." ✓) and a bracketed number or letter
   ("(1)" ✓, "(a)" ✓, "(ক)" ✓) ✓ ✓.
3. **Each form is cited the way it can be checked** — the dotted and section forms are cited
   by their number ✓ (the number is unique in the book ✓), and a **bracketed** clause is
   cited by its number **and its page** ✓ ✓, because "(1)" opens under every section ✓ and a
   clause without a page cannot be checked ✓ ✓. And the number a candidate carries is the
   book's **own** citation ✓ ✓ — "(1)" ✓, "1." ✓, "3.15" ✓ — because a reviewer looks the
   clause up in the book ✓ ✓, and a bare "1" would not say whether it is a section 1 ✓ or a
   clause (1) ✓ ✓ (the id stays a key ✓ — the ledger holds it ✓ — so the book's punctuation
   is not in it ✓ ✓).
4. **The same number seen twice is the same clause, and the longer text wins** — a book's
   contents list carries a section's *title* ✓ and its body carries the *clause* ✓, so the
   body is the one a reviewer must check ✓ ✓ — and a running header (shorter ✓) does not
   shadow it ✓ ✓.
5. **Nothing becomes law** — the candidates are still **candidates** ✓ ✓, every one carries
   its page ✓ ✓, and a human still decides ✓ ✓ (the plan's law, unchanged ✓).

## Consequences

- **The feature works on the books it exists for** — the KDA's Act 2018 gives **194**
  candidates (it was **none** ✓), the English 1952 Act **54** (it was **none** ✓), the
  Chattogram's Act 1952 **797** (it was 127 ✓) and the Sylhet rules **178** (it was 9 ✓) ✓
  — and every one of them cites its page ✓ ✓.
- **The gazette reads** — 199 pages ✓, 219,343 characters ✓ — and its page count agrees
  with what the rule pack itself records ✓ ✓, and the price card **rebuilds identically**
  under the fixed reader ✓ ✓ (so the fix is safe, not a change of numbers ✓ ✓).
- **What is deliberately not here** — **OCR** ✓ (a new dependency ✓, and the owner's call ✓
  ✓ ✓) and **the layout** ✓ (the reader reads a page's lines ✓, and nothing about columns
  or reading order ✓ ✓); and the extraction is **still a heuristic** ✓ — a line that opens
  a number opens a provision ✓, and a reviewer with the page in front of them decides what it
  means ✓ ✓.
