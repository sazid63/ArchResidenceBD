# The MEP engines and their schedules v0 (W3.1): the points, the loads, the pipes, the falls

**Status:** v0.1.0 — the MEP has **point layouts**, **deterministic sizing** and **schedules**
for electrical, water, drainage, gas and the lift.
**Code:** `core/src/archres_core/design/mep.py` (the design) ·
`tools/mep/build_mep.py` (the builder and the freshness check) ·
`core/tests/test_design_mep.py` (14 tests) ·
**Artefact:** `data/cad/generated/mep-design.json` ·
**Decision record:** ADR-0045
**Depends on:** W2.12 (the common services: the runs and the lift's fit check) ·
**Plan:** §5.7 (*point layouts + schedules + deterministic sizing — electrical load/circuits,
water fixture units, drainage slopes, Titas gas, lift check; full 3D routing = v2; all
deterministic*) · §6 (the pipeline's per-floor + MEP stage) · §9 (no silent gaps)

## What it is

W2.12 built the **runs** — the conduit, the water pipe and the gas pipe — and the lift's fit
check. What was missing is everything that sits on top of the runs: **where the points are**,
**how big the pipes and the circuits are**, and **the schedules** an engineer reads.

- **The electrical layout** — the lighting points, the power outlets and the ceiling fans,
  placed on an even grid over the floor, **sized by the floor's area** (the spec's unit area
  where the spec gives one ✓). The **circuits** are those points packed into loads the cable
  can carry (3,000 W ✓), each with its cable ✓ and its breaker's rating ✓.
- **The water layout** — the fixture set of the units the storey holds ✓, each with its
  **fixture units** ✓, and the **supply pipe sized by the fixture units it serves** ✓.
- **The drainage** — the soil stack every storey carries ✓, the **branches at 1:60** ✓ (the
  fall is what carries the water ✓), and their diameters ✓.
- **The gas (Titas)** — a cooker per unit ✓, its load ✓, the meter ✓, and the **run sized by
  the load it carries** ✓.
- **The lift** — W2.12's fit check, scheduled once for the building ✓ (the car inside the
  shaft, with a hand's width of clearance on each side ✓).

## The three laws it keeps

1. **Nothing is invented where the spec says nothing.** The v0 spec carries no room programme,
   no wiring layout and no supply data, so the layouts are computed from the area and **every
   number is an authored assumption, handed back for the app to write into the spec** ✓ — the
   same contract the foundation's footing sizes (ADR-0022), the floor's column sections
   (ADR-0023) and the common services' dimensions (ADR-0034) keep ✓.
2. **The sizes that can be computed are computed.** A circuit's load is the sum of its points'
   loads ✓; a pipe's size follows the fixture units it serves ✓; a drain's fall follows the
   standard it is laid to ✓. The rules are simple, stated and authored — but they are *rules*,
   not numbers someone typed ✓.
3. **The spec decides what a storey is for.** The example's **ground floor is parking** ✓ (the
   spec says so ✓), so it carries **no fixture and no cooker** ✓ — the lights and the soil
   stack are there, the kitchen sink is not ✓. A design that quietly put a kitchen on a
   parking floor would be a design that disagreed with the spec ✓.

## The measured output (2026-10-21, `two-storey-residential`)

`tools/mep/build_mep.py` builds the MEP for both storeys of the example and writes the
committed artefact. The MEP has **no solids** ✓ (the plan's §5.7 puts the full 3D routing in
v2 ✓), so the check needs **no engine** ✓ — it is the deterministic half ✓.

- **26 points** ✓, **2 circuits** ✓, **14 schedule rows** ✓, **920 W** of connected load ✓,
  **14 fixture units** ✓ and **1 m³/h** of gas ✓ across the two storeys.
- The **CI step** re-derives the document and compares it with the committed one ✓ — a stale
  MEP fails the build ✓ ✓.

The example is a **small** house ✓ (two units of 60 m² ✓), so the numbers are small ✓ — a
bigger building gets more points by the same rules ✓.

## What is deliberately not here

- **The 3D routing between the points** — the plan puts full 3D routing in v2 ✓; v0 has the
  layouts and the runs ✓, and no connection between them ✓.
- **The switchboards, the incoming feeder and the service capacity** — the v0 spec carries no
  supply data ✓, so the schedules size the loads and stop there ✓.
- **The drainage's vent pipes and the floor-trap details** — no drainage layout in the spec ✓.
- **The riser that serves the floors above** — each storey is sized for its own fixtures ✓ and
  the riser's design is not done here ✓.
- **The points' coordination with the structure** — the layouts are an even grid over the
  floor ✓, and the **clash report is W3.2's job** ✓ ✓.
- **The MEP in the federated master** — the master carries the phases' geometry ✓; the MEP's
  points and schedules land with W3.2 ✓, which reads the master ✓.

## Checks

```powershell
uv run --directory core python ../tools/mep/build_mep.py --check     # the artefact is fresh
uv run --directory core pytest -q tests/test_design_mep.py           # 14 tests
```
