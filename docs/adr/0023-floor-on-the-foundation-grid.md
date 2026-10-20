# ADR-0023 — The storey rides the foundation's grid

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W2.3
**Code:** `core/src/archres_core/design/floor.py` · `tools/cad/floor_probe.py`
**Spec:** `docs/spec/floor-generator-v0.md` · **Depends on:** W2.2 (the foundation design), W2.1 (the pool)

## Context

W2.2 made the foundation a function of the Building Spec: a design with provenance, a generated
macro, and a measured result. The floors had no such thing yet — the only geometry that existed
above the footings was the W1.8 scratch macro's columns, with hard-coded parameters.

The risk in "generate a floor" is that the floor invents its own grid: the columns would sit
wherever the floor generator felt like, and the foundation would be a different guess about the
same building. Two generators that disagree are not a building; they are two sketches.

The v0 spec also has no wall data and no opening data, so a "typical floor" generator has to
decide what to do with what it was not told.

## Decisions

1. **The floor takes the foundation's grid, not a new one.** One column per footing, at the
   footing's exact position. The foundation and the storey agree by construction; a disagreement
   becomes impossible rather than detectable.
2. **Heights and thicknesses come from the spec; sections are authored assumptions.** The storey
   height is `building.storeys.typicalFloorHeightM` (or `groundFloorHeightM`), the slab
   thickness is the floor phase's `slabThicknessMm`. The column and beam **sections** have no
   rule in the v0 pack, so they are assumptions with reasons, handed back for the spec — the
   same law as the foundation (ADR-0022).
3. **Walls and openings are declared absent, not invented.** The design carries a
   `declaredAbsent` list naming what it did not build and why. A wall nobody asked for is a
   fabricated fact, and a floor with an invented wall would be measured and costed as if it
   were real.
4. **The probe engine is shared.** W2.2 and W2.3 differ only in *what* they design, so the
   probe (build → pool → measure → compare with the computed expectations → two runs must be
   byte-identical → write the reviewable fixtures) lives in `tools/cad/design_probe.py` once,
   and each generator supplies a small builder. The measurement law cannot drift between the
   two generators because there is only one implementation of it.
5. **The generated macro and the design stay committed** (`data/cad/generated/`), with
   `--check` proving freshness on every push and the live probe in the weekly CAD job. What the
   engine will build is readable before it is built.
6. **v0 keeps the honest limits visible.** The grid is a single row, so the slab is as deep as
   the grid; the plan's storey layout (units per floor, room grid) is a later decision and is
   named as such rather than faked.

## Consequences

- The walking skeleton's geometry has a single source of truth: the spec → the foundation
  design → the floor design → the measured result, with the storey riding the foundation.
- Every storey dimension is traceable to a spec pointer, a formula or an authored assumption.
- The app still refuses to guess structure it was not told about (no walls, no openings), and
  says so in the design instead of in a comment.
- A second storey is a parameter (`storeyIndex`), not a second implementation: the ground
  storey already uses its own height.
