# ADR-0061 — The install layout: one thing, and the user never meets a toolchain

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
layout slice) · **Plan:** §4 (the shell) · §5.9 (the runtime stack the installer ships) ·
§10 (the offline-first law) · **Related:** ADR-0060 (the shell and the bridge), ADR-0004 (the
engine's name is not branding)
**Code:** `app/src-tauri/src/lib.rs` (the shell finds its own runtime ✓) ·
`app/src-tauri/crates/bridge/src/lib.rs` (the core's path ✓) · **Spec:**
`docs/spec/install-layout-v0.md`

## Context

This is a **commercial** product: a person installs it and gets a working building designer.
That carries a law the repo has not written down yet, and the plan states it only in
pieces (the offline-first law ✓, the runtime stack §5.9 ✓, the installer W5.1 ✓):

**the user downloads one thing, and nothing about it asks them to be a systems engineer.**

Concretely, the user must not have to install Python ✓, Docker ✓, a Linux toolchain ✓, a
CUDA driver ✓ or a Git client ✓ — and must not have to know that any of those exist ✓.

The shell already needed a Python ✓ (the core is Python ✓) and the CAD engine ✓ (the
geometry ✓) and the model pack ✓ (the fleet ✓) — so the installer's whole job is to lay
those down ✓ and to make the shell find them ✓ without asking the user anything ✓.

## Decisions

1. **The install layout is fixed and declared** ✓ — one folder ✓, and every part of the
   product has its place in it ✓ (the shell ✓, the runtime ✓, the engine ✓, the models ✓,
   the packs ✓, the licences ✓, the user's projects ✓) ✓ ✓.
2. **The shell finds its own runtime** ✓ — the bundled Python sits at
   `<root>/runtime/python.exe` ✓ and the shell uses it ✓; `ARCHRES_PYTHON` overrides it ✓
   (for the dev tree ✓) ✓. Nothing asks the user to put Python on their PATH ✓ ✓.
3. **The core is found the same way** ✓ — the install folder's `runtime/core` ✓, and the dev
   tree's `core/src` ✓ ✓ — so the same bridge works in both ✓ ✓.
4. **The licences travel with the install** ✓ — the install folder's `licenses/` ✓ (the
   required notices ✓, the full texts ✓) ✓, and the app's Licences screen shows the notices
   ✓ (ADR-0004 ✓) ✓.
5. **The user's data is theirs** ✓ — the projects live in the install folder's
   `projects/` ✓, and a backup is the project bundle ✓ (the plan's one-file export ✓) ✓.
6. **The installer's tiers are measured, never assumed** ✓ (W5.3 ✓) — and the shell does
   not claim a tier it cannot verify ✓ (the CAD engine's rule ✓) ✓.

## Consequences

- **The installer's job is now a list** ✓ — the layout ✓, the artifacts ✓, their licences ✓
  and their hashes ✓ — and every piece of it is a fact the repo already holds ✓ (the
  registry's model hashes ✓, the third-party register's licences ✓, the engine's version ✓) ✓.
- **The user meets one installer and one app** ✓ — no Python ✓, no Docker ✓, no Linux ✓,
  no toolchain ✓ ✓.
- **The shell's own discovery is testable** ✓ — the paths are named ✓, not searched for ✓,
  and a missing runtime is *reported* ✓ (the About screen's core health ✓) rather than
  hidden ✓ ✓.
