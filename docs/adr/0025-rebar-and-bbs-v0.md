# ADR-0025 — The steel is measured twice: the schedule and the engine must agree

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.4
**Code:** `core/src/archres_core/design/rebar.py` · `tools/cad/rebar_probe.py`
**Schema:** `spec/schemas/bbs.schema.json` (interfaces §5) · **Spec:** `docs/spec/rebar-bbs-v0.md`
**Depends on:** W2.2, W2.3 (the members), W2.1 (the pool), spike S5 (Reinforcement scripting)

## Context

The plan's P2 needs rebar (W2.4) and a Bar Bending Schedule that the BOQ can cost (W2.6, W3.4).
Two things make this package different from the foundation and the floor:

- **A BBS is a commercial document.** Its numbers are what an engineer checks, what a contractor
  orders and what the BOQ prices. A schedule that is a plausible-looking table is worse than no
  schedule: the error travels into money.
- **The rule pack has no detailing rules.** It has FAR, setbacks, heights and parking - no bar
  diameters, no spacings, no cover. A generator that "detailed" the steel would be inventing
  structure, which plan §9 forbids.

Spike S5 had already proven that FreeCAD-Reinforcement is scriptable headless, and recorded
the traps that matter: the selected face defines the whole build, the headless stubs are
mandatory, bar lengths honour the offsets, and steel must be measured from the swept volume
(`Shape.Volume / (π/4 d²)`) because edge sums are meaningless. It also measured the one effect
that would otherwise look like a bug: the addon's centreline BBS and the welded geometry differ
by **1.8 %** in weight.

## Decisions

1. **The schedule and the engine are two independent computations, and they must agree.** The
   BBS computes the weight arithmetically (`count × length × π/4 d² × density`); the CAD engine
   measures the same steel from the geometry. The probe compares them and fails when they
   disagree. A schedule nobody measured against the model is a claim, not a schedule.
2. **A mark is one bar, repeated, and its length is the centreline length.** That is the
   industry convention (a link is its perimeter), and it is what a drawing and a BOQ expect.
   The geometry builds a link as four welded segments, so a welded bar measures slightly *less*
   than its centreline length; the comparison tolerance is **declared** (1 % per object, 2 % on
   the total) and the difference is reported, not hidden.
3. **The detailing is authored, not calculated.** Diameters, spacings, cover and the starter
   length are authored assumptions with reasons, handed back for the spec - the same law as the
   foundation (ADR-0022) and the floor (ADR-0023). The rule pack's silence is visible, not
   papered over.
4. **v0 builds round bars itself, not through the addon.** FreeCAD-Reinforcement's detailing is
   richer (bent shapes, offsets) but its face-selection rules are a silent-wrongness trap, and
   the `π/4 d²` law is exact only for round bars. v0's straight bars, links and starters are
   simple enough to be obviously right and to measure exactly; the addon path is a later
   refinement, and the BBS model already carries the `shape` field for it.
5. **The BBS is data, and it is a frozen interface.** `spec/schemas/bbs.schema.json` (v0.1.0)
   is generated into the Python and TypeScript interfaces like every other contract, and the
   committed schedule validates against it. The shape list and the title block are W3.4's job,
   not the schema's.
6. **The schedule travels with its assumptions.** `assumptions[]` carries every authored
   detailing value with its reason: a schedule is never a number without a provenance.
7. **The probe stays the measure.** The same shared engine as the foundation and the floor
   (build → pool → measure → compare with computed expectations → two runs byte-identical →
   write the reviewable fixtures) is reused, so the measurement law cannot drift between the
   generators.

## Consequences

- The BOQ can price steel from a schedule that has been checked against the geometry that will
  actually be built, and the difference between the two numbers is a published tolerance with a
  known cause.
- The v0 detailing is explicitly provisional: five assumptions (cover, main diameter, link
  diameter, link spacing, mesh diameter) are visible in the schedule and are the first things an
  engineer replaces with real numbers.
- The BBS model is ready for bent bars (`shape: bent · hook`) when the addon's detailing lands;
  nothing in the schema has to change for that.
- The rebar geometry is deliberately simpler than the addon's, and the package says so rather
  than implying a detailing depth it does not have.
