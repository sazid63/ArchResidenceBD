# ADR-0076 — The import review is the core's, and the decision is recorded

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W4.7 (the BYO-PDF importer —
in the app) · **Plan:** §5.6 (the law system) · **Related:** ADR-0056 (the importer), ADR-0003
(the rule pack)
**Code:** `core/src/archres_core/bridge.py` (`import.candidates` · `import.review` ·) ·
`app/src/screens/ImportReviewScreen.tsx` (the review screen ·) · **Tests:**
`core/tests/test_bridge_import.py` (4) · **Spec:** `docs/spec/byo-pdf-importer-v0.md`

## Context

W4.7 built the importer ✓ and the core's CLI ✓, and the plan's W4.7 names *"candidate
extraction + **review UI**"* ✓ — the screen was still the prototype's mock ✓ ✓. For a
commercial app that is where a user brings their **own** copy of an authority they may not
redistribute ✓ (the plan's own note ✓ ✓) ✓.

## Decisions

1. **The extraction is the core's** ✓ — the app never reads a clause itself ✓ ✓, so the
   importer's one implementation ✓ (W4.7 ✓) is the one everywhere ✓ ✓.
2. **Every candidate carries its page** ✓ — a clause without a page cannot be checked ✓ ✓
   — and it is a **candidate** ✓, never a rule ✓ ✓.
3. **The decision is recorded in the core's ledger** ✓ — who ✓, when ✓ and why ✓ — so the
   evidence that a rule entered a pack deliberately ✓ lives in one place ✓ ✓ ✓.
4. **A candidate with no decision is visibly unreviewed** ✓ — it never becomes a rule by
   accident ✓ ✓.
5. **The PDF's path is typed, not chosen** ✓ — the **file dialog is the shell's** ✓ (a
   future slice ✓ ✓) ✓ — and in a browser there is no core ✓, and the screen says so ✓ ✓.

## Consequences

- **The user can bring their own copy** ✓ and review it ✓ in the app ✓ ✓.
- **The review is the same record the CLI writes** ✓ ✓.
- **What is not here** ✓: the **file dialog** ✓ (the shell's ✓ ✓), and the **promotion** of
  an accepted candidate into a pack ✓ (a pack is written by hand ✓ ✓).
