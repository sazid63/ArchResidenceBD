# ADR-0034 — The common services are authored assumptions, and the scale-out forced the ids to be unique

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.12
**Code:** `core/src/archres_core/design/commons.py` · `tools/cad/commons_probe.py` ·
`core/src/archres_core/design/floor.py` (the id fix)
**Spec:** `docs/spec/common-services-v0.md`
**Depends on:** W2.2, W2.3 · plan §5.1, §6, §8, §9

## Context

The plan's pipeline ends with the **common services**: stairs, lift, conduits, water and gas
lines (§5.1). v0's rule pack has **no rule** for any of them, and the plan's law is that the
pack holds all the numbers (§5.6). So the package had to answer a question the pack cannot: who
supplies the stair's width, the lift's car and the conduit's diameter?

And the scale-out (a second storey) exposed a defect in the finished chain: the floor's members
were named after their own ids, so two storeys produced the **same names** in one model.

## Decisions

1. **The common services are authored assumptions, handed back for the spec.** The stair's width
   and going, the lift's shaft and car, the pipe diameters: none is in the pack, so each is
   declared with its reason and the app writes it into the spec (the same contract as the
   foundation's footing sizes, ADR-0022, and the floor's column sections, ADR-0023).
2. **The sizes that can be computed are computed.** The stair's pitch follows the rise and the
   going; the flight climbs the storey height the spec gives; the conduit's diameter follows the
   number of units the floor holds (eight outlets per unit, stepping up past 32); the lift's car
   has to **fit** its shaft, and the design says whether it does. Simple, stated rules — not
   numbers someone typed.
3. **What the spec does not say is declared absent, not invented.** The lift shaft's opening in
   the slab is not cut (the v0 slabs carry no opening data) and the stair is the sloped slab
   without treads or railings. A hole nobody asked for is a fabricated fact.
4. **The ids are unique across the model.** The floor's members carry their storey
   (`Column_floor_1_C1`, `Slab_floor_0`). The plan's §8 says the ids come from stable spec ids
   and never from the build order; a name that collides is not stable, and the second storey is
   what proved it. The fix touched the finished chain, so **every probe was re-measured** — the
   floor, the rebar, the sheet, the mesh, the federation, the walking skeleton and the
   equivalence gate — and none of the numbers moved; only the names did.
5. **The design expects the engine's form of the name.** FreeCAD sanitises an object's name (a
   hyphen becomes an underscore), so the design carries `floor_1` where the label reads
   `floor-1`. Otherwise the design and the engine disagree about what an object is called, and
   the probe cannot check one against the other — which is the whole point of the probe.
6. **A pipe's expected volume is carried to nine decimals.** A pipe's volume is a fraction of a
   cubic metre; rounded to six it becomes zero, and a check that compares zero with zero passes
   for the wrong reason.

## Consequences

- The pipeline reaches its last phase shape: the common services exist, they are measured, and
  every number in them says where it came from.
- The multi-storey model is safe to name: the ground floor and the first floor no longer share
  a member's name, and the *tree* in the workspace can key on it.
- The MEP **schedules** (circuits, loads, drainage slopes, the gas layout) are still P3's: v0 has
  the runs and the lift's fit check, not the schedules.
- The v0 walkthrough (the walking skeleton) still builds the foundation and the first floor; the
  scale-out is measured by its own probe, and the walking skeleton's numbers did not move.
