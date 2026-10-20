# Rebar + BBS v0 (W2.4)

**Status:** v0.1.0 — the storey's steel is designed, built, measured and scheduled.
**Code:** `core/src/archres_core/design/rebar.py` (designer + BBS builder + macro emitter) ·
`tools/cad/rebar_probe.py` (live probe) · `tools/cad/design_probe.py` (the shared probe engine)
· `core/tests/test_design_rebar.py` (7 tests) · **Schema:** `spec/schemas/bbs.schema.json`
(W2.4, generated into `core/src/archres_core/interfaces/bbs.py` + `app/src/interfaces/bbs.gen.ts`)
· **Decision record:** ADR-0025 · **Depends on:** W2.2 (foundation), W2.3 (floor), W2.1 (pool),
spike S5 (Reinforcement scripting)

## What it is

The chain continues one layer up: the **floor design** says how big the members are; this
package says how much steel they need and writes the Bar Bending Schedule the BOQ will cost.

- **Columns** — 4 main bars (Ø16, authored) plus links (Ø8 at 150 mm, authored); the bar lengths
  come from the member and the cover.
- **Beams** — 4 main bars (2 top, 2 bottom) plus links.
- **The slab** — main bars one way (Ø10 at 150) and distribution bars the other (Ø8 at 200).
- **Footings** — a bottom mesh (Ø12 at 150, both directions) and 4 starter bars.
- **Every** diameter, spacing and cover is an **authored assumption** (the rule pack v0 has no
  detailing rules) and is handed back for the spec; every **length** is derived from the design.

The BBS is **data**, not a drawing: a mark, a member, a role, a shape, a diameter, a centreline
length, a count and a weight. The shape list and the title block are W3.4's job.

## The measurement cross-check (the point of the package)

Two independent computations of the same steel:

| | How |
|---|---|
| **The schedule** | `count × length × π/4 d² × 7850 kg/m³` — arithmetic on the design |
| **The engine** | the CAD engine builds the bars and measures their volume; a round bar's length is `Volume / (π/4 d²)` (spike S5) |

They must agree, and the probe compares them. A welded bar (a link is four segments) measures
slightly **less** than its centreline length because the corners overlap — the same effect spike
S5 measured between the addon's BBS and the geometry (1.8 %) — so the comparison tolerance is
declared (1 % per object, 2 % on the total), not assumed.

## Live probe (2026-10-21, FreeCAD 1.1.4, Windows)

`uv run --directory core python ../tools/cad/rebar_probe.py --engine "<freecadcmd>"` on
`spec/examples/two-storey-residential.json`, first floor:

| Measurement | Value |
|---|---|
| Design | **28 marks, 297 bars** (4 columns, 3 beams, 1 slab, 4 footings) |
| The schedule says | **279.0 kg** (by diameter: 8 mm 59.8 kg · 10 mm 11.4 kg · 12 mm 63.6 kg · 16 mm 144.2 kg) |
| The engine measures | **278.8 kg** — **−0.08 %** against the schedule |
| Two runs | **identical artifact** (the probe demands byte-identical re-runs) |
| Whole probe | 3.671 s, exit 0 |

The BBS document is committed at `data/cad/generated/rebar-two-storey-residential.bbs.json` and
validates against `spec/schemas/bbs.schema.json`; `--check` proves it fresh on every push (no
engine needed), and the live probe runs in the weekly `cad-execution` job.

## What is deliberately not here

- **FreeCAD-Reinforcement's detailing.** S5 proved it is scriptable (and found its traps: the
  selected face defines the whole build, headless stubs are mandatory, bar lengths honour the
  offsets). v0 builds round bars itself, where the `π/4 d²` law is exact and the geometry is
  simple enough to be obviously right. The addon's bent shapes are a later refinement; the BBS
  model has the `shape` field ready for them.
- **A structural design.** The v0 detailing is a *layout* with authored sizes, not a calculation:
  the load paths, the bar sizes and the spacings are the engineer's call, and the app says so
  instead of pretending otherwise.
- **The shape list and the title block** (W3.4), and the BOQ that prices the steel (W2.6).

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_rebar.py        # the designer + the schema
uv run --directory core python ../tools/cad/rebar_probe.py --check     # fixtures fresh (no engine)
uv run --directory core python ../tools/cad/rebar_probe.py --engine "<freecadcmd>"   # live
```
