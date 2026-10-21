# ADR-0064 — The downloader: the core pack first, resumable, and checked before it is installed

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.2 (the progressive
downloads) · **Plan:** §5.9 (the runtime stack) · §5.10 (the source registry) · **Related:**
ADR-0062 (the manifest), ADR-0063 (the installer), ADR-0003 (the rule packs)
**Code:** `core/src/archres_core/downloads.py` (the plan · the fetch · the verify) ·
`tools/install/download_pieces.py` (the CLI) · **Tests:** `core/tests/test_downloads.py` (8) ·
**Spec:** `docs/spec/downloads-v0.md`

## Context

The installer's plan **names** the pieces this machine does not have ✓ — the CAD engine ✓,
the Python runtime ✓ and the four models ✓ — and the plan's §5.10 law says a fetched thing
carries its provenance ✓, and the repo's own law says a fetched number is a **candidate**
until someone verifies it ✓ ✓.

Those two laws are the same law, applied to bytes: a piece that arrives is either the piece
that was promised ✓ or it is not installed ✓ ✓.

## Decisions

1. **The core pack first** ✓ — the engine ✓, the runtime ✓, the packs ✓, the core ✓, and
   the models after ✓ ✓: the app is **useful before the models arrive** ✓ (it draws and
   designs ✓; it advises when the models are there ✓) ✓ ✓.
2. **Resumable** ✓ — a dropped connection is **normal** ✓, not a failure to retry from zero
   ✓ — the partial file is kept ✓ and the fetch asks for the **rest** ✓ (a Range request ✓)
   ✓ ✓.
3. **Checksummed, and checked before the install** ✓ — the hash is known **before** the
   fetch ✓ (the manifest's ✓) — so the bytes are written to a **partial** file ✓ and moved
   into place **only** when the hash matches ✓ ✓. A half-downloaded model is never mistaken
   for an installed one ✓ ✓.
4. **A piece with no promised hash is not verified** ✓ — nobody measured it ✓, so the
   download says so ✓ rather than claiming a fact it does not have ✓ (the repo's law ✓) ✓.
5. **The bytes are kept when the hash is wrong** ✓ — the `.part` file stays ✓ — because the
   next attempt resumes from it ✓ ✓, and because a wrong hash is *evidence* ✓, not waste ✓.
6. **Only http/https, and only when asked** ✓ — the sources module's rule ✓ ✓.
7. **The download leaves a record** ✓ — the plan ✓, what was fetched ✓, what was verified ✓
   and what was not ✓ ✓.

## Consequences

- **The install is completable** ✓ — the pieces the plan names ✓ can now be fetched ✓,
  resumed ✓ and checked ✓ ✓.
- **A wrong piece never reaches the install folder** ✓ — it is refused ✓, named ✓, and the
  exit code says so ✓ ✓.
- **The provenance is kept** ✓ — the download's record is the fetch's provenance ✓ (the
  sources module's law ✓ ✓).
- **What is not here** ✓: the **URLs** ✓ (the owner publishes them ✓ — the source registry
  is the place ✓ ✓), the **tier detection** ✓ (W5.3 ✓), and the **updates** ✓ (W5.4 ✓).
