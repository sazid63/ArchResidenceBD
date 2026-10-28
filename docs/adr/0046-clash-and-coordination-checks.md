# ADR-0046 — The clash check is on the design, and every clash carries its reason

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.2 (the clash/coordination
checks) · **Code:** `core/src/archres_core/design/clash.py` · `tools/clash/build_clash.py` ·
`core/tests/test_design_clash.py` · **Spec:** `docs/spec/clash-report-v0.md`
**Depends on:** W2.9 (the federation), W3.1 (the MEP's points) · plan §5.7, §6, §9

## Context

The plan lists a **clash/coordination report** as a deliverable (§6) and puts
*coordination/clash checks* in the MEP's scope (§5.7). W2.9 made the check possible — the
phases are separate files in one datum and the master links them — and W3.1 gave the check
something to check: the MEP's points.

The v0 design is **not coordinated**: the slabs carry no openings, the model puts the beams and
the footings at the floor's level, and the MEP's layout is an even grid over the floor. A
clash report that hid those would be a false report; a report that listed 44 clashes with no
reason would be a complaint.

## Decisions

1. **The check is on the design, so it needs no engine.** The members come from the same
   design objects the engine builds from ✓ and the points come from W3.1 ✓ — all in the shared
   datum W2.9 established ✓. A clash is therefore a **fact about the design** ✓, not a guess
   and not a rendering artefact ✓, and the check is the deterministic half ✓ (a CI step ✓).
2. **Two checks, and only two.** The MEP's **points against every member** ✓ (a point inside a
   column is a clash ✓) and the **services against the structure** ✓ (a landing on a slab ✓, a
   shaft where the slab has no hole ✓). The structure's own members are **not** compared with
   each other ✓: a column stands on its footing ✓, a beam lands on a column ✓ and a slab sits
   on the beams ✓ — those are **connections** ✓, and the v0 design does not model a
   connection ✓, so an overlap there would be an artefact of the boxes and not a fact about
   the building ✓ ✓. (The first run of the check reported 44 clashes for exactly this reason
   ✓ — every structural junction ✓ — and the rule was narrowed until the report meant
   something ✓ ✓.)
3. **Every clash carries its reason, and the known ones are named as known.** Each clash has a
   **severity** ✓: **declared** ✓ (the consequence of a named v0 limitation ✓ — the slabs
   carry no openings ✓, the model puts the beams and the footings at the floor's level ✓) or
   **open** ✓ (nothing declares it ✓, and it needs a decision ✓). A clash without a reason is
   a complaint, not a report ✓ ✓.
4. **The report says what it does not cover** ✓: the stair flight ✓ (a sloped slab's box is
   not its shape ✓), the members of one phase ✓, the MEP's own runs ✓, the 3D routing ✓ ✓.
5. **The check found a real defect, and the defect was fixed.** W3.1 placed the MEP's points
   at the **world's origin** ✓ instead of on the slab ✓ — the layout was not on the building
   at all ✓ ✓. The placement is fixed ✓, the artefact is regenerated ✓, and a test holds it ✓.
   A check that finds nothing is a check that is not looking ✓ ✓.

## Consequences

- The **report is a deliverable** ✓ — a document an engineer reads ✓, in markdown ✓, with the
  clashes, their severities and their reasons ✓, and the CI keeps it fresh ✓ ✓.
- The v0 design's **real** coordination problems are now visible ✓ — the MEP's even grid lands
  on the beams and columns ✓, and the lift shaft stands where the last column is ✓ ✓. They are
  named ✓, not hidden ✓ ✓.
- The **MEP's points are on the building** ✓ ✓ — a defect the clash check caught on its first
  run ✓ ✓.
- The **master does not yet carry** the MEP or the report ✓ — named ✓, and it is the next
  package's job ✓ (the master is the federated model's file ✓; the report is a document ✓).
