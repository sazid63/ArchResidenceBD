# The combined master carries the MEP and the clash report v0

**Status:** v0.1.0 — the master holds the phases' geometry **and** the data that describes them.
**Code:** `core/src/archres_core/cad/federation.py` (the master macro) ·
`tools/cad/federation_probe.py` (the probe) · `core/tests/test_cad_federation.py` (2 more tests) ·
**Artefact:** `data/cad/generated/federation/master-report.json` · **Decision record:** ADR-0050
**Plan:** §6 (*Federated 3D: per-phase models + combined master (LOD 300–350, rebar, **MEP points
+ schedules**, **clash/coordination report**)*) · §5.3 (the NativeCAD layer's federation)

## What it is

The plan's federated deliverable has three parts in the master: the phases' geometry ✓ (linked,
not copied ✓), the **MEP's points and schedules** ✓ ✓, and the **clash/coordination report**
✓ ✓. The first was there ✓ (W2.9 ✓); the other two are this package ✓ ✓.

- The master holds them as **document properties** ✓ — beside the datum ✓, which is already a
  property ✓ — because the phases' geometry is linked ✓ and their data travels with it ✓ ✓.
- The **probe builds both from the design** ✓ (the MEP ✓, the clash members and points ✓) and
  hands them to the job ✓ ✓ — so what the master carries is **the design's own** ✓, not a copy
  of it ✓ ✓, and a test holds that ✓ (the master's points are the design's points ✓ ✓).
- The **measurement** the macro writes carries them too ✓ ✓, so the probe can check them
  without parsing the document ✓ ✓ — and the committed report is the record ✓ ✓.

## The measured output (2026-10-21)

- The master links **15 objects** ✓ in **12.36375 m³** ✓ ✓, and now carries **two storeys'
  MEP** ✓ (the points ✓, the schedules ✓ and the declared gaps ✓) and the **clash report** ✓ ✓.
- The master is **10,438 bytes** ✓ — bigger than a phase file ✓ — and the claim that changed with
  it is corrected in the three places that made it ✓ ✓ (the review ✓, the federation's spec doc
  ✓ and ADR-0032 ✓ ✓): what the master must not do is **drift from the phases** ✓, not be
  smaller than them ✓ ✓.

## What is deliberately not here

- **The master in the viewport** ✓ — the workspace (W2.8 ✓) draws the mesh of one document ✓,
  not the linked master ✓ ✓. That is the next layer ✓ ✓.
- **The walking skeleton's chain does not include the MEP** ✓ — the skeleton's report carries
  the MEP's *cost* ✓ (W3.8 ✓) but not its points ✓ ✓; the chain's MEP step is a package of its
  own ✓ ✓.
- **The rebar in the master** ✓ — the rebar is its own model ✓ (the BBS is its document ✓ ✓),
  and the plan's list names it ✓ but v0's rebar is a separate phase file ✓ ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_cad_federation.py
uv run --directory core python ../tools/cad/federation_probe.py --engine "<freecadcmd>"
```
