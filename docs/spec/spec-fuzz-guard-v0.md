# The spec fuzz guard v0 (W3.11): the engine answers, it never crashes

**Status:** v0.1.0 — the last of the plan's §9 CI guards, and the one that had no package since
P0. The Building Spec is the app's source of truth, so a malformed one must be **rejected**,
never **crash** the engine, and never let a bad document through.
**Code:** `core/src/archres_core/spec/fuzz.py` (the mutators and the runner) ·
`tools/ci/spec_fuzz_guard.py` (the CI guard) · `core/tests/test_spec_fuzz.py` (5 tests) ·
**Decision record:** ADR-0041
**Depends on:** W1.3 (the spec engine) · **Plan:** §9 (the CI guards) · §4 (the spec is the
single source of truth)

## What it is

The fuzzer mutates the **committed examples** ✓ — so the cases are the ones that matter ✓ —
and checks how the engine answers ✓. It is **deterministic** ✓ (a fixed seed ✓, the same
mutants on every run ✓ — plan §9's "identical outputs" ✓).

The mutators: **drop** a field ✓, give a value the **wrong type** ✓, an **out-of-range**
number ✓, a **huge** number ✓, an **emptied list** ✓, an **unexpected field** ✓ (the schema
forbids them ✓) and a **wrong enum** ✓.

## The three laws it checks

1. **No unexpected exception.** The engine may reject a document ✓ — that is its job ✓ — and
   it may raise its own `SpecValidationError` ✓ / `SpecPatchError` ✓. Anything else
   (`TypeError` ✓, `AttributeError` ✓, `KeyError` ✓, `RecursionError` ✓) is a **defect** ✓: a
   crash on bad input is a crash a user can cause ✓.
2. **A patch that succeeds produces a valid document.** The engine validates before it returns
   ✓ (W1.3 ✓); the fuzzer checks it again ✓, because a document that passes the engine and
   fails the schema is a document that reaches the app ✓.
3. **A bad pointer is an error, not a traceback.** The pointer operations (the rule engine's
   restore ✓, the price service's override ✓) walk a path the caller supplies ✓ — a broken path
   must raise the engine's own error ✓.

## The measured output (2026-10-21)

`tools/ci/spec_fuzz_guard.py` runs over the three committed examples ✓: **1,200 mutants** ✓
(400 rounds each ✓), **no crash** ✓ and **no invalid document** ✓. It is a CI step in the
`sanity` job ✓ — it runs on every push ✓, and it is fast ✓ (no engine ✓, no network ✓).

## What it is not

- **It is not a statement that the engine is right.** The fuzzer finds crashes ✓; what the
  engine should *say* about a bad document is a separate question ✓ — the engine's own tests
  cover that ✓.
- **It does not fuzz the app.** It fuzzes the **spec engine** ✓ — the layer every document
  passes through ✓. The app's own inputs (the chat parser ✓, the rule engine's pack ✓) have
  their own tests ✓.
- **It does not prove the absence of bugs** ✓ — it proves the absence of *crashes* on the
  mutations it makes ✓, which is what a guard can honestly claim ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_spec_fuzz.py     # 5 tests
uv run --directory core python ../tools/ci/spec_fuzz_guard.py  # the guard (CI runs it on every push)
```
