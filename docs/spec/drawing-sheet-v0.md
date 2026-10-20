# Drawing sheet v0 (W2.5)

**Status:** v0.1.0 — the Building Spec produces a sheet a human can read, in the real engine.
**Code:** `core/src/archres_core/design/drawing.py` (the sheet design + the macro) ·
`cad/worker/worker.py` (the `drawing.sheet` job kind) · `tools/cad/sheet_probe.py` (live probe) ·
`core/tests/test_design_drawing.py` (6 tests) · **Decision record:** ADR-0027
**Depends on:** W2.2 (the foundation design), W2.3 (the floor design), W2.1 (the worker pool),
spike S3 (headless TechDraw) · **Plan:** §6 (drawings: PDF + DXF, BN+EN) · §8 (byte-stable
artifacts) · §9 (identical outputs, no silent gaps) · ADR-0004 (branding law)

## What it is

The sheet is a *design*, like every other artefact in this package: the model it shows, the two
views, the annotation values, the title block and the scale are all computed from the Building
Spec through the W2.2/W2.3 designs, each number with its provenance. The macro is a mechanical
rendering of that design.

**The trap that shapes it (spike S3):** native TechDraw dimensions are *unusable headless* —
every 2D reference comes back corrupt and the value stays 0.0. So the annotation values are
computed here, from the design, and drawn by our own composer. That is the repo's law anyway
(scripts first, GUI last), and it is why the dimension strings on the sheet are the design's own
numbers rather than a renderer's guess.

## The sheet

- **Views:** a *front elevation* (the footings and the columns) and a *ground floor plan* (the
  columns and the slab), both projected from the same model, at **1:30** (a declared value).
- **Annotation layer:** the overall width, the overall height and the plan depth — computed
  from the design — plus the view labels and the scale.
- **Title block:** the project name, the sheet title, the drawing number, the scale, the issue
  date and **the pack's status**: the sheet says *"Candidate - not for construction"*, because
  the pack it was drawn from is a candidate.
- **The brand guard (ADR-0004):** the template's engine plumbing (the namespace declaration and
  the `freecad:*` editable attributes) is stripped, and the generator refuses to write a sheet
  whose text contains the engine name. The check is in the generator, not in a reviewer's
  memory.

## Live probe (2026-10-21, FreeCAD 1.1.4, Windows)

`uv run --directory core python ../tools/cad/sheet_probe.py --engine "<freecadcmd>"` — the
`two-storey-residential` example, through the W2.1 worker pool as a `drawing.sheet` job:

| Measurement | Value |
|---|---|
| `page.svg` | **14,466 B** — 15 groups, 111 paths, both views, four dimension texts, the title block |
| `page.dxf` | **19,843 B** — the geometry layer (S3 measured: the DXF carries geometry, not the annotation) |
| `page.pdf` | **455,726 B** — a real vector PDF (header + `%%EOF`), rendered from our SVG by the engine's bundled Qt |
| `sheet-design.json` | 2,547 B — the design the sheet was drawn from |
| Annotation values | 18.75 m overall, 3.30 m high, 1.65 m deep — the design's own numbers |
| **Two runs** | **byte-identical SVG and DXF** (the PDF is exempt: it carries a `/CreationDate`, exactly as S3 measured) |
| Engine name in the sheet | **none** |

## What is deliberately not here

- **Elevation dimensions, sections, details, door/window schedules** — v0 draws one sheet with two
  views. The others are the same chain with more views.
- **Native TechDraw dimensions** — they do not work headless (S3); the annotation layer is ours.
- **The PDF as the master.** The sheet's master is the SVG (byte-stable); the PDF and the DXF
  are exports of it, and the DXF is geometry only (S3's measurement).
- **Bangla text on the sheet** — the template ships an ISO font; the v0 sheet's labels are in
  English. Bangla on drawings is a font/licensing question, not a code one, and it is declared
  here rather than silently absent.

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_drawing.py     # the design
uv run --directory core python ../tools/cad/sheet_probe.py --engine "<freecadcmd>"   # live
```
