# ADR-0040 — The documents are written with the standard library, and they carry their assumptions

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.4
**Code:** `core/src/archres_core/documents/xlsx.py` · `core/src/archres_core/documents/pdf.py` ·
`core/src/archres_core/documents/bbs.py` · `tools/documents/render_bbs.py`
**Spec:** `docs/spec/bbs-final-v0.md`
**Depends on:** W2.4 (the schedule as data) · plan §2.5, §6, §9

## Context

The plan's documents come in pairs: the **xlsx** an engineer edits ✓ and the **PDF** an engineer
prints and signs ✓. The BBS has existed as **data** since W2.4 ✓ (the marks ✓, the members ✓, the
shapes ✓, the lengths ✓, the weights ✓ — validated against the frozen `bbs.schema.json` ✓), and
the BOQ likewise since W2.6 ✓.

Three things were undecided: whether the xlsx and PDF need a **library** ✓, what the documents
must carry besides the numbers ✓, and where the **Bangla** goes ✓.

## Decisions

1. **No new dependency.** An xlsx is a zip of XML ✓ and a text PDF needs only the built-in
   Helvetica faces ✓ — the standard library writes both ✓. A packaged desktop installer that
   ships a spreadsheet library for two file formats ✗ is a bigger install ✗ and a licence
   question ✗ for no gain ✓.
2. **The workbook is a workbook, not a CSV with an xlsx name.** The numbers stay **numbers** ✓
   (a spreadsheet can sum the column ✓), the header row is bold ✓, the column widths are set ✓,
   and there is a sheet per table ✓. The writer **checks its own output** ✓ — the zip reads back ✓
   and the required parts are there ✓ — because a broken deliverable is a broken deliverable ✓.
3. **The PDF is for text, and the drawings stay with the engine.** The drawing set's PDF comes
   from the engine ✓ (W3.3 ✓), where the vector geometry lives ✓; a drawing printed from a text
   writer would be a lie about what the document is ✓. This writer does tables and reports ✓.
4. **The Bangla is the browser's job.** The plan prints the Bangla reports through
   HTML→print-PDF ✓ "for correct glyph shaping" ✓; the built-in PDF faces have no Bengali ✓, so
   a Bangla PDF from this writer would be unreadable ✓. The writer writes what it can write
   correctly ✓, and the documents it writes are the English engineering ones ✓ ("English labels
   per BD industry norm" ✓).
5. **The assumptions travel with the document.** A schedule whose numbers appear without their
   assumptions is a document nobody can check ✓ — so the authored assumptions (the diameters ✓,
   the cover ✓, the laps ✓) have their own sheet ✓ and their own page ✓, each with its reason ✓.
6. **The document carries the data, not a second opinion.** Every number in the workbook and the
   PDF is the schedule's own number ✓ — the lengths ✓, the weights ✓ and the totals ✓ are the ones
   the engine measured and the BBS computed ✓, never recomputed by the renderer ✓.
7. **The title block says it is a candidate.** The same status the drawing sheet carries ✓ —
   nothing an engineer signs is silently final ✓.

## Consequences

- The **BBS final** exists in the two forms the plan names ✓: a 5,147 byte workbook (four
  sheets ✓) and a 7,493 byte PDF (three pages ✓) ✓, carrying **297 bars ✓ and 278.9998 kg** ✓ —
  the same numbers the walking skeleton measured ✓.
- The two writers are **reusable** ✓: the BOQ final (W3.5 ✓), the compliance report (W3.6 ✓) and
  the engineer pack (W3.7 ✓) will use them ✓ — one format decision ✓, not one per document ✓.
- The gap between the data and the document is closed ✓, and the gap between the *numbers* and
  the *assumptions* is closed with it ✓.
- What is still missing is named ✓: the rebar *drawing* ✓ (its own sheet ✓), the bend details ✓
  and the Bangla ✓ (the browser's ✓).
