# The project bundle v0 (W5.5): one file, verified before it is trusted

**Status:** v0.1.0 — a project exports to one file, and a bundle is checked before it is
imported.
**Code:** `core/src/archres_core/bundle.py` · `core/src/archres_core/bridge.py`
(`bundle.export` · `bundle.read` ·) · `app/src/screens/DocumentsScreen.tsx` (the export
button ·) · **Tests:** `core/tests/test_bundle.py` (9) · **Decision record:** ADR-0067 ·
**Plan:** §5.1 (the project bundle), §10 (the offline-first law)

## What it was

The plan's §5.1 names the project bundle: one-file export/import for backup, transfer
between machines, and the engineer-review handoff. The **autosave** was already there (the
spec engine's own revision history: every writing turn is a revision), so what was missing
was the **portable copy** of that history and the **outputs**. Nothing in the repo could
produce one, and nothing could take one in — so a user's backup was "copy the folder".

## What it is now

- **A bundle is one file** — so a backup is something a user can email to themselves, and
  an engineer can hand over.
- **A bundle carries the whole store** — the revisions and the log, not just the tip, so a
  transfer keeps the **audit trail** — and the outputs (the drawings, the BOQ, the BBS).
- **A bundle is verified before it is trusted** — every file's **hash** *and* its **size**
  are checked against the manifest, and a bundle that does not match is **refused**: a
  corrupt backup is not imported.
- **The import is a copy** — the bundle file stays where it is — and importing over
  something else is refused unless the caller says so.
- **The whole thing is reachable from the app** — the bridge carries `bundle.export` and
  `bundle.read`, and the Documents screen's **Export** button writes the project's bundle;
  in a browser (the prototype) it says plainly that the bundle is the core's job.

## The measured output (2026-10-22)

- A project with **two revisions** exports to **one file** ✓ — and the manifest names the
  project ✓, its **spec hash** ✓, the **revision count** ✓ and **every file with its size
  and hash** ✓ ✓.
- The bundle holds the **revisions** ✓, the **log** ✓ and the **outputs** ✓ ✓ — the whole
  history, not just the tip ✓ ✓.
- A bundle can be **read without importing it** ✓ — the app shows what a bundle holds ✓
  before the user commits to it ✓ ✓.
- The round trip: the imported store has the **same two revisions** ✓ and the **same tip
  hash** ✓ ✓.
- A **corrupt** bundle is **refused** ✓ — the hash catches a same-size change ✓, the size
  check catches a longer one ✓ — and **nothing is written** ✓ ✓.
- A file that is **not an archive** is refused ✓, and a bundle with **no manifest** is
  refused ✓ ✓.
- Importing over **something else** is refused ✓ unless the caller says so ✓ ✓.
- Exporting a project that is **not there** is refused ✓ ✓.

Through the channel the app uses:

```
the export: {"version": "0.1.0", "createdAt": "...", "projectName": "Mirpur Duplex (internal test)",
 "specSha256": "5fa23381...", "revisionCount": 1, "files": [...]}
the file: True 2868 bytes
the read: Mirpur Duplex (internal test) | 1 revision(s)
a missing project: {'code': 'internal', 'message': 'there is no project at ...'}
```

## What is deliberately not here

- **The offline manual** — the documentation slice. The manual is the one thing the app
  must be able to answer with no network and no model, and it is a document rather than a
  mechanism.
- **The app's file dialogs** — the shell's.

## Checks

```powershell
uv run --directory core pytest -q tests/test_bundle.py
```
