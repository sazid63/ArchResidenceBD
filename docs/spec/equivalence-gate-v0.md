# The equivalence gate v0 (W2.11): an incremental rebuild must equal a full rebuild

**Status:** v0.1.0 — the gate is in CI: the design half on every push, the engine half in the
weekly engine job.
**Code:** `core/src/archres_core/design/incremental.py` (the phase states, the input hashes, the
incremental build) · `core/tests/test_design_incremental.py` (7 tests — the design half) ·
`tools/cad/equivalence_probe.py` (the engine half) · **Artefacts:**
`data/cad/generated/equivalence-report.json` · **Decision record:** ADR-0033
**Depends on:** W2.2, W2.3 (the designs), W2.8 (the mesh export), W2.9 (the federation) ·
**Plan:** §8 (the efficiency pass: regenerate only what changed; the ids come from the spec, never
from the build order) · §9 (the CI guard: incremental ≡ full-rebuild equivalence)

## What it is

The plan promises two things that pull against each other: the app **regenerates only the changed
phases** (§8), and the result must be **the same building** (§9). The gate is where those two
meet: an optimisation that changes the output is rejected, not celebrated.

The gate has two halves, and they differ only in what they compare:

| Half | What it compares | Where it runs |
|---|---|---|
| **design** | the incremental build's phase states (the design hashes) against the full build's | CI, **every push** (no engine) |
| **engine** | the meshes the two builds produce, byte for byte | the weekly `cad-execution` job (the engine) |

## The decision: which phases changed

`archres_core.design.incremental` holds one state per phase:

- **an input hash** — the sha256 of the phase's *inputs*: the foundation depends on the spec's
  site and project; the floor depends on the spec's building **and on the foundation's design**
  (the floor stands on the foundation, so a different foundation means a different floor);
- **a design hash** — the sha256 of the design the phase produced.

A phase is **rebuilt** when its input hash changed; otherwise it is **reused** — its previous
design is carried over and the engine is not asked to build it again.

The design-level gate (`core/tests/test_design_incremental.py`, 7 tests):

- a full build is reproducible ✓;
- an incremental build of a new project equals the full build ✓;
- an unchanged spec rebuilds **nothing** ✓ (the efficiency claim);
- a changed phase rebuilds **that phase only** — and the change must really move the design,
  otherwise the gate would prove nothing ✓;
- the gate can **fail**: a state whose design hash differs is reported ✓.

## The engine-level gate (`tools/cad/equivalence_probe.py`)

The probe runs the same building twice through the worker pool:

1. the **full build** of the changed spec (the typical floor's height moves: 3.0 m → 3.6 m), and
2. the **incremental build**: the floor is rebuilt, the foundation is **reused** (its file from
   the previous build is carried over unchanged — the engine is not asked to build it again).

Then the two meshes are compared **byte for byte**.

**Measured (2026-10-21, FreeCAD 1.1.4):** the incremental build rebuilt `floor-1` and reused
`foundation`, and the two meshes are **identical** (15 objects) ✓ — 1.6 s. The gate's report
names the first object that differs when it fails (the columns' volume, for instance) — a gate
that only says "different" is a gate nobody can act on.

## What the gate does **not** prove (declared, not implied)

- **It does not prove the app never re-runs an unchanged phase.** It proves the *result* is
  identical; the "do not re-run" claim is the incremental builder's decision (the reused phase
  is not sent to the engine) and the job count in the report.
- **It does not cover the whole model.** v0's chain is the foundation and the first floor; the
  roof, the boundary and the MEP phases come with W2.12, and the gate grows with them (the
  states are per phase ✓).
- **It does not cover the rebar.** The BBS is derived from the floor design (W2.4), so it moves
  with the floor; the rebar's own incremental story is the rebar phase's business.
- **The "identical outputs" law is about the whole chain**, and the walking skeleton (W2.10) is
  what checks the phases against each other; this gate checks the two *build paths* against each
  other.

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_incremental.py            # the design half (every push)
uv run --directory core python ../tools/cad/equivalence_probe.py --engine "<freecadcmd>"   # the engine half (weekly)
```
