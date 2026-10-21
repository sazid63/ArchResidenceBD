# ADR-0067 — The project bundle: one file, and it is verified before it is trusted

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.5 (the autosave, the
backups and the offline manual — the bundle slice) · **Plan:** §5.1 (the project bundle) ·
§10 (the offline-first law) · **Related:** ADR-0060 (the shell and the bridge)
**Code:** `core/src/archres_core/bundle.py` (the export · the import) ·
`core/src/archres_core/bridge.py` (`bundle.export` · `bundle.read` ·) ·
`app/src/screens/DocumentsScreen.tsx` (the export button ·) · **Tests:**
`core/tests/test_bundle.py` (9) · **Spec:** `docs/spec/project-bundle-v0.md`

## Context

The plan's §5.1 names the project bundle: *"one-file export/import (spec + database +
outputs) for backup, transfer between machines, and the engineer-review handoff"* ✓ — and
the **autosave** was already there ✓ (the spec engine's own revision history ✓: every
writing turn is a revision ✓), so what was missing was the **portable copy** of that
history ✓ and the **outputs** ✓ ✓.

Nothing in the repo could produce one, and nothing in the repo could take one in — so a
user's backup was "copy the folder", and a transfer was "email the folder" ✓.

## Decisions

1. **A bundle is one file** ✓ — the plan's word ✓ — so a backup is something a user can
   email to themselves ✓ and an engineer can hand over ✓ ✓.
2. **A bundle carries the whole store** ✓ — the revisions ✓ and the log ✓ — **not** just
   the tip ✓, so a transfer keeps the **audit trail** ✓ ✓, and the **outputs** ✓ (the
   drawings ✓, the BOQ ✓, the BBS ✓ — whatever the project has ✓) ✓ ✓.
3. **A bundle is verified before it is trusted** ✓ — every file's **hash** ✓ *and* its
   **size** ✓ are checked against the manifest ✓, and a bundle that does not match is
   **refused** ✓ — a corrupt backup is not imported ✓ ✓.
4. **The import is a copy** ✓ — the bundle file stays where it is ✓ — and importing over
   something else is refused unless the caller says so ✓ ✓.
5. **The whole thing is reachable from the app** ✓ — the bridge carries `bundle.export` ✓
   and `bundle.read` ✓, and the Documents screen's **Export** button writes the project's
   bundle ✓ — and in a browser (the prototype ✓) it says plainly that the bundle is the
   core's job ✓ ✓.

## Consequences

- **The backup is a file** ✓ — one file ✓, verified ✓ ✓.
- **A transfer keeps the history** ✓ — the audit trail travels with the project ✓ ✓.
- **A corrupt backup cannot be imported** ✓ — the hash and the size are both checked ✓
  and the refusal names the file ✓ ✓.
- **What is not here** ✓: the **offline manual** ✓ (the documentation slice ✓ — the
  manual is the one thing the app must be able to answer with no network and no model ✓,
  and it is a document ✓ rather than a mechanism ✓), and the **app's file dialogs** ✓
  (the shell's ✓) ✓.
