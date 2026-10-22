# ADR-0083 — The review ledger has one home, and the decision comes back with the candidate

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W4.7 (the BYO-PDF importer —
the review path) · **Plan:** §5.6 (the law system) · §9 (the quality gates: unverified
content is a candidate) · **Related:** ADR-0056 (the importer), ADR-0076 (the import review
is the core's), ADR-0081 (the importer reads the numbering the books use)
**Code:** `core/src/archres_core/importer.py` (the ledger's home) ·
`core/src/archres_core/bridge.py` (the channel) ·
`app/src/screens/ImportReviewScreen.tsx` (the screen) ·
**Tests:** `core/tests/test_importer.py` (20) · `core/tests/test_bridge_import.py` (6) ·
**Spec:** `docs/spec/byo-pdf-importer-v0.md`

## Context

The app's import path had **two defects**, both found by walking the path the app walks:

1. **The ledger had two homes.** The bridge wrote it **next to the user's PDF**
   (`<pdf>.review.json`) and the CLI wrote it **next to the candidate document**
   (`data/import/<name>.candidates.review.json`) — so a decision made in the app was
   invisible to the CLI, and the other way round. And the bridge's home was in the **user's
   own folder** — a PDF may sit in a read-only folder or on a share, and the app must not
   write into the user's folders.
2. **The decision never came back.** The channel's `import.candidates` returned the
   candidates without their review — so the app showed every candidate as *not reviewed*,
   even the ones the reviewer had just decided on, and a reload lost the decisions
   entirely. The ledger was the evidence, and the screen could not see it.

## Decisions

1. **The ledger has one home** — the app's own **data** folder (`data/import/`) ✓ ✓, named
   for the PDF's **content** (its hash ✓ ✓) ✓ — so the same book keeps its decisions
   wherever it is read from ✓ ✓, two books with the same name do not share one ledger ✓ ✓,
   and the app writes nothing into the user's own folders ✓ ✓.
2. **The CLI and the app read and write that same ledger** ✓ ✓ — the CLI asks the core where
   it is ✓ ✓, so the two cannot drift apart again ✓ ✓ (they had ✓ ✓).
3. **The decision comes back with the candidate** ✓ ✓ — the channel carries each candidate's
   review (or `null` ✓ ✓) ✓ ✓, so the app shows what was decided ✓ ✓ and a reload does not
   lose it ✓ ✓.

## Consequences

- **A decision is evidence again** ✓ — it is in one place ✓ ✓, it is visible in the app ✓ ✓,
  and it survives a reload ✓ ✓ and a restart ✓ ✓.
- **The app writes only into its own folders** ✓ ✓ — a user's PDF folder is read, never
  written ✓ ✓ (the importer reads the PDF ✓ ✓; the ledger goes to the app's data ✓ ✓).
- **What is deliberately not here** — **the candidate document's own home** ✓ (the CLI writes
  it where it is told ✓ ✓), and **the pack's promotion** ✓ (a pack is written by hand, from
  reviewed candidates ✓ ✓ — unchanged ✓ ✓).
