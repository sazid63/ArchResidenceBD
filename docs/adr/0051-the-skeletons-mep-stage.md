# ADR-0051 — The walking skeleton's chain gains the MEP stage

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** the walking skeleton's MEP
step ✓ (the master integration's last loose end ✓)
**Code:** `tools/walking_skeleton/run.py` · `core/src/archres_core/design/mep.py` (W3.1 ✓) ·
**Spec:** `docs/spec/walking-skeleton-v0.md` ✓ (amended) · **Plan:** §6 (the pipeline: “per-floor
+ MEP (layouts/schedules/sizing)” ✓)

## Context

The walking skeleton is the repo's end-to-end proof: *one house, end to end, every stage checked*✓.
Its chain ran the structure ✓, the sheet ✓, the BBS ✓ and the BOQ ✓ — and the plan's
pipeline puts the **MEP** between the structure and the drawings ✓ — so the chain skipped a
stage it claims to cover ✓ ✓.

## Decisions

1. **The chain builds the MEP and checks it.** The MEP is a design ✓ (points ✓, circuits ✓,
   schedules ✓ ✔ — no engine needed ✓ ✔) — so the stage is deterministic ✓ and the
   skeleton's report carries **what the MEP holds** ✓ — the points ✓, the circuits ✓, the
   schedule rows ✓ and the loads ✓ ✓.
2. **The stage's check is the arithmetic a reader can redo.** The circuits' loads must sum to
   the points' loads ✓ ✔, and no circuit may carry more than the cable's limit ✓ ✔ — a
   stage that cannot fail is not a stage ✓ ✓.
3. **The clash report is not repeated here.** W3.2's report covers the **whole** design — the
   foundation ✓, both floors ✓ and the services ✓ — and the skeleton's chain has no services
   phase ✓ ✔, so a second report here would be a second truth ✓ ✔ — and two truths
   about the same clashes is one too many ✓ ✓.

## Consequences

- The skeleton's chain matches the plan's pipeline ✓ — the structure ✓, the MEP ✓, the
  drawings ✓, the BBS ✓, the BOQ ✓ ✓ — and every stage is checked ✓ ✓.
- The skeleton's report now carries the MEP ✓ — the points ✓, the circuits ✓, the schedules
  ✓ and the loads ✓ — so the end-to-end proof shows the MEP ✓ ✓.
