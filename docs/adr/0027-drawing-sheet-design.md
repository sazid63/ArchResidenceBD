# ADR-0027 — The sheet is a design, and the annotation layer is ours

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.5
**Code:** `core/src/archres_core/design/drawing.py` · `cad/worker/worker.py` ·
`tools/cad/sheet_probe.py` · **Spec:** `docs/spec/drawing-sheet-v0.md`
**Depends on:** W2.2, W2.3, W2.1 · spike S3 · ADR-0004 (branding law)

## Context

The plan's drawings are a deliverable: PDF + DXF, Bangla and English, engineer-reviewable. The
CAD engine can project views headless (S3 proved it in 0.9 s per process) and can export the
SVG fragments and the DXF. S3 also found the trap that decides this design: **native TechDraw
dimensions are unusable headless** — every `DrawViewDimension` reference comes back corrupt and
`getRawValue()` stays 0.0 — and the GUI module cannot load in a console process at all.

So a "drawing job" cannot be "ask TechDraw for a sheet". It has to be: *compute the sheet's
content here, then let the engine project and export*.

## Decisions

1. **The sheet is a design, like every other artefact.** The model it shows, the two views, the
   annotation values, the title block and the scale are computed from the Building Spec through
   the W2.2/W2.3 designs, each number with its provenance (`spec` / `derived` / `assumed`). The
   macro is a mechanical rendering of that design, exactly like the foundation, floor and rebar
   macros.
2. **The annotation layer is ours.** The dimension values are computed from the design and drawn
   by our own SVG composer; nothing on the sheet depends on a headless dimension object that
   cannot resolve. This is the plan's "scripts first, GUI last" applied to drawings.
3. **The sheet carries the pack's status.** The pack is a *candidate*, so the sheet says
   "Candidate - not for construction" in the title block. A drawing that overstates its own
   authority is worse than no drawing.
4. **The brand guard is in the generator.** The template's engine plumbing (the namespace
   declaration and the `freecad:*` editable attributes) is stripped and the generator refuses
   to write a sheet whose text contains the engine name (ADR-0004). The check is code, not a
   reviewer's memory.
5. **The SVG is the master; the PDF and the DXF are exports.** The SVG is byte-stable; the DXF
   carries the geometry layer (S3's measurement: `writeDXFPage` is geometry only — the
   annotated sheet lives in the SVG/PDF); the PDF is rendered from our SVG by the engine's
   bundled Qt and is therefore **exempt from byte equality** (it carries a `/CreationDate`).
   The probe demands byte-identical SVG and DXF across two runs and states the exemption.
6. **The sheet is drawn by the same worker pool as the geometry** — the `drawing.sheet` job kind
   runs in the same persistent, isolated workers, with the same artifacts, hashes and clean
   shutdown. One engine, one contract, one pool.
7. **v0's limits are declared, not implied.** One sheet, two views; the annotation layer is
   English (the template ships an ISO font — Bangla on drawings is a font and licensing
   question); no elevations, sections, details or schedules yet.

## Consequences

- A drawing is reproducible from the spec: same spec, same bytes, and the numbers on the sheet
  are the design's own numbers.
- The sheet can be produced on the dev machine, on the weekly CAD job, and later inside the
  app, without a GUI and without a new dependency.
- The "who computes the dimension" question has one answer: we do, from the design. A future
  elevation or a detail sheet is more views and more dimensions in the same chain.
- The DXF is an interchange layer, not the annotated sheet — a consumer that expects the
  dimensions in the DXF will not find them, and the spec says so.
