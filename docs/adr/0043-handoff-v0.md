# ADR-0043 — The handoff is hashed, deterministic, and assembled from the measured documents

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.7
**Code:** `core/src/archres_core/documents/pack.py` · `tools/documents/render_pack.py` ·
`core/tests/test_documents_pack.py`
**Spec:** `docs/spec/handoff-v0.md`
**Depends on:** W3.3, W3.4, W3.5, W3.6 · plan §6, §9

## Context

The plan's closing deliverables: the "**Engineer pack**" (the Documents screen's "Spec, drawings,
BBS, BOQ, deviations — one handoff pack" ✓) and the "**Project bundle**: one-file export/import
(spec + database + outputs) for backup, transfer between machines, and the engineer-review
handoff" (§6 ✓).

By now the documents exist ✓ — the drawing set ✓ (W3.3 ✓), the bar schedule ✓ (W3.4 ✓), the BOQ ✓
(W3.5 ✓) and the compliance report with the register ✓ (W3.6 ✓) — so what was missing was the
**file that carries them** ✓.

Three things were undecided: whether the pack re-renders its documents ✓, what a bundle that
arrived **changed** should do ✓, and whether the pack can be **checked** in CI ✓.

## Decisions

1. **The pack carries what was measured, not a re-render.** The parts are the **committed
   documents** ✓ — the ones the probes measured ✓ — so the handoff cannot contain a number the
   repository does not have ✓. A pack that re-rendered its drawings would need the engine ✓ and
   could differ from the committed set ✓ — the handoff would then be a *second* statement of the
   model ✓ rather than a copy of the first ✓.
2. **Every part is hashed, and a changed part is refused.** The manifest records each part's
   sha256 ✓ and the import **checks** them ✓: a bundle whose part no longer matches its hash is
   **refused** ✓, not imported ✓. A handoff that arrived changed has to say so ✓ — plan §9's law,
   applied to the file that leaves the building ✓ — and importing it silently would put a
   document nobody wrote into the project ✓.
3. **The archive is deterministic** (a fixed timestamp on every entry ✓), so the same documents
   give **byte-identical** packs ✓ and the CI check is a byte comparison ✓ — plan §9's "identical
   outputs" ✓, applied to the handoff ✓.
4. **The bundle carries the spec, not the database.** The plan says "spec + database + outputs" ✓;
   the **spec** is the source of truth ✓ and the revision store's history is the *app's* database ✓
   (P5 ✓). A bundle that carried a database it could not verify would be worse than one that
   carries the spec it can ✓ — and the spec carries the deviations ✓, which is what the register
   needs ✓.
5. **The README says everything in the pack is a candidate.** The drawings ✓, the BBS ✓ and the
   BOQ all carry the "candidate - not for construction" status ✓, and the price list is a
   candidate card until a human activates it ✓ — a handoff that read like a final issue would be
   a false claim ✓.
6. **The round trip is the proof.** The tool writes the bundle and then **imports it back** ✓ —
   the spec ✓, the deviations ✓, the outputs ✓ — with every part checked against its hash ✓.

## Consequences

- The handoff exists ✓: an **engineer review pack** (17 parts ✓ — the spec ✓,
  the drawings ✓, the BBS ✓, the BOQ ✓, the compliance audit and the register ✓) and a
  **project bundle** that imports back ✓.
- A tampered pack is caught ✓ (a test flips a byte ✓ and the import refuses it ✓) ✓.
- The CI check is a byte comparison ✓ ✓ — fast ✓, no engine ✓, no network ✓.
- What is still missing is named ✓: the revision database ✓ (the app's ✓, P5 ✓), the Bangla PDFs ✓
  (the browser's print ✓) and a signed pack ✓.
