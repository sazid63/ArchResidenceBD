# Foundation generator v0 (W2.2)

**Status:** v0.1.0 — the Building Spec produces a foundation the engine builds and measures.
**Code:** `core/src/archres_core/design/foundation.py` (designer + macro emitter) ·
`core/src/archres_core/design/__init__.py` · `tools/cad/foundation_probe.py` (live probe) ·
`core/tests/test_design_foundation.py` (9 tests) · **Decision record:** ADR-0022
**Inputs:** a Building Spec (`spec/examples/two-storey-residential.json`) · **Outputs:** a
`FoundationDesign`, a generated FreeCAD macro, and the measured geometry
**Plan:** §6 (per-phase models; site/foundation first) · §2.5 (every value carries provenance) ·
§9 (identical outputs; no silent gaps) · **Depends on:** W2.1 (the worker pool), W0.3 (the spec)

## What it is

The W1.8 candidate macro (`tools/cad/candidates/geometry_build.py`) is a **scratch** generator:
its parameters are hard-coded and nothing reads the Building Spec. W2.2 replaces that with a
chain that the product can actually use:

```text
Building Spec ──▶ FoundationDesign ──▶ generated macro ──▶ CAD worker pool ──▶ measured geometry
                  (provenance per         (committed,        (W2.1)              (volume, bbox,
                   number, assumptions)     reviewable)                           solids, validity)
```

Two laws shape it:

- **Numbers with provenance.** Every dimension says where it came from: `spec` (the user's
  answer), `derived` (computed from other spec values) or `assumed` (an authored default). The
  rule pack (v0) has **no footing-sizing rule**, so the footing size, the footing depth, the
  grade-beam size and the grid spacing are *assumptions* — and the design hands them back with
  their reasons, so the app can write them into the spec (the interview engine's existing
  authored-assumption path). Nothing is invented silently.
- **Measure, don't assert.** The macro is a *candidate*; the engine measures what it built. The
  expectations the probe compares against are **computed from the design**, so the check is
  "the geometry matches the design", never "the geometry matches a number someone copied".

## The design (v0, stated plainly)

- **Footings:** isolated footings in one row along the frontage, on a 3 m grid. The count is
  derived from the frontage and the grid spacing (v0 does not use the unit count — the unit
  layout is W2.3's decision).
- **Grade beams:** one between every pair of footings.
- **Excavation:** a **declared prism** (depth, extents, volume) — *not* a solid. A trench solid
  would double-count against the footings in every takeoff, and the site/terrain model is a
  later package. The depth comes from the spec's `site-excavation` phase when it has one.
- **Columns** are W2.3's business: a foundation is what carries them, not what defines them.

## Live probe (2026-10-20, FreeCAD 1.1.4, Windows)

`uv run --directory core python ../tools/cad/foundation_probe.py --engine "<freecadcmd>"` on
`spec/examples/two-storey-residential.json` (133.78 m² plot, 10 m frontage):

| Measurement | Value |
|---|---|
| Design | 4 footings (1,200 × 1,200 × 300 mm) + 3 grade beams (3,000 × 300 × 400 mm) |
| Measured, every footing | **0.432 m³**, bbox 1200 × 1200 × 300 mm, 1 solid, valid |
| Measured, every grade beam | **0.36 m³**, bbox 3000 × 300 × 400 mm, 1 solid, valid |
| The measurement vs the design | **equal** — the probe compares computed expectations, not copied numbers |
| Two runs | **identical artifact** (sha256 `289327d3f8611d79…`) |
| Whole probe | 1.641 s, exit 0 |

The generated macro and the design are committed under `data/cad/generated/` so a reviewer can
read exactly what the engine will build; `--check` proves they are fresh (no engine needed, so
CI runs it on every push) and the live probe runs in the weekly `cad-execution` job.

## The assumptions (v0, all authored, all returned to the app)

| Assumption | Value | Why |
|---|---|---|
| `/phases/foundation/data/footingSizeMm` | 1200 mm | the rule pack (v0) has no footing-sizing rule |
| `/phases/foundation/data/footingDepthMm` | 300 mm | the rule pack (v0) has no footing-depth rule |
| `/phases/foundation/data/gradeBeamMm` | 300 mm | the rule pack (v0) has no grade-beam rule (300 × 400 assumed) |
| `/phases/foundation/data/footingSpacingMm` | 3000 mm | v0 lays the footings on a 3 m grid |
| `/phases/site-excavation/data/excavationDepthM` | (only when the spec has none) | footing depth + 300 mm |

## What is deliberately not here

- **Structural sizing.** The v0 design is a *layout* with authored sizes, not a structural
  calculation: load paths, reinforcement and soil-structure interaction are the engineer's job
  (and the plan's W2.4), not the app's guess.
- **The column grid and the floors** (W2.3), **rebar** (W2.4), **sheets** (W2.5), **BOQ**
  (W2.6) — the design is the input to all of them, not a replacement for them.
- **The site/terrain model.** The excavation is declared, not built.
- **The app wiring.** The generator is a library; the shell calls it when a project needs
  geometry (W2.8+).

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_foundation.py      # the designer
uv run --directory core python ../tools/cad/foundation_probe.py --check  # fixtures fresh (no engine)
uv run --directory core python ../tools/cad/foundation_probe.py --engine "<freecadcmd>"  # live
```
