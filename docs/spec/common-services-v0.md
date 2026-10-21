# The common services and the scale-out v0 (W2.12): two storeys, a stair, a lift, the runs

**Status:** v0.1.0 — the chain builds more than one storey, and the common services phase
exists: the stair, the lift and the service runs.
**Code:** `core/src/archres_core/design/commons.py` (the design + the macro) ·
`tools/cad/commons_probe.py` (the live probe) · `core/tests/test_design_commons.py` (6 tests) ·
**Artefacts:** `data/cad/generated/commons-{design.json,macro.py,report.json}` ·
**Decision record:** ADR-0034
**Depends on:** W2.2 (the foundation), W2.3 (the floor) · **Plan:** §5.1 (the common services:
stairs, lift, conduits, water/gas lines) · §6 (the pipeline's per-phase models) · §8 (the ids
come from stable spec ids, never from the build order) · §9 (no silent gaps)

## What it is

The plan's pipeline ends with the **common services** (plan §5.1): *stairs, lift, conduits,
water/gas lines*. v0's rule pack has **no rule** for any of them — no stair geometry, no lift
sizing, no pipe sizing — so every dimension here is an **authored assumption** and the design
hands it back for the app to write into the spec, exactly like the foundation's footing sizes
(ADR-0022) and the floor's column sections (ADR-0023).

- **The stair** — a flight (the sloped slab that climbs to the next level) and a landing. The
  rise follows the storey height the spec gives, the going is the assumed 250 mm tread, and the
  flight's pitch is computed from the two.
- **The lift** — the shaft's enclosure and the car that has to fit inside it, with a **fit
  check** (the car plus a hand's width of clearance on each side).
- **The service runs** — the electrical conduit, the water pipe and the gas pipe, following the
  grid's extent. The conduit's diameter is **computed from the units the floor holds**
  (eight outlets per unit; more than 32 outlets and the conduit steps up).

Two things the design **declares absent** rather than inventing: the lift shaft's opening in the
slab (the v0 slabs carry no opening data, so no hole is cut) and the stair's treads and railings
(the v0 flight is the sloped slab only).

## The lesson the scale-out taught: the ids must be unique

Building a **second storey** exposed a real defect: the floor's members were named after their
own ids (`Column_C1`), so the ground floor's `C1` and the first floor's `C1` were the same name
in one model. The plan's §8 says the ids must come from stable spec ids and never from the build
order — and a name that is not unique is not stable.

**The fix:** the floor's members carry their storey (`Column_floor_1_C1`, `Slab_floor_0`), and
the design expects the *engine's* form of the name (FreeCAD sanitises a hyphen into an
underscore, so the design has to expect `floor_1` — otherwise the design and the engine
disagree about what the object is called and the probe cannot check one against the other).

## The measured output (2026-10-21, `two-storey-residential`)

`tools/cad/commons_probe.py` builds the foundation, **two storeys** (the ground floor and the
first) and the common services, and runs them through the worker pool:

- **30 objects, 1,824 triangles** (the foundation's 7, the ground floor's 8, the first floor's
  8, the common services' 7) ✓ — the multi-storey model, measured ✓.
- Every object's volume agrees with the design ✓ (the declared 1 % tolerance; the pipes are
  fractions of a cubic metre, so their expected volumes are carried to nine decimals — six
  would round them away ✓).
- **Two runs produce the same mesh** ✓ (plan §9).
- The whole chain re-measured after the id fix: the floor, the rebar, the sheet, the mesh, the
  federation, the walking skeleton and the equivalence gate all still pass ✓ — the numbers did
  not move (15 objects, 12.36375 m³, 154,276.09 BDT) ✓, only the names did ✓.

## What is deliberately not here

- **The MEP schedules and the point layouts** (plan §5.7: electrical load, circuits, drainage
  slopes, Titas gas, the lift check) — v0 has the runs and the lift's fit check; the schedules
  are P3's.
- **The roof and the boundary wall** — the walking skeleton's declared-absent phases ✓.
- **The stair's treads, railings and the shaft's opening** — declared absent ✓ (the spec carries
  no opening data ✓).
- **The ground floor's own services** — the design attaches the services to the storey it is
  asked for ✓; the app decides which storey they belong to ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_commons.py            # 6 tests
uv run --directory core python ../tools/cad/commons_probe.py --check       # the fixtures are fresh
uv run --directory core python ../tools/cad/commons_probe.py --engine "<freecadcmd>"   # the live probe
```
