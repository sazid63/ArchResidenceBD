# Walking skeleton v0 (W2.10)

**Status:** v0.1.0 — one small house, end to end, with every number measured.
**Code:** `core/src/archres_core/design/project.py` (the assembly) ·
`tools/walking_skeleton/run.py` (the end-to-end run + the report) ·
`core/tests/test_design_project.py` (4 tests) · **Decision record:** ADR-0029
**Assembles:** W2.2 (foundation), W2.3 (floor), W2.4 (rebar + BBS), W2.5 (sheet), W2.6 (BOQ),
on the W2.1 worker pool · **Plan:** §6 (the pipeline) · **Depends on:** W1.12 (the interview
that fills the spec)

## What it is

The plan's proof for P2: *spec → foundation + floor with rebar → sheet → BOQ*. Every engine in
that chain was its own package; this one **runs them together** and writes the end state, so the
phase's claim is a set of numbers and not a sentence.

The pipeline it follows is the plan's (§6), and the stages v0 does not build are **declared**:

| Phase | Stage in v0 |
|---|---|
| site-excavation | excavation (measured) |
| foundation | footings + grade beams (measured) |
| floor | columns, beams, slab (measured) |
| roof-boundary | **not covered in v0** |
| common-services | **not covered in v0** |
| drawings | the sheet (SVG + DXF + PDF) |
| bbs | the rebar schedule (the BBS) |
| takeoff | the BOQ (priced from a card) |

## The measured end state (2026-10-21, FreeCAD 1.1.4, Windows)

`data/walking-skeleton/two-storey-residential.{json,md}` — the `two-storey-residential` example
through the whole chain:

| Check | Result |
|---|---|
| the model the engine builds vs the design that described it | **15 objects, 5.45175 m³** — the object count matches exactly (4 footings + 3 grade beams + 4 columns + 3 beams + 1 slab) and the volume is inside the declared 5 % fusion band |
| the steel the BBS schedules vs the steel the engine built | **scheduled 279.0 kg vs measured 278.8 kg — 0.077 % apart** (spike S5's law: the bar length comes from the measured volume) |
| the sheet | `page.svg` 14,466 B · `page.dxf` 19,843 B · `page.pdf` 455,726 B — the two views, the computed dimensions, the filled title block, no engine name, the candidate status on the sheet |
| the BOQ | 11 lines, 9 priced, 2 unpriced, **119,599.70 BDT** from the card `dhaka-example-2026-10` (status *candidate*) — every amount re-derives from the line's own quantity and rate |
| the coverage | the two phases v0 does not build are named in the report, not implied |

## The checks, and what each one is for

1. **The object count and the volume** — the engine must build the model the design described. The
   members are *fused*, so the measured volume is at most the sum of the design's boxes; a 5 %
   band is the declared allowance for the overlaps.
2. **The steel** — the schedule and the geometry are two independent computations of the same
   steel (the schedule counts the bars; the engine measures them). They must agree inside 2 %.
3. **The sheet** — the artefacts exist, the SVG is not suspiciously small, no engine name reached
   it, and it carries the pack's candidate status.
4. **The BOQ** — the total is the sum of the priced lines, and the line amounts are quantity ×
   rate.
5. **The coverage** — the stages v0 does not build are declared in the report.

## What is deliberately not here

- **The app.** This is the *pipeline*, not the UI: the walking skeleton answers "does the chain
  produce a building?", while the workspace that shows it is W2.8.
- **The roof, the boundary wall and the common services** (W2.12's scale-out) — declared, not
  faked.
- **A second storey.** The assembly designs one storey (`storey_index=1`); the *project* takes
  a tuple of storeys, so a multi-storey run is a parameter, not a rewrite.
- **Live prices.** The BOQ reads one card from a file; the price service (W2.7) is what makes it
  live.

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_project.py     # the assembly
uv run --directory core python ../tools/walking_skeleton/run.py --engine "<freecadcmd>"   # live
uv run --directory core python ../tools/walking_skeleton/run.py --check                    # the committed report
```
