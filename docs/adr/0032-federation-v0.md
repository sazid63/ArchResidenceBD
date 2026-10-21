# ADR-0032 — The federation links the phases; it does not copy them

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.9
**Code:** `core/src/archres_core/cad/federation.py` · `tools/cad/federation_probe.py`
**Spec:** `docs/spec/federation-v0.md`
**Depends on:** W2.1 (the worker pool), W2.2 (the foundation), W2.3 (the floor), W2.8 (the mesh
export) · plan §5.3, §5.4, §6, §8

## Context

The plan's 3D deliverable is a **federated model**: per-phase models plus a combined master
(§6), and the NativeCAD layer keeps "federation (shared datum; per-phase FCStd files; master via
App::Link; regenerate only changed phases)" (§5.3). §8 adds the efficiency law that the master
must be rebuildable *incrementally* and that the incremental result must equal the full rebuild
(W2.11's gate).

Three things were undecided: what the **shared datum** is, whether the master **copies** the
phases or **links** them, and what the committed evidence is (the FCStd files are binary and
carry timestamps, so they cannot be byte-compared in CI).

## Decisions

1. **The datum is the project origin, and it is read from the spec.** The Building Spec is the
   single source of truth (§5.4); the datum (the project id, the origin, the axes, the unit, the
   location) is a small JSON document built from it. Every phase's model is built in that datum —
   the floor's columns sit on the foundation's grid **by construction**, because the design chain
   puts them there, not because something moved them later.
2. **The datum is written into the files, not only into the app.** Every phase file and the
   master carry it as a document property, so a reader who opens the file (or receives it from an
   engineer) knows which datum the geometry is in. A model without its datum is a model whose
   position is a guess.
3. **The master links; it does not copy.** The master holds `App::Link` objects to the phase
   files. Copying the shapes would create a second building that has to be kept in step by hand
   — the exact failure mode the "identical outputs" law (plan §9) exists to prevent. The probe
   asserts that the master holds links and that it does not contain the phase shapes.
4. **One file per phase, and the master must exist on disk before it can link.** FreeCAD refuses
   a link whose owner document has never been saved ("Owner document not saved"), so the master
   is saved first and re-saved with its links — a small thing that is worth recording, because
   the failure is cryptic.
5. **The committed evidence is the datum and the master report, not the FCStd files.** An FCStd
   is a zip with timestamps inside, so it cannot be byte-compared; the report carries the links,
   the objects and their measured volumes, and the offline CI check re-derives the design's
   numbers and compares them with the report. The FCStd files stay in the runtime model store
   (the FCStd export story is P3/P5's).
6. **The master is checked against the phases, not against a stored number.** The probe compares
   the master's object count and its measured volume with the **design** (15 objects,
   5.45175 m³) — the same volume the walking skeleton measured (W2.10) and the mesh export
   carried (W2.8). Three stages, one building.

## Consequences

- The phases are separate documents in one datum, so "regenerate only the phase that changed" is
  now *possible*; W2.11 turns it into a *gate*.
- The master is small (6,605 B) because it holds links, not shapes — and it cannot drift from the
  phases, because it has no copy of them.
- The app can load the master or a single phase; the workspace (W2.8) draws the mesh of one
  document today, and the linked master is the next layer.
- The clash / coordination report (plan §6), the federated master in the viewport, the MEP and
  the ground floor are not here: the engine has not built them, so the master holds what exists.
