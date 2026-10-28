# ADR-0077 — The handover is the engineer pack's, and the app shows what it holds

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the shell's last
wiring) · **Plan:** §5.1 (the navigation: *Documents* ·) · **Related:** ADR-0067 (the
project bundle), ADR-0037 (the engineer pack)
**Code:** `core/src/archres_core/bridge.py` (`documents.list` ·) ·
`app/src/screens/DocumentsScreen.tsx` (the documents screen ·) · **Tests:**
`core/tests/test_bridge_documents.py` (4) · **Spec:** `docs/spec/desktop-shell-v0.md`

## Context

The last mock screen ✓ was the **Documents** one ✓ — the drawings ✓, the BBS ✓, the reports
✓, the engineer pack ✓ — the app's *output* ✓ ✓.

And a naming problem surfaced ✓: the repo has **two** packs ✓ — the **project bundle** ✓
(ADR-0067 ✓: the backup ✓ and the transfer ✓) and the **engineer pack** ✓ (the handover ✓) ✓
— and they are **different things** ✓ ✓.

## Decisions

1. **The handover is the engineer pack's** ✓ — the spec ✓, the drawings ✓, the BBS ✓, the
   BOQ ✓ and the compliance audit ✓ — and the app shows **what it holds** ✓, grouped by the
   **role** the pack's own manifest names ✓ ✓ — so the user sees the handover before they
   hand it over ✓ ✓.
2. **One reader each** ✓ — the *bundle* is read by the bundle's reader ✓ (the backup ✓) and
   the *engineer pack* by the pack's reader ✓ (the handover ✓) ✓ — two different documents
   ✓, two readers ✓, and **no** reader that guesses which is which ✓ ✓ ✓.

## Consequences

- **The app's output is real** ✓ — the documents the user shows the engineer are the ones
  the pack holds ✓ ✓.
- **The pack's parts carry their role and their hash** ✓ — the manifest's own words ✓ ✓.
- **What is not here** ✓: the **file dialog** ✓ (the shell's ✓ ✓), and the **pack's
  building** ✓ (the walking skeleton's and the CAD suite's ✓ ✓).
