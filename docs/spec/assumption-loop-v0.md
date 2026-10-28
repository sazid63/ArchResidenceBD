# The assumption loop closes v0 (W3.1's follow-up): what the design hands back, it reads back

**Status:** v0.1.0 — a design hands its authored assumptions back to the app, and the app can
write them into the spec; the next design honours them.
**Code:** `core/src/archres_core/design/foundation.py` (the shared `spec_value` helper — the one
implementation ✓) · `core/src/archres_core/design/floor.py` ·
`core/src/archres_core/design/commons.py` · `core/src/archres_core/design/mep.py` (the authored
values' table ✔) · `core/tests/test_design_assumption_loop.py` (the guard — 2 tests) ·
**Decision record:** ADR-0052
**Depends on:** W2.2 (the foundation), W2.3 (the floor), W2.12 (the common services), W3.1 (the
MEP) · **Plan:** §5.4 (the Building Spec is the source of truth) · §2.5 (every write is a spec
patch with provenance) · §9 (no silent gaps)

## What it was

The design hands its authored assumptions back so the app can write them into the spec — the
**write side** ✔, and it ships ✔ (the spec engine patches any path in a phase's data · the
interview engine writes with provenance · and the plan's §2.5 requires it ·).

The **read side** did not exist ✔. A design named a pointer — `/phases/foundation/data/footingSizeMm`
— handed the assumption back, and then never read that pointer again — so the value the app
wrote was **silently ignored** — silent wrong geometry — the same class as the foundation
ignoring the spec's footing depth — and a worse one, because the app had already told the user
the value was recorded.

Three shapes of the defect — all fixed ✓:

| What was wrong | Now |
|---|---|
| The foundation handed back `footingSizeMm`, `gradeBeamMm` (one pointer for **two** values — width and depth ✔), `footingSpacingMm` and the excavation's margin, and read none of them | one pointer per value ✔, each read before use — and the depth's own pointer is `footingDepthM`, the spec's key ✔ |
| The floor handed back `/phases/floor/data/columnSizeMm` — a phase that **does not exist** (the phases are `floor-0`, `floor-1` ✔) — and read none of them | the storey's own phase — `/phases/floor-1/data/columnSizeMm` — and the column, the beam's width and depth and the slab's overhang are read before use — |
| The MEP's assumptions were named `mep.electrical.lightingPointsPer100m2` — **not a JSON pointer at all** ✔, so the app could never write them, and the design read none of them | the MEP's authored values live in the services phase's data under an `mep.` prefix — real pointers — and one table is the single source of truth ✔ |

## The rule now

**The pointer a design hands back is the pointer the design read.** One helper — `spec_value` in
`design/foundation.py` — does it for every design ✔: read the spec's value at the pointer · if
the spec carries it, use it and say the provenance is `spec` · if not, assume the authored
default, say the provenance is `assumed`, and hand the assumption back **at that same pointer**
· so the app writes it where the next design will look for it ✔·.

The MEP goes one step further — its 23 authored values are **one table** ✔, so the defaults the
code uses, the keys the spec carries and the assumptions handed back cannot drift apart ✔·.

## The guard

`core/tests/test_design_assumption_loop.py` — for every assumption of every design — it writes
the value **through the app's own write path** (`apply_patch`, the spec engine — so the pointer
has to resolve for real ✔), re-runs the design, and asserts the value comes back as the
spec's — and is not handed back again ··.

So the class cannot come back ✔: a design that hands back a pointer it does not read **fails the
test** ··.

## The measured output (2026-10-21)

- The **foundation** hands back 5 assumptions — the footing's size · the grade beam's width and
  depth · the footing spacing · and the excavation's margin — and reads every one ✔·.
- The **floor** hands back 4 — the column's size · the beam's width and depth · and the slab's
  overhang — at the storey's own phase · and reads every one ✔·.
- The **common services** hand back 10 — the stair's width · flight thickness · landing depth
  and risers · the conduit's base diameter · the water and gas pipes' diameters · and the
  lift's shaft · car and height — and reads every one ···.
- The **MEP** hands back 23 — the whole authored table — and reads every one ··.
- The **numbers did not move** ✔ — the spec carries none of these keys, so the authored defaults
  still apply and every measured artefact is unchanged ✔·.

## What is deliberately not here

- **The app does not write these values yet** — the *read* side is here and proven · and the
  *write* side (the interview asking for the footing's size, the patch that carries it) is the
  app's own work ··. The loop is closed from the design's side ✔; the app's questions for
  each value are P4/P5's ··.
- **The MEP's values live in the services phase** · not in a phase of their own — the spec's
  phase kinds are fixed (site-excavation · foundation · floor · roof-boundary ·
  common-services ·) and a new kind is a schema change — W4/P5's ··.

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_assumption_loop.py   # 2 tests
uv run --directory core pytest -q tests/test_design_foundation.py tests/test_design_floor.py \
    tests/test_design_commons.py tests/test_design_mep.py
```
