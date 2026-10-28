# ADR-0045 — The MEP engines: the points, the sizes and the schedules, all deterministic

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.1 (the MEP engines)
**Code:** `core/src/archres_core/design/mep.py` · `tools/mep/build_mep.py` ·
`core/tests/test_design_mep.py` · **Spec:** `docs/spec/mep-v0.md`
**Depends on:** W2.12 (the common services) · plan §5.7, §6, §9

## Context

The plan's §5.7 asks for *"point layouts + schedules + deterministic sizing (electrical
load/circuits, water fixture units, drainage slopes, Titas gas, lift check)"*, with **full 3D
routing in v2** and **everything deterministic**. W2.12 delivered the runs and the lift's fit
check; the layouts, the sizing and the schedules did not exist.

The v0 rule pack has **no MEP rule at all** — no point layout, no circuit rule, no pipe sizing,
no drainage standard. So this package could only do what the foundation, the floor and the
common services did: **compute what can be computed, and hand back everything else as an
authored assumption** ✓.

## Decisions

1. **The MEP is a design and a set of schedules, not geometry.** The plan puts the full 3D
   routing in v2, so v0 has **points**, not solids — and a design with no solids needs **no
   engine** ✓. The check is therefore the *deterministic* half (re-derive the document,
   compare it with the committed one ✓), which is a CI step ✓, exactly like the other
   offline checks ✓.
2. **The layouts are computed from the floor's area, and the area comes from the spec.** The
   spec's `typicalUnitAreaSqm` × the units on the storey is the area the point layout is sized
   by ✓; the slab's extent is the fallback ✓. A layout that a human typed would be a layout
   with no rule behind it ✓.
3. **The circuits are the points packed into a load the cable carries.** A circuit's load is
   the sum of its points' loads ✓, the packing stops at the cable's limit (3,000 W ✓), and
   every point lands on **exactly one** circuit ✓ (a test holds that ✓).
4. **The pipe is sized by the fixture units it serves** ✓ — the standard sizing unit for water,
   and the reason the WFU is computed at all ✓. The **supply pipe the fixtures hang off** is
   sized here ✓; the grid's main is W2.12's assumed 50 mm branch ✓ — two different pipes, and
   the schedule says which is which ✓ ✓ (two packages must not disagree about one pipe ✓).
5. **The spec decides what a storey is for.** The example's ground floor is **parking** ✓
   (the spec says so ✓), so it carries **no fixture and no cooker** ✓ — the lights and the
   soil stack are there, the kitchen sink is not ✓. The spec wins over the design ✓.
6. **The lift is the building's, so it is scheduled once** ✓ — on the ground floor ✓ — and the
   row reports the **fit check** ✓, not just the sizes ✓. A schedule row that cannot say
   "the car does not fit" is not a schedule ✓.
7. **Every number is handed back.** Twelve authored assumptions go back to the app with a
   reason and a spec pointer ✓ — the same contract as the foundation's, the floor's and the
   common services' ✓ ✓. The derived values carry their provenance ✓.
8. **What is not covered is named, not implied** ✓: the 3D routing ✓, the switchboards and
   the service capacity ✓, the vent pipes ✓, the riser ✓, the coordination with the structure
   ✓, and the master integration ✓.

## Consequences

- The MEP is **deterministic and engine-free** ✓ — a CI step re-derives it and a stale
  artefact fails the build ✓ ✓.
- The schedules are **data** ✓ — they can be rendered into a document ✓, carried by the master
  ✓ and checked by the clash report ✓ (W3.2 ✓) without being re-derived.
- A **parking floor does not grow a kitchen** ✓ ✓, and the test holds it ✓.
- The assumptions are **in the artefact** ✓ — the app can write them into the spec with their
  reasons ✓, and a reader can see exactly which numbers are authored ✓.
- The **master does not yet carry the MEP** ✓ — named ✓, and it is W3.2's job ✓ (W3.2 reads
  the master ✓).
