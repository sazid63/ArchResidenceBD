# The federation v0 (W2.8 → W2.9): a shared datum, one file per phase, a master that links them

**Status:** v0.1.0 — the phases are separate documents in one datum, and the master links them.
**Code:** `core/src/archres_core/cad/federation.py` (the datum, the phase epilogue, the master
macro) · `tools/cad/federation_probe.py` (the live probe) ·
`core/tests/test_cad_federation.py` (5 tests) · **Artefacts:**
`data/cad/generated/federation/` (the datum + the master report) · **Decision record:** ADR-0032
**Depends on:** W2.2 (the foundation), W2.3 (the floor), W2.1 (the worker pool), W2.8 (the mesh
export) · **Plan:** §6 (federated 3D: per-phase models + a combined master) · §5.3 (the NativeCAD
layer keeps "federation (shared datum; per-phase FCStd files; master via App::Link; regenerate
only changed phases)") · §5.4 (the spec is the single source of truth) · §8 (the incremental
rebuild)

## What it is

The plan's 3D deliverable is a **federated model**: per-phase models plus a combined master
(§6). This package is that structure, in the engine:

```text
Building Spec ─▶ the shared datum (the project origin, mm, z up)
     │
     ├─▶ the foundation's macro ─▶ foundation.FCStd   (7 objects, in the datum)
     ├─▶ the floor's macro     ─▶ floor.FCStd       (8 objects, in the datum)
     └─▶ the master macro      ─▶ master.FCStd      (15 App::Link objects)
```

## The three laws

1. **One datum.** Every phase's model is built in the project's datum, so the parts agree **by
   construction** — the floor's columns sit on the foundation's grid because the design chain
   puts them there, not because something moved them later. The datum is a small JSON document
   (the project id, the origin, the axes, the unit, the location) and it is written **into every
   phase file and into the master** as a document property, so a reader of the file knows which
   datum the geometry is in.
2. **One file per phase.** A phase is a document: the foundation, the first floor. Keeping them
   apart is what makes "regenerate only the phase that changed" possible — that gate is **W2.11**
   (the incremental ≡ full-rebuild equivalence), not this package.
3. **The master links; it does not copy.** The master holds `App::Link` objects to the phase
   files. A link shows the phase's geometry and keeps the phase's file as the single source of
   truth; copying the shapes would create a second building that has to be kept in step by hand.

## The measured output (2026-10-21, `two-storey-residential`)

`tools/cad/federation_probe.py` runs the two phase macros and the master macro through the
**worker pool** and measures:

- **15 links, 15 objects, 5.45175 m³** — the same 15 objects and the same volume the walking
  skeleton measured (W2.10) and the mesh export carried (W2.8) ✓ — the same building, three
  ways.
- **The master agrees with the design**: every linked object's volume is within the declared 1 %
  of the design's, and the object count matches the design exactly.
- The phase files are **8,143 B** (the foundation) and **9,026 B** (the floor); the master is
  **6,605 B** — it is smaller than the phases it links, because it holds links, not shapes.
- The master document holds the datum as a property ✓.

## What is deliberately not here

- **The phase files and the master are not committed.** They are written to the job's scratch
  directory (the runtime model store); the committed evidence is the **datum** and the **master
  report** (the links, the objects, the volumes), and the offline CI check re-derives the design's
  numbers and compares them with the report ✓. The FCStd export story is P3/P5's ("Exports: FCStd,
  DXF, IFC", plan §6).
- **The incremental rebuild.** "Regenerate only the phase that changed" is W2.11's gate; this
  package makes it *possible* (the phases are separate files) but does not prove it.
- **The clash / coordination report** (plan §6) and the **federated master in the workspace**:
  the workspace (W2.8) draws the mesh of one document, not the linked master.
- **MEP, the roof and the ground floor**: the engine has not built them in v0, so the master
  holds what exists.

## Checks

```powershell
uv run --directory core pytest -q tests/test_cad_federation.py                   # 5 tests
uv run --directory core python ../tools/cad/federation_probe.py --check           # the artefacts agree with the design
uv run --directory core python ../tools/cad/federation_probe.py --engine "<freecadcmd>"   # the live probe
```
