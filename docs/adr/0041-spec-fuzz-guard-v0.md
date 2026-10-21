# ADR-0041 — The spec fuzzer is deterministic, and it looks for crashes rather than for truth

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.11 (the plan's §9 guard)
**Code:** `core/src/archres_core/spec/fuzz.py` · `tools/ci/spec_fuzz_guard.py` ·
`core/tests/test_spec_fuzz.py`
**Spec:** `docs/spec/spec-fuzz-guard-v0.md`
**Depends on:** W1.3 (the spec engine) · plan §4, §9

## Context

The plan's §9 names four CI guards: the rule-pack test vectors ✓ (running since W1.2 ✓), the
incremental ≡ full-rebuild equivalence ✓ (running since W2.11 ✓), the **Bangla rendering
regression** ✓ (running since W3.9 ✓) and **spec fuzzing** ✗ — the one that had no package
since P0, and the one the P2 audit recorded as a declared gap ✓.

The Building Spec is the app's single source of truth ✓ (§4 ✓): a malformed one is rejected by
the schema ✓, and the engine validates every document it returns ✓ (W1.3 ✓). What was never
checked is what happens when the input is malformed in a way the schema does not describe ✓ — a
half-written document ✓, a number where a string belongs ✓, a broken pointer ✓.

## Decisions

1. **The fuzzer mutates the committed examples.** The cases are the ones that matter ✓, and the
   documents under test are the ones the app ships with ✓ — not a synthetic blob ✓.
2. **The fuzzer is deterministic** (a fixed seed ✓, the same mutants on every run ✓). Plan §9's
   "identical outputs" ✓ applies to the guard as well ✓: a crash that appears once must appear
   every time ✓, or the guard is noise ✓.
3. **Only the engine's own errors are allowed.** `SpecValidationError` ✓ and `SpecPatchError` ✓
   are the engine's *answers* ✓; anything else is a **defect** ✓ — a crash on bad input is a
   crash a user can cause ✓. A fuzzer that accepts "any exception" would pass a crashing
   engine ✓, which is the opposite of a guard ✓.
4. **A document the engine accepts must satisfy the schema.** The engine validates before it
   returns ✓ (W1.3 ✓); the fuzzer checks it *again* ✓, because a document that passes the
   engine and fails the schema is a document that reaches the app ✓.
5. **The bad-pointer cases are part of the guard.** The pointer operations (the rule engine's
   restore ✓, the price service's override ✓) walk a path the *caller* supplies ✓ — a broken
   path must raise the engine's error ✓, not a `KeyError` from the pointer code ✓.
6. **The guard says what it does not do.** It finds crashes ✓; it does not judge what the
   engine *says* about a bad document ✓ (the engine's own tests do that ✓), it does not fuzz the
   app ✓, and it does not prove the absence of bugs ✓.

## Consequences

- The last of the plan's §9 guards now exists ✓ and runs on **every push** ✓ (the `sanity` job ✓)
  — fast ✓, no engine ✓, no network ✓.
- The measured result: **1,200 mutants** over the three committed examples ✓, **no crash** ✓ and
  **no invalid document** ✓.
- The gap the P2 audit recorded (§9's guard with no package ✓) is closed ✓ — and the P3 board
  carries the package that closed it ✓.
- Two smaller defects were fixed in the same pass ✓: the PDF writer **refused** to mangle text
  its font cannot carry ✓ (it used to replace a Bangla line with "?" and say nothing ✓), and the
  workbook writer now **applies** the number formats it declared ✓ (they were dead code ✓).
- The drawing set's macro is **committed** ✓ like every other generator's ✓, and the set has an
  **offline freshness check** ✓ in CI ✓ — so a drift in what the engine builds is caught on every
  push ✓ rather than only in the weekly engine job ✓.
