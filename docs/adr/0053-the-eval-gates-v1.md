# ADR-0053 — The v1 gates are a band, a rate, and a human check that waits visibly

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W4.3 (the eval gates v1)
**Code:** `core/src/archres_core/eval/run.py` · `tools/eval/run_eval.py` ·
`tools/cad/verify.py` · `core/tests/test_eval_gates_v1.py` ·
**Artefacts:** `data/eval/chat-v0/gates.json` · `data/eval/chat-v0/engineer-check.json` ·
**Spec:** `docs/spec/eval-gates-v1.md`
**Depends on:** W1.9, W2.10, W3.5 · plan §7, §6, §9

## Context

The plan's §7 names the v1 eval gates: *"golden projects - BOQ within ±8%, CAD execution
success >90%, drawings engineer-checked"*. The harness ran and gated — seven suites, twelve
gates, all green — but none of the three v1 gates existed, and the gate's form could not
express the first of them.

## Decisions

1. **A gate may be a band.** "BOQ within ±8%" is a deviation that is neither too big nor too
   small — and the old form (*"value ≥ floor"*) cannot say that —·. A gate now carries a
   **floor**, a **ceiling**, or both — and one with neither is an error ··.
2. **The golden project is measured through the app's own path.** The suite runs the real
   spec → foundation → floor → rebar → takeoff → priced BOQ and compares the total with
   the **committed reference** · so the number is the product's and not a restatement of the
   reference ··.
3. **The CAD gate measures a rate.** The plan's ">90%" is a rate — and the CI's all-or-nothing
   verdict, though stricter, is not the number the plan names ··. The verify tool gained
   `--gate-min-success-rate` · it reads the report the run wrote and fails below the floor
   ··.
4. **A human gate is pending, never silently passed.** The engineer's check is a human act
   — the repo cannot do it — so the gate is marked **pending** · it is **named** (with the
   owner's item number ✓), reported as `[PENDING (owner item #9)]` ✓, it does **not** stop the
   build ✓, and it is **not** a pass ✓. Plan §9: *explicit, user-visible state — never
   silent* ··. The record says who checked, when, and what they saw ··.
5. **The gates must be able to fail.** A test moves the design (a 12 m frontage → 14.95% away
   from the reference) and holds that the 8% gate fails ··; another holds that the CAD
   rate gate exits 1 at 0.9 with two of three cases passed ··.

## Consequences

- The plan's **three v1 gates are live** ·· and two of them are green · (the BOQ's
  deviation is **0.000%** · the CAD rate is measured ·) and the third waits on the owner
  ··.
- The gate file's **form** is richer — a floor, a ceiling, a band, a pending state — and the
  report says which is which ··.
- A **pending** gate is visible in the CLI's output and in the report — so nobody reads a
  green run as a signed-off one ··.
- The golden project is **one** project — the plan says "golden projects" · and the suite takes
  the project as an input · so more are a data change ··.
