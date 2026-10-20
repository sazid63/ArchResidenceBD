# Typical floor generator v0 (W2.3)

**Status:** v0.1.0 — the storey rides the foundation's grid, and the engine measures it.
**Code:** `core/src/archres_core/design/floor.py` (designer + macro emitter) ·
`tools/cad/floor_probe.py` (live probe) · `tools/cad/design_probe.py` (the shared probe engine)
· `core/tests/test_design_floor.py` (9 tests) · **Decision record:** ADR-0023
**Inputs:** a Building Spec + the W2.2 foundation design · **Outputs:** a `FloorDesign`, a
generated FreeCAD macro, and the measured geometry
**Plan:** §6 (per-phase models; the floors follow the foundation) · §2.5 (provenance) · §9
(identical outputs; no silent gaps) · **Depends on:** W2.2 (the foundation design), W2.1 (the pool)

## What it is

The same chain as W2.2, one storey up:

```text
Building Spec ──▶ FoundationDesign ──▶ FloorDesign ──▶ generated macro ──▶ pool ──▶ measured
                    (W2.2: the grid)     (this package)
```

The floor does **not** invent its own grid: it takes the foundation's footings and stands one
column on each. The foundation and the storey therefore agree by construction, not by two
independent guesses.

- **Columns** — one per footing (a real derivation), the section an authored assumption
  (300 × 300 mm; the rule pack has no column rule in v0) and the **height from the spec**
  (`building.storeys.typicalFloorHeightM`, `groundFloorHeightM` for the ground storey).
- **Beams** — one between every pair of columns; the lengths come from the grid, the section is
  an authored assumption (300 × 450 mm).
- **The slab** — the plate over the grid, with the **thickness from the spec's floor phase**
  (`slabThicknessMm`) when the phase carries one, and a 150 mm overhang (assumed).
- **Walls and openings are not built.** The v0 spec carries no wall or opening data, so the
  design *declares them absent* with a reason instead of inventing structure; a wall that
  nobody asked for is a fabricated fact.

## Live probe (2026-10-20, FreeCAD 1.1.4, Windows)

`uv run --directory core python ../tools/cad/floor_probe.py --engine "<freecadcmd>"` on
`spec/examples/two-storey-residential.json`, storey 1 (typical floor height 3.0 m):

| Measurement | Value |
|---|---|
| Design | 4 columns + 3 beams + 1 slab, on the foundation's 4-footing grid |
| Measured, every column | **0.27 m³** (300 × 300 × 3000 mm), 1 solid, valid |
| Measured, every beam | **0.405 m³** (3000 × 300 × 450 mm), 1 solid, valid |
| Measured, the slab | **0.34875 m³** (9300 × 300 × 125 mm — the 125 mm thickness is the spec's) |
| The measurement vs the design | **equal** — computed expectations, not copied numbers |
| Two runs | **identical artifact** (sha256 `244a6e2b804c1cce…`) |
| Whole probe | 1.844 s, exit 0 |

## The assumptions (v0, all authored, all returned to the app)

| Assumption | Value | Why |
|---|---|---|
| `/phases/floor/data/columnSizeMm` | 300 mm | the rule pack (v0) has no column-sizing rule |
| `/phases/floor/data/beamMm` | 300 mm | the rule pack (v0) has no beam-sizing rule (300 × 450 assumed) |
| `/phases/floor/data/slabThicknessMm` | 125 mm | only when the floor phase carries no thickness |

## What is deliberately not here

- **Walls and openings** — no spec data, so none are built; they are declared absent.
- **The slab's Y extent** — the v0 grid is a single row, so the slab is as deep as the grid plus
  the overhang. A two-dimensional grid is the W2.3 follow-up (or W2.4's business).
- **Rebar** (W2.4), **sheets** (W2.5), **BOQ** (W2.6) — the design is their input, not a
  replacement for them.
- **The app wiring** — the generator is a library; the shell calls it when a project needs
  geometry (W2.8+).

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_floor.py          # the designer
uv run --directory core python ../tools/cad/floor_probe.py --check      # fixtures fresh (no engine)
uv run --directory core python ../tools/cad/floor_probe.py --engine "<freecadcmd>"  # live
```
