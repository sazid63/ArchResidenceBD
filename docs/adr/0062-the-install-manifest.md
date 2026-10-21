# ADR-0062 — The install manifest: the install is declared, and an unmeasured hash is absent

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
manifest slice) · **Plan:** §5.9 (the runtime stack the installer ships) · §5.10 (the source
registry) · **Related:** ADR-0061 (the install layout), ADR-0004 (the notices), ADR-0003 (the
rule packs)
**Code:** `core/src/archres_core/install.py` (the manifest) · **Tests:**
`core/tests/test_install_manifest.py` (9) · **Spec:** `docs/spec/install-manifest-v0.md`

## Context

ADR-0061 fixed the install **layout** ✓ — one folder ✓, and the user installs one thing ✓.
But a layout is only half of a promise: the installer has to know **what** it lays down ✓,
**which licence** each piece carries ✓, **which machine tier** it belongs to ✓, and **whether
the bytes it fetched are the bytes it expected** ✓.

The repo already holds most of that ✓ — the registry pins each model's hash and size ✓,
the third-party register holds the licences ✓, the CAD engine's version is known ✓ — but
scattered ✓, and the plan's §5.10 law (a curated, versioned list of trusted sources, with
every fetched value carrying its provenance ·) was never written as one declaration ✓.

## Decisions

1. **The install is declared** ✓ — one manifest ✓, every piece with its role ✓, its licence
   ✓, its tier ✓, its path ✓ and its hash ✓ — so the installer ✓, the shell ✓ and the
   core read the same declaration ✓ ✓.
2. **An unmeasured hash is absent, not a fake** ✓ — a piece nobody has measured has **no**
   hash and **no** size ✓, and the manifest says so with a count ✓. A placeholder that looks
   like a fact is exactly what the repo's law is about ✓ (a fetched number is a candidate
   until someone verifies it ✓ ✓) — and the installer measures the piece when it fetches it
   ✓ ✓.
3. **Every bundled piece carries its licence** ✓ — a piece without one is refused ✓ — and
   the notices travel with the install ✓ (ADR-0004 ✓) ✓.
4. **The model pack's hashes are the registry's** ✓ — the measured ones ✓ — and the
   manifest carries each base model's licence ✓ (the upstream licence ✓, which the cards
   and the publish recipe agree on ✓ ✓).
5. **The tiers are named** ✓ — `cpu` ✓, `cuda` ✓, `vulkan` ✓ — and an unknown tier is
   refused ✓, because a tier the installer cannot place is a tier it does not claim ✓
   (W5.3 ✓) ✓.
6. **The ids are unique** ✓ — two parts with one id would make the installer's counting a
   lie ✓ ✓.

## Consequences

- **The installer's job is now a list** ✓ — the manifest ✓ — and everything in it is a fact
  the repo already holds ✓, or an honest gap ✓ ✓.
- **The measured and the unmeasured are told apart** ✓ — 4 of the 10 parts are measured ✓
  (the models ✓) and 6 are not ✓ (the shell ✓, the runtime ✓, the core ✓, the engine ✓, the
  notices ✓, the packs ✓) — and the manifest counts both ✓ ✓.
- **The layout, the manifest and the shell agree** ✓ — one declaration ✓, read by all
  three ✓ ✓.
