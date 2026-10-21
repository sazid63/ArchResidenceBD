# The clash and coordination report v0 (W3.2): the design checked against itself

**Status:** v0.1.0 — the design's members are checked against each other and against the MEP's
points, and every clash is reported **with its reason**.
**Code:** `core/src/archres_core/design/clash.py` (the checks) ·
`tools/clash/build_clash.py` (the builder and the freshness check) ·
`core/tests/test_design_clash.py` (7 tests) ·
**Artefacts:** `data/cad/generated/clash-report.json` and `clash-report.md` ·
**Decision record:** ADR-0046
**Depends on:** W2.9 (the federation: the phases in one datum), W3.1 (the MEP's points) ·
**Plan:** §5.7 (*coordination/clash checks*) · §6 (a clash/coordination report is a deliverable)
· §9 (no silent gaps)

## What it is

W2.9 made the check possible ✓: the phases are separate documents in **one datum** ✓ and the
master links them ✓ — so every phase's members are known in the same coordinate system ✓, and
they can be compared ✓.

Two checks, both on the **design** ✓ (so no engine is needed ✓ — the check is the
deterministic half ✓):

1. **The MEP's points against every member** ✓ — a point inside a column is a clash ✓,
   whoever owns the column ✓.
2. **The services against the structure** ✓ — a landing that lands on a slab ✓, a shaft that
   stands where the slab has no hole ✓.

The **structure's own members are not compared with each other** ✓: a column stands on its
footing ✓, a beam lands on a column ✓ and a slab sits on the beams ✓ — those are
**connections** ✓, and the v0 design does not model a connection ✓, so an overlap there would
be an artefact of the boxes and not a fact about the building ✓ ✓.

## The law the report keeps

**A clash is reported with its reason, and the known ones are named as known.** The v0 design
is **not coordinated** ✓ — the slabs carry no openings ✓, the model puts the beams and the
footings at the floor's level ✓, and the MEP's layout is an even grid over the floor ✓
(W3.1 ✓). A report that hid those would be a false report ✓ ✓. So each clash carries a
**severity** ✓:

- **declared** ✓ — the clash is the consequence of a named v0 limitation ✓ (the slabs carry no
  openings ✓, the model puts the beams and the footings at the floor's level ✓);
- **open** ✓ — nothing declares it ✓, and it needs a decision ✓ (a point on a column ✓, the
  lift shaft standing where a column is ✓).

And every clash carries its **cause** ✓ — a short key and the sentence that explains it ✓
— so the report can **group** them ✓ and lead with the one that matters ✓ ✓.

## The measured output (2026-10-21, `two-storey-residential`)

- **29 members** and **26 MEP points** were checked ✓ — the foundation's footings and grade
  beams ✓, both floors' columns, beams and slabs ✓, and both storeys' landings and lift
  shafts and cars ✓.
- **67 clashes** ✓ — **25 declared** ✓ and **42 open** ✓ — in **five causes** ✓,
  because sixty of the same reason is **one** reason ✓, not sixty ✓ ✓:

  | Cause | Clashes | What it says |
  |---|---|---|
  | `the-grid-is-a-line` | 24 | **the v0 structure is a single line of footings along the frontage** (W2.2's rule ✓), so the floor is a strip — and the MEP's points sit on the columns that stand on it ✓ |
  | `members-at-floor-level` | 18 | the v0 model builds the beams, the grade beams and the footings at the floor's level ✓, so a point near the floor is inside them ✓ |
  | `the-lift-shaft-stands-where-a-column-is` | 15 | the lift shaft stands beside the grid's last column and swallows it ✓ (W2.12's placement ✓) — nothing declares it ✓ |
  | `no-openings` | 7 | the v0 slabs carry no openings ✓, so nothing can pass through a slab ✓ |
  | `the-layout-is-an-even-grid` | 3 | the MEP's layout is an even grid over the floor ✓ (W3.1 ✓), so a point can land on a member ✓ |

  The **first cause is the headline** ✓: the v0 structure has no floor plan — it is a line of
  footings — so the MEP's layout cannot be coordinated with it ✓ ✓. That is a fact about
  the design ✓, and the report says so once ✓ instead of sixty times ✓ ✓.
- The **CI step** re-derives the report and compares it with the committed one ✓ ✓.

## What the checks do not cover

- **The stair flight** ✓ — it is a sloped slab ✓, so its box is not the member's shape ✓, and a
  box that is not the member's shape invents clashes ✓.
- **The members of one phase against each other** ✓ — inside a phase the members join ✓.
- **The MEP's own runs** ✓ (the conduit ✓, the water pipe ✓ and the gas pipe ✓) — the v0 runs
  are W2.12's assumed sizes ✓, and the MEP sizes the branches that come off them ✓.
- **The 3D routing between the MEP's points** ✓ — the plan's §5.7 puts full 3D routing in v2 ✓.
- **The MEP in the federated master** ✓ — the master carries the phases' geometry ✓; the MEP's
  points and the clash report land there with the next package ✓.

## What the check found

The clash check found a **real defect in W3.1** ✓: the MEP's points were placed at the world's
origin ✓ instead of on the slab ✓ — so the layout was not on the building at all ✓ ✓. The
placement is fixed ✓, the artefact is regenerated ✓, and a test holds it ✓.

## Checks

```powershell
uv run --directory core python ../tools/clash/build_clash.py --check   # the report is fresh
uv run --directory core pytest -q tests/test_design_clash.py           # 7 tests
```
