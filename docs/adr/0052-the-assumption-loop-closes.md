# ADR-0052 — The pointer a design hands back is the pointer the design read

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** the assumption loop (the
one-way street the P3 packages found — W3.1's spec-fields guard ·)
**Code:** `core/src/archres_core/design/foundation.py` (the `spec_value` helper — the one
implementation ✔) · `core/src/archres_core/design/floor.py` ·
`core/src/archres_core/design/commons.py` · `core/src/archres_core/design/mep.py` ·
`core/tests/test_design_assumption_loop.py` · **Spec:** `docs/spec/assumption-loop-v0.md`
**Depends on:** W2.2, W2.3, W2.12, W3.1 · plan §5.4, §2.5, §9

## Context

The design hands its authored assumptions back so the app can write them into the spec — and
the write side ships ✔: the spec engine patches any path in a phase's data · the interview
engine writes with provenance · and the plan's §2.5 requires it ·.

The read side did not. A design named a pointer, handed the assumption back, and never read that
pointer again — so a value the app had recorded was **silently ignored** ✔. Three shapes of it:
the foundation's assumptions were read by nothing · the floor's pointed at a phase that does
not exist (`/phases/floor/` — the phases are `floor-0`, `floor-1` ·) · and the MEP's were not
JSON pointers at all (`mep.electrical.lightingPointsPer100m2` ·) · so the app could never have
written them ·.

This is the same class as the foundation ignoring the spec's footing depth (ADR-0049 ·) and
worse in one way: the app had already told the user the value was recorded ·.

## Decisions

1. **The pointer a design hands back is the pointer the design read.** One helper — `spec_value`
   in `design/foundation.py` — does it for every design ✔: read the spec's value at the
   pointer · if the spec carries it, use it and say the provenance is `spec` · if not, assume
   the authored default, say the provenance is `assumed`, and hand the assumption back **at that
   same pointer** ··. One implementation, so the rule cannot differ between designs ··.
2. **One pointer per value.** The foundation handed back `gradeBeamMm` — one pointer for the
   grade beam's **width and depth**, two numbers · so the app could not write both ··. They
   are `gradeBeamWidthMm` and `gradeBeamDepthMm` now ··.
3. **The floor's pointers name the storey's own phase** — `/phases/floor-1/data/columnSizeMm` —
   not a phase that does not exist ··.
4. **The MEP's authored values are one table.** 23 values — the electrical densities and loads ·
   the fixture units · the drainage's fall and diameters · the gas's load and pipe · the
   lift's power · the point inset — live in the services phase's data under an `mep.` prefix
   · so they are real pointers ·, and the table is the single source of truth · so the
   defaults the code uses and the assumptions handed back cannot drift apart ··.
5. **The guard writes through the app's own path.** `test_design_assumption_loop.py` writes each
   assumption with `apply_patch` — the spec engine — so the pointer has to resolve for real
   — re-runs the design, and asserts the value comes back as the spec's · and is not handed
   back again ··. A design that hands back a pointer it does not read **fails the test**
   ··.
6. **The numbers did not move.** The spec carries none of these keys, so the authored defaults still
   apply and every measured artefact is unchanged ·· — the change is a contract, not a
   redesign ··.

## Consequences

- The **spec is the source of truth in both directions** ✔: what the app writes is what the
  design uses · and what the design hands back is what the app can write ··.
- The class **cannot come back** ✔: the guard is a property of every design's assumptions
  · not a list of cases ··.
- Every assumed value now **carries its provenance and its source** — and a value the design
  reads is recorded under the pointer it came from ·· (the guard checks that too ·).
- The **app's questions** for these values are still to be written — the read side is here and
  proven · the interview's side is P4/P5's work ··.
