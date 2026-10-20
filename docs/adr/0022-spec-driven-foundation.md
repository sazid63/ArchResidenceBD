# ADR-0022 — The foundation is designed from the spec, and every number says where it came from

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W2.2
**Code:** `core/src/archres_core/design/foundation.py` · `tools/cad/foundation_probe.py`
**Spec:** `docs/spec/foundation-generator-v0.md` · **Depends on:** W2.1 (the worker pool), W0.3 (the spec)

## Context

W1.8 left a **scratch** CAD candidate: a macro with hard-coded parameters (2 pads, 3 columns
each, fixed dimensions) that the harness can execute and measure. It proved the seam - a
candidate that builds geometry, a verifier that measures it, a repair loop that learns from the
failure - but it is not a generator: nothing in it reads the Building Spec, so the app cannot
drive it, and its dimensions are nobody's decision in particular.

P2's walking skeleton (W2.10) needs a *product* generator: the same spec must produce the same
foundation, the foundation must be measured by the engine, and a human must be able to read what
the engine will build before it is built.

The trap is obvious and expensive: the rule pack (v0) has FAR, setbacks, heights and parking -
and **no footing-sizing rule**. A generator that "sizes the footings" without a rule is
inventing structure, which the plan's §9 forbids ("content human-reviewed? if not → it's a
candidate, not a fact").

## Decisions

1. **The design is a separate artefact from the macro.** `FoundationDesign` is the *decision*
   (numbers with provenance, assumptions, expected objects); the macro is its *rendering*. The
   design can be reviewed, diffed and compared without reading FreeCAD code, and the macro stays
   a mechanical translation of it.
2. **Every number carries its provenance.** `spec` (the user's answer), `derived` (computed
   from other spec values, with the formula in `reason`) or `assumed` (an authored default, with
   the reason). There is no fourth kind: a number that is neither from the spec nor derived nor
   explicitly assumed is a bug, and the design refuses to be built without a plot.
3. **The rule pack's silence is an assumption, not an invitation.** Footing size, footing depth,
   grade-beam size and the grid spacing have no rule in v0, so they are **authored assumptions**
   that the design **hands back** (`FoundationDesign.assumptions`) with their reasons, ready for
   the app to write them into the spec through the interview engine's existing authored-assumption
   path. The app never invents a number quietly; it records one.
4. **The excavation is declared, not built, in v0.** The design carries the prism (depth,
   extents, volume) and the macro writes it into its summary artifact. A trench *solid* would
   sit in the document next to the footings and double-count in every takeoff; the site/terrain
   model is a later package, and until then a declared volume is the honest shape of the fact.
5. **The expectations are computed from the design.** The probe compares the measured objects
   with `FoundationDesign.expected_objects()` - the volumes and names the design implies. A
   copied number in a test is a snapshot that can drift; a computed one cannot.
6. **The generated macro is committed.** `data/cad/generated/` holds the exact source the pool
   runs, so a human can read what will be built. `--check` proves the committed fixtures are
   fresh on every push (no engine needed), and the weekly job re-runs them against the real
   engine.
7. **Determinism is measured, not asserted.** The probe runs the same spec twice and compares
   the artifact hashes; the pool probe compares two independent engine processes. The plan's §9
   "identical outputs" is a number, not a promise.
8. **v0 is a layout, not a structural calculation.** The footing line follows the frontage on a
   grid; the unit layout, the column grid, the load paths and the reinforcement are W2.3/W2.4 and
   the engineer's judgement. The app must not guess a structure.

## Consequences

- The app can drive geometry from the spec, and every dimension in the result can be traced to
  a spec pointer, a formula or an authored assumption.
- The v0 foundation is honest about being provisional: five assumptions are visible, recorded
  and reviewable, and they are the first things an engineer will replace with real numbers.
- The W1.8 scratch macro stays as a *harness* fixture (the W1.8 cases measure it); the product
  generator is a separate artefact with its own probe and its own reviewable output.
- The walking skeleton (W2.10) has a real input chain: spec → design → macro → measured
  geometry, with a determinism check at every step.
- Sizing remains a human decision in v0, and the app says so instead of pretending otherwise.
