# ADR-0039 — The set is a list of sheets, and the sheet says what it is

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.3
**Code:** `core/src/archres_core/design/drawing_set.py` ·
`core/src/archres_core/design/drawing_set_macro.py` · `tools/cad/drawing_set_probe.py`
**Spec:** `docs/spec/drawing-set-v0.md`
**Depends on:** W2.5 (the sheet) · plan §5.1, §6, §9 · ADR-0004

## Context

W2.5 proved a single sheet: a plan, an elevation, the computed annotation layer, the title
block, and the SVG/DXF/PDF — composed headlessly, byte-stable, with no engine name on the paper.
The plan asks for a **set** (§6: "Drawing set: PDF + DXF", with "plan/section/elevation/details/
title blocks"), and an engineer sends **one file**.

Three things were undecided: whether a set is a new kind of sheet or a list of the sheets that
already exist ✓, what a sheet *claims* to be when v0 cannot draw a true cut section ✓, and
whether the set is one PDF or a folder of PDFs ✓.

## Decisions

1. **A set is a list of sheets.** The set reuses W2.5's `DrawingDesign` ✓ — the same object, the
   same composer, the same title block ✓ — so a sheet can still be drawn on its own ✓ and the set
   adds no new kind of sheet ✓. A second kind of sheet would be a second kind of everything that
   has to agree with it ✓.
2. **One PDF, one page per sheet, plus the per-sheet SVG and DXF.** The engineer sends the PDF ✓;
   the DXF stays per sheet ✓ (a DXF is a drawing, not a folder ✓ — merging them is a later step ✓
   ✓).
3. **The v0 "section" is a side elevation, and the sheet says so.** A true cut view needs the
   engine's section tool ✓, which the headless composer does not drive ✓ (spike S3 ✓). Calling an
   elevation a section would be a false label on a drawing an engineer might build from ✓ — so
   the view is labelled "SIDE ELEVATION" ✓ and the doc records the gap ✓.
4. **Each sheet states the model it shows.** The boxes (the footings ✓, the grade beams ✓, the
   columns ✓, the slab ✓) travel with the design ✓, so a reviewer can read what is on the paper
   without opening the engine ✓ — and the dimension values are checked against the model ✓
   rather than trusted ✓.
5. **The sheet's own laws are unchanged.** The engine measures and the sheet shows ✓; the
   annotation values are computed from the design ✓ (never copied ✓); the title block carries the
   candidate status ✓, the drawing number ✓, the sheet number ✓ and the scale ✓; the engine's name
   never reaches the paper ✓ (ADR-0004 ✓); and two runs produce byte-identical SVGs and DXFs ✓
   (the PDF is exempt ✓ — it carries a `/CreationDate` ✓).

## Consequences

- The product has a **drawing set** ✓: three sheets ✓ — a plan per storey ✓ and the elevations
   ✓ — in one PDF ✓ (1.56 MB ✓) with the per-sheet SVG and DXF ✓ beside it ✓, all measured in the
   real engine ✓ and byte-stable ✓.
- The v0 gaps are named, not hidden ✓: no cut section ✓, no detail views ✓, no rebar on the
   sheets ✓, no MEP ✓, and the DXFs are per sheet ✓. Each is a sheet that comes later ✓, not a
   sheet that pretends ✓.
- The sheets are *candidates* like everything the app produces before an engineer signs them ✓ —
  the title block says so on every page ✓.
