# The NativeCAD workspace v0 (W2.8)

**Status:** v0.1.0 — the app's design surface shows the engine's own geometry: a 3D viewport, a
phase model tree and the parameters with their provenance.
**Code:** `core/src/archres_core/cad/mesh.py` (the engine's export) ·
`tools/cad/mesh_probe.py` (the live probe) · `app/src/cad/viewer.ts` (the viewport) ·
`app/src/cad/mesh.ts` (the payload) · `app/src/screens/NativeCadScreen.tsx` (the workspace) ·
`core/tests/test_cad_mesh.py` (5 tests) · **Artefacts:** `data/cad/generated/*.mesh.json` ·
**Decision record:** ADR-0031
**Depends on:** W2.2 (the foundation), W2.3 (the floor), W2.1 (the worker pool) · **Plan:** §5.3
(NativeCAD — the workspace: viewport, phase model tree, parametric edit panels) · §5.1 (the left
navigation and the design system) · §9 (no silent gaps; unverified content is a candidate)

## What it is

Until now the app's design screen was the W0.2 prototype: a mock canvas with a mock phase list.
This package replaces it with the thing the plan describes — **the NativeCAD workspace**, the
product's own CAD surface:

- **A 3D viewport** that draws the engine's geometry. Not a picture of the building and not an
  approximation of the design: the triangles are the engine's own tessellation of the very
  document the design macro builds.
- **A phase model tree** — every object the engine measured, grouped by phase, with its size and
  its measured volume, and a visibility toggle.
- **A parametric panel** — the design's parameters with the **provenance** of each one (`spec` /
  `derived` / `assumed`), the assumptions the design handed back, and what the design
  **declared absent** (walls, openings) so the user is not left guessing.

The plan's workspace is also "streaming from the engine" and offers a **Design** button and
editable parameters. Those need the desktop bridge (the Tauri shell and the IPC to the bundled
engine) and are **declared, not delivered** — see below.

## The bridge: the mesh export

`archres_core.cad.mesh` composes the **design macro** with an export epilogue and runs it in the
engine. The epilogue walks the document the design built and writes `mesh.json`:

| Field | What it is |
|---|---|
| `id` / `label` | the document object's name and label (the stable ids, never the build order) |
| `kind` / `phase` | footing, grade-beam, column, beam, slab · foundation, floor |
| `volumeMm3` | the **measured** volume of the shape |
| `bboxMinMm` / `bboxMaxMm` | the measured position (the storey elevation lives here) |
| `positions` / `normals` / `indices` | the triangles (per-facet normals: the shapes are flat) |

Two laws:

- **The engine measures, the app draws.** The viewer never computes a volume, a size or a
  position — it draws the mesh and shows the numbers the engine wrote. The probe checks the mesh
  against the **design** (the same cross-check the other CAD packages use).
- **The export is derived, never authored.** It adds no geometry of its own: a shape that is not
  in the document is not in the mesh. The design module does not know that a viewport exists.

## The viewport (no 3D library)

The viewer is ~350 lines of WebGL: a perspective camera, an orbit (drag) and a zoom (wheel), one
lit shader, and the engine's triangles. **No three.js**: the app's dependency list stays tiny (a
bundled installer that ships a 3D framework is a bigger install and a bigger licence review for
a viewer that draws boxes), and the plan's corner policy and theme live in CSS, not in a 3D
framework. The colours follow the theme's pastel phase accents (amber for the foundation, sky for
the floor) over a warm ground plate.

**Verified in a browser (2026-10-21):** the workspace loads the engine's mesh, the tree shows
**15 objects**, the header reads **15 objects · 180 triangles · 5.4518 m³**, the parameters table
lists the design's values with their provenance (`excavation.depthM 1.8 m spec`,
`footing.sizeMm 1200 mm assumed`, …), and the canvas **draws**: the frame buffer holds the paper
background, the ground plate and the two phase colours (6,379 px of foundation, 2,941 px of
floor). No console errors.

## The measured output (2026-10-21, `two-storey-residential`)

`tools/cad/mesh_probe.py` runs the foundation's and the floor's macro through the **worker pool**
(the same pool the app uses) and measures:

- **15 objects, 180 triangles, 5.45175 m³** — the same 15 objects and the same volume the
  walking skeleton measured (W2.10: 15 objects, 5.45175 m³) ✓ — the mesh is that model, not a
  second model.
- The mesh **agrees with the design**: every object's volume (within the declared 1 %) and its
  position (the first floor's columns measure z 3,200 → 6,200 mm ✓).
- **Two runs produce the same mesh** (plan §9, "identical outputs") ✓.
- The committed artefact is `data/cad/generated/two-storey-residential.mesh.json` (26 kB); the
  app imports it by URL, so the dev server hands the workspace the engine's own file.

## What is deliberately not here

- **The live stream and the Design button.** The workspace reads the committed artefact; the
  shipped app must stream from the bundled engine through the desktop bridge (the Tauri shell
  and its IPC, W2.13 and P5). The *seam* is the same (the app fetches a URL ✓); the transport is
  not.
- **Editable parameters.** The panel shows the parameters and their provenance; editing them
  needs the same bridge (a parameter change re-runs the generator and the engine).
- **The rebar, the MEP, the ground floor and the roof.** The mesh carries what the engine built
  in v0: the foundation and the first floor. The design **declares** what it did not build (walls,
  openings) and the workspace shows that declaration instead of hiding it.
- **The full-CAD tab** (W2.13) and the **federated master** (W2.9): the workspace shows one
  document, not the federated model.
- **Selection and editing in the viewport** (click a member, change it): the viewer draws and
  toggles; picking is the next layer.

## Checks

```powershell
uv run --directory core pytest -q tests/test_cad_mesh.py                    # 5 tests
uv run --directory core python ../tools/cad/mesh_probe.py --check            # the mesh agrees with the design
uv run --directory core python ../tools/cad/mesh_probe.py --engine "<freecadcmd>"   # the live probe
pnpm --dir app typecheck                                                     # the app's gate
```
