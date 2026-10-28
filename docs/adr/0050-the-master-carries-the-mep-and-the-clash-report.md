# ADR-0050 — The master carries the MEP and the clash report as properties, beside the datum

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** the master integration ✓ (the
plan's §6 federated deliverable ✓)
**Code:** `core/src/archres_core/cad/federation.py` · `tools/cad/federation_probe.py` ·
`core/tests/test_cad_federation.py` · **Spec:** `docs/spec/federated-master-content-v0.md`
**Depends on:** W2.9 (the federation ✓), W3.1 (the MEP ✓), W3.2 (the clash report ✓) ·
plan §6, §5.3

## Context

The plan's per-project deliverables name the **federated 3D model**: *per-phase models + a
combined master (LOD 300–350, rebar, **MEP points + schedules**, **clash/coordination report**)* ✓.
W2.9 built the first half ✓ — the phases ✓ and the master that links them ✓. The other two
were named and absent ✓ ✓, and both were finished in the packages before this one ✓ (W3.1's MEP
✓, W3.2's clash report ✓ ✓).

## Decisions

1. **The data travels as document properties, beside the datum.** The master is a FreeCAD
   document that *links* the phases ✓ — so it can hold their **data** the same way it already
   holds the datum ✓ ✓. Two properties ✓: `ArchresMep` ✓ (the points, the schedules and the
   declared gaps ✓ ✓) and `ArchresClashReport` ✓ (the report an engineer reads ✓ ✓).
2. **The probe builds both from the design and hands them to the job** ✓ — so what the master
   carries is **the design's own** MEP ✓, not a copy of it ✓ ✓, and a test holds that ✓ ✓
   (the master's points are the design's points ✓ ✓).
3. **The measurement carries them too** ✓, so the probe can check them **without parsing the
   document** ✓ ✓ — and the committed report is the record of what the master holds ✓ ✓.
4. **The size claim that changed is corrected where it was made** ✓ — in the review ✓, in the
   federation's spec doc ✓ and in ADR-0032 ✓ ✓. The master is no longer smaller than a phase
   file ✓, because it carries the MEP and the clash report ✓ ✓; what it must not do is **drift
   from the phases** ✓ ✓, and that is what the probe checks ✓ ✓.
5. **The rebar is not in the master** ✓ — it is its own model ✓, and the BBS is its document ✓
   ✓. The plan's list names it ✓; v0's federation links the structural phases ✓ ✓.

## Consequences

- The **federated deliverable is whole** ✓ ✓ — the phases ✓, the MEP ✓ and the clash report ✓
  are in one document ✓ ✓, and a reader who opens the master sees the data as well as the
  geometry ✓ ✓.
- The master is **bigger than a phase file** ✓ ✓, and every document that made the opposite
  claim says so no longer ✓ ✓.
- The **master in the viewport** ✓ is still absent ✓ — the workspace draws one document ✓ ✓ —
  and the **walking skeleton's MEP step** ✓ is a package of its own ✓ ✓.
