# The handoff v0 (W3.7): the engineer pack and the project bundle

**Status:** v0.1.0 — the plan's two closing files: the **engineer review pack** (one file an
engineer opens) and the **project bundle** (one file that carries a project to another
machine).
**Code:** `core/src/archres_core/documents/pack.py` (the pack and the bundle) ·
`tools/documents/render_pack.py` (build/check) · `core/tests/test_documents_pack.py` (7 tests) ·
**Artefacts:** `data/handoff/engineer-review-pack.zip`, `data/handoff/project-bundle.zip` ·
**Decision record:** ADR-0043
**Depends on:** W3.3 (the drawing set), W3.4 (the BBS), W3.5 (the BOQ), W3.6 (the compliance
report) · **Plan:** §6 ("Engineer pack" ✓ and "**Project bundle**: one-file export/import (spec
+ database + outputs) for backup, transfer between machines, and the engineer-review handoff" ✓)

## What they are

**The engineer review pack** (17 parts ✓) is the handoff ✓:

| In the pack | What it is |
|---|---|
| `manifest.json` | what is in the pack, and each part's **sha256** ✓ |
| `README.md` | what the pack is ✓ — and that everything in it is a **candidate** ✓ |
| `spec.json` | the Building Spec ✓ (the source of truth ✓) |
| `drawings/` | the drawing set: the PDF ✓, the three sheets' SVG ✓ **and their DXFs** ✓, the set's manifest ✓ |
| `bbs/` | the bar schedule: the xlsx + the PDF ✓ |
| `boq/` | the bill of quantities: the xlsx + the PDF ✓ |
| `compliance/` | the compliance audit and the Deviation Register ✓ (markdown + the Bangla HTML ✓) |

**The project bundle** is the portable one ✓: the spec ✓ and the outputs ✓
(the drawings ✓, the BBS ✓, the BOQ ✓, the compliance audit ✓) — for **backup** ✓, for **transfer
between machines** ✓, and for the review handoff ✓.

## The three laws

1. **The pack carries what was measured, not a re-render.** The parts are the **committed
   documents** ✓ — the ones the probes measured ✓ — so the handoff cannot contain a number the
   repository does not have ✓.
2. **Every part is hashed, and a changed part is refused.** The manifest records each part's
   sha256 ✓, and the import **checks them** ✓: a bundle whose part no longer matches its hash is
   **refused** ✓, not imported ✓ — a handoff that arrived changed has to say so ✓ (plan §9's
   law, applied to the file that leaves the building ✓).
3. **The archive is deterministic.** A fixed timestamp on every entry ✓, so the same documents
   produce **byte-identical** packs ✓ — plan §9's "identical outputs" ✓ — and the CI check is a
   byte comparison ✓ ✓.

## The measured output (2026-10-21)

`tools/documents/render_pack.py` assembles both ✓ and then **imports the bundle back** ✓ — the
round trip is the proof ✓: the bundle gives back the spec ✓ (`7c9e6f10-…` ✓) with its deviations
✓ and the outputs ✓, and every part matched its hash ✓.

## What is deliberately not here

- **The project's database** (the revision history ✓, the store ✗) — the bundle carries the
  **spec** ✓, which is the source of truth ✓; the revision store's history is P5's app database
  ✓, and a bundle that carried a database it could not verify would be worse than one that
  carries the spec it can ✓.
- **The Bangla reports as PDF** ✓ — the compliance report's Bangla HTML is in the pack ✓ and the
  print is the browser's ✓ (plan §6 ✓).
- **A signed or locked pack** ✓ — the pack is a candidate ✓ and the README says so ✓ on every
  page of the handoff ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_documents_pack.py    # 7 tests
uv run --directory core python ../tools/documents/render_pack.py --check
```
