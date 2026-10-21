# The downloads v0 (W5.2): the core pack first, resumable, checked

**Status:** v0.1.0 — the install's pieces are fetched, a dropped connection resumes, and a
piece is installed only when it is the one that was promised.
**Code:** `core/src/archres_core/downloads.py` · `tools/install/download_pieces.py` (the CLI) ·
**Tests:** `core/tests/test_downloads.py` (8) · **Decision record:** ADR-0064 · **Plan:** §5.9
(the runtime stack), §5.10 (the source registry)

## What it is

The installer's plan **names** the pieces this machine does not have. The plan's §5.10 law
says a fetched thing carries its provenance, and the repo's own law says a fetched number is
a **candidate** until someone verifies it. Those are the same law applied to bytes: a piece
that arrives is either the piece that was promised, or it is not installed.

## What it does

- **The core pack first** — the engine, the runtime, the packs and the core, and the models
  after: the app is useful before the models arrive.
- **Resumable** — a dropped connection is normal, not a failure to retry from zero. The
  partial file is kept and the fetch asks for the rest.
- **Checked before the install** — the hash is known before the fetch, so the bytes are
  written to a `.part` file and moved into place only when the hash matches. A
  half-downloaded model is never mistaken for an installed one.
- **A piece with no promised hash is not verified** — nobody measured it, so the download
  says so rather than claiming a fact it does not have.
- **The bytes are kept when the hash is wrong** — the `.part` file stays, because the next
  attempt resumes from it, and because a wrong hash is evidence, not waste.
- **Only http/https, and only when asked** — the sources module's rule.
- **The download leaves a record** — the plan, what was fetched, what was verified and what
  was not.

## The measured output (2026-10-22)

Against a **local** server (the tests and the probe never touch the network):

- the plan puts the **engine** and the **runtime** before the **models** ✓;
- a piece with no URL is not in the plan ✓;
- a `file://` URL is refused ✓;
- a piece that matches the promised hash is **installed** ✓ — the `.part` file is gone ✓
  and the hash checks out ✓;
- a piece that does **not** match is **not installed** ✓ — the reason names both hashes ✓,
  the `.part` file is kept ✓, and the exit code is 1 ✓;
- a piece with **no promised hash** is not verified ✓ — the reason says so ✓;
- a **resumed** fetch keeps the earlier bytes ✓ and asks the server for the rest ✓.

The CLI, end to end:

```
--- the dry run (the plan):
the plan: 1 piece(s), in this order:
   model-chat       models/archie-chat-v0-Q4_K_M.gguf                    http://127.0.0.1:39111/chat.gguf

--- the fetch (the hash the manifest promises is not this one):
  model-chat: NOT verified - the hash is f6ca972e..., the manifest promises bea406a8...
the exit code: 1
the record's counts: {'fetched': 1, 'planned': 1, 'unverified': 1, 'verified': 0}
the piece was installed: False
```

## What is deliberately not here

- **The URLs** — the owner publishes them, and the source registry is where they live.
- **The tier detection** (W5.3) and the **updates** (W5.4).

## Checks

```powershell
uv run --directory core pytest -q tests/test_downloads.py
uv run --directory core python ../tools/install/download_pieces.py --plan plan.json --dry-run
```
