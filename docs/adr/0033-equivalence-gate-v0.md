# ADR-0033 — The incremental build is gated on equality, and the gate has two halves

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.11
**Code:** `core/src/archres_core/design/incremental.py` · `core/tests/test_design_incremental.py` ·
`tools/cad/equivalence_probe.py`
**Spec:** `docs/spec/equivalence-gate-v0.md`
**Depends on:** W2.2, W2.3 (the designs), W2.8 (the mesh), W2.9 (the federation) · plan §8, §9

## Context

The plan's efficiency pass (§8) promises that the app **regenerates only the changed phases**, and
that "all IDs/marks derive from stable spec IDs only (never build order)". The quality law (§9)
then names the guard: **incremental ≡ full-rebuild equivalence**, in CI.

The catch is that "only the changed phases" needs a definition of *changed*, and the promise needs
a proof that is stronger than "it looked right". A rebuild that skips work can skip work it
should not have, and the failure is silent: the model is slightly different and nobody notices
until the drawing and the BOQ disagree.

Two questions decided this package: what makes a phase "changed", and where the gate can run
(the CI on every push has no CAD engine).

## Decisions

1. **A phase changes when its *input hash* changes.** The foundation depends on the spec's site
   and project; the floor depends on the spec's building **and on the foundation's design** (the
   floor stands on the foundation — a different foundation means a different floor). The hash is
   the sha256 of the canonical JSON of those inputs, so the decision is deterministic and
   reviewable, not a heuristic.
2. **The input hash and the design hash are different things, and the gate needs both.** A
   changed input does not always change the design: v0's footing sizes are authored assumptions
   (the pack has no footing rule), so a different soil value changes the foundation's *inputs*
   and not its geometry — and therefore not the floor's either. The incremental builder rebuilds
   the foundation (its inputs changed) and reuses the floor; the *result* is the same building.
   A gate that only compared design hashes would miss the case; a gate that only compared input
   hashes would rebuild for nothing.
3. **The gate compares the two build paths, and equality is exact.** The incremental build's
   phase states must equal the full build's — the same phases, the same input hashes, the same
   design hashes. Not "the same volume within a tolerance": the same.
4. **The gate has two halves, because CI has no engine.** The **design half** (the state hashes)
   runs on every push, with no engine; the **engine half** (the meshes, byte for byte) runs in
   the weekly `cad-execution` job, where the engine exists. The design half catches the
   dependency mistakes; the engine half catches the ones the engine introduces.
5. **A gate that only says "different" is not a gate.** The engine half names the first object
   that differs (the columns' measured volume, for instance).
6. **The change the gate proves must be a real change.** The test moves the typical floor's height
   (3.0 m → 3.6 m) and asserts the design hash really changed — otherwise the gate would pass
   on two identical buildings and prove nothing. (An earlier draft of the probe changed a spec
   key that nothing reads; the gate caught it, which is the gate's first real job.)
7. **The "do not re-run" claim is separate from the "same result" claim.** The gate proves the
   results are identical; the efficiency claim is the incremental builder's decision (the reused
   phase is not sent to the engine) and the job count in the report. The doc says which is which.

## Consequences

- The efficiency promise is now a **gate**, not a hope: an incremental rebuild that changes the
  model fails CI.
- The dependency chain is written down (the floor depends on the foundation's design) and
  tested, so a future phase adds its own input hash rather than guessing.
- The gate is honest about its reach: it covers the v0 chain (the foundation and the first
  floor) and grows with the phases W2.12 adds.
- The rebar and the documents (the sheet, the BOQ) are derived from the designs the gate
  compares, so an unchanged design cannot move them; their own incremental stories are theirs.
