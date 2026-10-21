# ADR-0063 — The installer lays the folder down, and names what it does not have

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
apply slice) · **Plan:** §5.9 (the runtime stack the installer ships) · **Related:**
ADR-0062 (the manifest), ADR-0061 (the layout), ADR-0004 (the notices)
**Code:** `core/src/archres_core/install.py` (`install_plan` · `apply_plan` ·
`LICENCE_FILES`) · `tools/ci/licence_notice_guard.py` (the guard) · **Tests:**
`core/tests/test_install_manifest.py` (13) · **Spec:** `docs/spec/installer-v0.md`

## Context

ADR-0062 declared the install ✓ — every piece ✓, its licence ✓, its tier ✓, its hash ✓.
ADR-0061 fixed the layout ✓. What was missing was the **act**: something that takes a
machine and makes the folder the product promises ✓ — and the law that goes with it ✓.

## Decisions

1. **Plan, then apply** ✓ — the plan is a document ✓ (the folders ✓, the copies ✓, the
   notices ✓, the missing pieces ✓) ✓ and it is **inspectable before anything is written**
   ✓ ✓. A plan you cannot read is not a plan ✓ ✓.
2. **The installer never downloads** ✓ — that is the downloader's job ✓ (W5.2 ✓: resumable
   ✓, checksummed ✓) — and it never **invents** ✓: a piece this machine does not have is
   **named** in the plan ✓, not skipped ✓ ✓. An installer that quietly skips a piece ships
   a broken product ✓ ✓.
3. **The licence files travel with the install** ✓ — the folder's `licenses/` carries the
   files the app's Licences screen points at ✓ ✓ — and **one guard holds the two lists
   together** ✓ (`licence_notice_guard.py` ✓: the core's list and the app's legal module
   must agree ✓ ✓), so the install folder and the screen cannot drift apart ✓ ✓.
4. **The copies are the pieces this machine has** ✓ — the core package ✓ and the rule packs
   ✓ — and the apply step is **deterministic** ✓ (the same plan, the same bytes ✓) ✓ ✓.

## Consequences

- **The installer's first half is real** ✓ — a plan ✓, an apply ✓, and a test that shows
  the folder laid down ✓: the folders ✓, the core's modules in place ✓, the rule packs in
  place ✓, and the notices written ✓ ✓.
- **What is missing is a list, not a silence** ✓ — the engine ✓, the runtime ✓ and the
  four models ✓ are named ✓ ✓, and W5.2 fetches them ✓ ✓.
- **The licence folder and the Licences screen agree** ✓ — by guard ✓, not by memory ✓ ✓.
