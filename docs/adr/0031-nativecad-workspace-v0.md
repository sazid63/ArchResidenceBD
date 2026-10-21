# ADR-0031 — The workspace draws the engine's mesh, and the app takes no 3D dependency

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.8
**Code:** `core/src/archres_core/cad/mesh.py` · `tools/cad/mesh_probe.py` ·
`app/src/cad/viewer.ts` · `app/src/screens/NativeCadScreen.tsx`
**Spec:** `docs/spec/nativecad-workspace-v0.md`
**Depends on:** W2.1 (the worker pool), W2.2 (the foundation), W2.3 (the floor) · plan §5.1, §5.3

## Context

The plan's NativeCAD has three layers: the invisible engine, **the NativeCAD workspace** (the
product's own CAD surface: a 3D viewport streaming from the engine, a phase model tree,
parametric edit panels) and the full-CAD tab (W2.13).

Until now the app's design screen was the W0.2 prototype — a mock canvas. The workspace needs
two things the repo did not have: a way to get **the engine's geometry** into the app, and a way
to **draw** it.

Two constraints shape both: the app ships as **one installer** (every dependency is a megabyte
and a licence question), and the plan's law is that **the engine measures and the app writes**
(§2.5) — the viewport must not invent a building, and the numbers it shows must be the engine's.

## Decisions

1. **The engine exports a mesh; the app draws it.** The design's macro is composed with an
   export epilogue that tessellates the document the design built and writes `mesh.json`
   (the object ids and labels, the kind and phase, the **measured** volume and bounding box, and
   the triangles). The app fetches that document and draws it. The design module does not know a
   viewport exists, and the export adds no geometry of its own.
2. **The transport is plain JSON, not glTF.** The plan says "glTF/tessellation"; the export
   story (FCStd / DXF / IFC) is where glTF belongs, and the viewport needs a payload it can draw
   without a parser it does not have yet. The format is a JSON document with positions, per-facet
   normals and indices — 26 kB for the v0 model.
3. **No 3D library.** The viewport is ~350 lines of WebGL: a perspective camera, an orbit, a zoom,
   one lit shader. three.js would add a dependency to a bundled desktop installer for a viewer
   that draws boxes, and the plan's corner policy and theme live in CSS, not in a 3D framework.
   A new dependency needs the owner's sign-off, and this one is not needed.
4. **The workspace replaces the prototype's design screen.** The mock canvas and its mock phase
   list are gone; the sidebar's design section opens the workspace. The tree is the phase tree
   (the plan's "phase model tree") and the parameters carry their provenance (`spec` / `derived` /
   `assumed`) plus the design's **declared absences** (walls, openings) — the user sees what the
   model does *not* contain.
5. **The numbers on screen are the engine's.** The tree shows the measured volume and the measured
   size; the panel shows the design's values with their provenance. The viewer computes nothing
   but pixels.
6. **The live stream and the Design button are declared, not delivered.** They need the desktop
   bridge (the Tauri shell and the IPC to the bundled engine). The *seam* is already the product's
   shape — the app fetches a URL — but the transport in v0 is the committed artefact, and the
   panel is read-only. Saying otherwise would be a claim the app cannot honour.
7. **The mesh is checked against the design, and against the walking skeleton.** The probe runs
   the foundation's and the floor's macro through the worker pool, compares every object's volume
   and position with the design, and the numbers must match the walking skeleton's (15 objects,
   5.45175 m³) — the same model, not a second one. Two runs must produce the same mesh.

## Consequences

- The app's design surface shows real geometry: the viewport was verified in a browser (the frame
  buffer holds the two phase colours over the ground plate), and the tree's numbers are the
  engine's.
- The workspace is one fetch away from being live: the desktop bridge serves the same document
  from the bundled engine.
- The app's dependency list is unchanged (React and React-DOM only) — the install stays small and
  the licence surface stays small.
- The parametric panel is read-only until the bridge exists; the parameters and their provenance
  are already there, so the bridge only has to add the edit and the re-run.
- The mesh is a *view*: the ground floor, the roof, the MEP and the rebar are not in it yet,
  because the engine has not built them. The workspace says so (the declared absences) rather than
  showing an empty building.
