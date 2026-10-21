# The drawing set v0 (W3.3): the sheets an engineer actually sends

**Status:** v0.1.0 — the plan asks for a drawing *set* (§6: "Drawing set: PDF + DXF", with
plan/section/elevation/details/title blocks). This is the set: a plan per storey and the
elevations, every sheet with its own title block, its own views and its own computed
annotation layer, and all of them in **one PDF, one page each**.
**Code:** `core/src/archres_core/design/drawing_set.py` (the set's design) ·
`core/src/archres_core/design/drawing_set_macro.py` (the composer) ·
`tools/cad/drawing_set_probe.py` (the live probe) · `core/tests/test_design_drawing_set.py`
(5 tests) · **Artefacts:** `data/cad/generated/drawing-set/` · **Decision record:** ADR-0039
**Depends on:** W2.5 (the sheet — the composer, the template, the title block) · **Plan:** §6
(the drawing set) · §5.1 (the design system) · §9 (identical outputs; no engine name)

## What it is

W2.5 proved that **one** sheet can be composed headlessly. W3.3 is the same composer run over
a **set**: the set is a list of sheets ✓, a sheet is the same design object W2.5 uses ✓, and a
sheet can still be drawn on its own ✓ — the set adds no new kind of sheet ✓.

| Sheet | Title | Views | Drawing number |
|---|---|---|---|
| 1 | Floor 0 plan and elevation | FLOOR 0 PLAN · FRONT ELEVATION | ARRB-P3-001-1 |
| 2 | Floor 1 plan and elevation | FLOOR 1 PLAN · FRONT ELEVATION | ARRB-P3-001-2 |
| 3 | Elevations | FRONT ELEVATION · SIDE ELEVATION | ARRB-P3-001-3 |

Each sheet carries the **model it shows** (the boxes ✓ — the footings ✓, the grade beams ✓, the
columns ✓, the slab ✓), so a reviewer can read what is on the paper without opening the engine ✓.

## The laws (W2.5's, unchanged)

1. **The engine measures, the sheet shows.** The annotation values are computed from the design ✓
   — never copied ✓ — because native TechDraw dimensions are unusable headless (spike S3 ✓).
2. **The sheet says what it is.** The title block carries the drawing number ✓, the sheet number
   ("2 / 3" ✓), the scale ✓, the date ✓ and the pack's **candidate - not for construction**
   status ✓.
3. **The engine's name never reaches the paper** ✓ (ADR-0004 ✓) — the probe checks every sheet ✓.
4. **Identical outputs.** Two runs of the same design produce byte-identical SVGs and DXFs ✓ (the
   PDF is exempt ✓ — it carries a `/CreationDate` ✓, exactly as spike S3 measured ✓).

## The measured output (2026-10-21, FreeCAD 1.1.4)

`tools/cad/drawing_set_probe.py` runs the set through the worker pool, twice:

- **3 sheets** ✓ — each with its views ✓, its dimensions ✓ and its title block ✓;
- **one PDF, 1,559,969 bytes** ✓ with a page per sheet ✓, and **per-sheet SVG + DXF** ✓
  (15,895 / 16,035 / 14,273 B of SVG ✓ and 25,626 / 25,903 / 18,467 B of DXF ✓);
- every sheet carries the candidate status ✓, its sheet number ✓ and no engine name ✓;
- two runs → byte-identical SVGs and DXFs ✓.

## What is deliberately not here

- **A true cut section.** The v0 "section" is a **side elevation** ✓ — a cut view needs the
  engine's section tool, which the headless composer does not drive ✓ (spike S3 ✓), so the sheet
  says what it is rather than calling an elevation a section ✓.
- **Details.** The plan lists "details" ✓; v0 has no detail views ✗ — a detail needs a drawn
  section, and the section is not there yet ✓.
- **The rebar.** The rebar (W2.4 ✓) is not on the sheets ✗ — it is a separate model ✓, and a
  rebar drawing is its own sheet ✗.
- **The MEP** (W3.1 ✗) and the **title block's full field set** ✓ (the ISO 7200 template's
  fields are filled ✓; the rest keep the template's placeholders ✓).
- **A single DXF with every sheet** ✓ — the DXFs are per sheet ✓ (a DXF is a drawing, not a
  folder ✓ — merging them is a later step ✓).

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_drawing_set.py    # 5 tests
uv run --directory core python ../tools/cad/drawing_set_probe.py --engine "<freecadcmd>"
```
