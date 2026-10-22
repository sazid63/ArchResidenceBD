# ADR-0080 — A page the reader cannot read is a gap to declare, not a crash to raise

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W4.7 (the BYO-PDF importer —
the reader) · **Plan:** §5.6 (the law system) · §9 (the quality gates: unverified content is
a candidate) · **Related:** ADR-0079 (the city rules), ADR-0056 (the importer), ADR-0003 (the
rule packs)
**Code:** `core/src/archres_core/pdf_text.py` (the reader) ·
**Tests:** `core/tests/test_pdf_text.py` (7) · **Spec:** `docs/spec/byo-pdf-importer-v0.md`

## Context

The W4.5 hunt fetched the **KDA's own Act 2018** — a real document, 27 pages, and the
authority's own law. Reading it put the reader down:

```
AttributeError: 're.Match' object has no attribute 'find'
```

The cause was the reader's own code. Where a PDF keeps its **font dictionary in an object of
its own** (`/Font 23 0 R` — which this document does), the reader looked for the dictionary's
`<<` by calling `.find` on the **match** rather than on the **bytes**.

This is not a rare shape. It is how any writer that keeps the font dictionary apart writes the
file, and the reader is the one that reads a **user's own PDF** — the whole point of W4.7.
So the defect was not "this document is odd": it was **the app would crash on a user's PDF**,
and the crash was an `AttributeError` — not even a clean rejection.

## Decisions

1. **The reader reads the document** — the font dictionary is followed whether it is inline
   (`/Font << … >>`) or an object of its own (`/Font 23 0 R`), and the reader's own test holds
   it (a one-page PDF whose font dictionary is an object of its own) ✓.
2. **The reader's indirect lookups are tolerant** — the resources, the content stream and the
   font dictionary are three lookups into a file that may point at something it does not
   carry, and each now gives that **page** an empty text instead of taking the whole book down
   ✓. A page that cannot be read is a **gap to declare**, not a crash to raise ✓ ✓ — the
   plan's law applied to the reader: unverified content is a candidate ✓, and a crash is not a
   candidate ✓ ✓.
3. **The default is unchanged** — the price cards are read exactly as before ✓, and the
   committed candidate price card still passes its own check ✓ ✓.

## Consequences

- **The app does not crash on a user's PDF** ✓ — the importer's own error path (a clean
  `ImporterError`) is the only way a document can be refused ✓ ✓.
- **A page the reader cannot read is visible as an empty page** ✓ — the page count is the
  book's ✓ and the text is what could be read ✓, so the gap is in the text, where a human
  sees it ✓ ✓, and not in a stack trace ✓ ✓.
- **What is deliberately not here** — **OCR** ✓ (a new dependency ✓, and the owner's call ✓
  ✓ ✓) and **the layout** ✓ (the reader reads a page's lines ✓, and nothing about columns or
  reading order ✓ ✓).
