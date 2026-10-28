# ADR-0029 — The walking skeleton is the phase's proof, and it is a set of numbers

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.10
**Code:** `core/src/archres_core/design/project.py` · `tools/walking_skeleton/run.py`
**Spec:** `docs/spec/walking-skeleton-v0.md` · **Assembles:** W2.1–W2.6

## Context

P2 built six engines in a row: a worker pool, a foundation generator, a floor generator, a rebar
schedule, a drawing sheet and a BOQ. Each one is measured on its own, but a phase of
"generates buildings" is only proved when the whole chain runs on one project and the results
agree with each other.

The plan's walking skeleton is *one small house: spec → foundation + floor with rebar → sheet →
BOQ*. The interesting part is not the house; it is the **agreement** between the stages: the
structure the engine builds must be the structure the design described, the steel the schedule
lists must be the steel the engine measured, and the BOQ's quantities must be the quantities the
design measured.

## Decisions

1. **The assembly is a design, not a script.** `archres_core.design.project` says which design
   belongs to which pipeline stage, in the plan's order, and names the stages v0 does not build
   (`roof-boundary`, `common-services`). A gap the report does not mention is a gap the reader
   cannot see.
2. **Every stage is checked against another stage, not against a stored number.** The engine's
   object count and volume must match the design's; the BBS's scheduled steel must match the
   engine's *measured* steel (spike S5's law: a bar's length comes from its volume); the sheet
   must be a sheet; the BOQ's total must be the sum of its priced lines. A chain that only
   re-reads its own inputs would pass any number of mistakes.
3. **The two independent computations are the point.** The schedule counts bars; the engine
   measures them. The BOQ multiplies the design's quantities by a card's rates; the check
   re-derives every amount from the document's own numbers. Where two ways of computing the same
   thing agree, the number is worth something.
4. **Tolerances are declared, not hoped for.** The fused members make the measured volume a
   little smaller than the sum of the design's boxes (5 % band); the welded steel measures a
   little less than its centreline length (2 % band, spike S5's measurement). Both bands are in
   the code, with the reason.
5. **The report is committed.** `data/walking-skeleton/` holds the end state and a readable
   summary, so the phase's claim can be re-read (and re-checked) without a machine.
6. **This is the pipeline, not the app.** The walking skeleton answers "does the chain produce a
   building?"; the workspace that shows it to a user is W2.8, and the app shell is still the W0.2
   prototype. The gap is declared rather than papered over.

## Consequences

- P2's proof is a number set: 15 objects and 12.36375 m³ of structure, 278.8 kg of steel
  agreeing with the schedule to 0.077 %, a 14.5 kB sheet with two views and computed
  dimensions, and a 154,276.09 BDT BOQ whose every amount re-derives from its own line.
- A regression anywhere in the chain shows up here as a *disagreement between two stages*
  rather than as a wrong-looking number.
- The uncovered phases are in the report, so nobody reads "one house" as "a house".
- The next packages (W2.7 the price service, W2.8 the workspace, W2.9 federation) change what
  the chain consumes and shows, not the chain's arithmetic.
