# The installer v0 (W5.1): plan, then apply

**Status:** v0.1.0 — the installer lays the install folder down from a plan, and names what
it does not have.
**Code:** `core/src/archres_core/install.py` (`install_plan` · `apply_plan` ·
`LICENCE_FILES`) · `tools/ci/licence_notice_guard.py` (the guard) · **Tests:**
`core/tests/test_install_manifest.py` (13) · **Decision record:** ADR-0063 · **Plan:** §5.9
(the runtime stack the installer ships)

## What it is

The manifest declared the install; the layout fixed the shape. What was missing was the
**act**: something that takes a machine and makes the folder the product promises.

## What it does

- **Plan, then apply** — the plan is a document (the folders, the copies, the notices, the
  missing pieces) and it is inspectable *before anything is written*. A plan you cannot
  read is not a plan.
- **It never downloads** — that is the downloader's job (W5.2: resumable, checksummed) — and
  it never **invents**: a piece this machine does not have is named in the plan, not
  skipped. An installer that quietly skips a piece ships a broken product.
- **The licence files travel with the install** — the folder's `licenses/` carries the files
  the app's Licences screen points at — and one guard holds the two lists together, so the
  install folder and the screen cannot drift apart.
- **The copies are the pieces this machine has** — the core package and the rule packs — and
  the apply step is deterministic: the same plan, the same bytes.

## The measured output (2026-10-21)

The plan, on this machine:

- the folders: `runtime` ·, `engine` ·, `models` ·, `packs` ·, `licenses` ·, `projects` ·;
- the copies: the **core package** · and the **rule packs** ·;
- the notices: the five licence files the app points at ·;
- **missing**: the engine ·, the runtime ·, and the four models · — named ✓, not skipped ✓.

And the apply, on a fresh folder:

- every folder exists ✓;
- the core's modules are in place (`importer.py` ✓, `bridge.py` ✓);
- the rule packs are in place (`rajuk-2008.yaml` ✓);
- the notices are written, each naming its component ✓;
- the pieces that were missing are **still missing** ✓ — the installer did not fetch and did
  not invent ✓ ✓.

## What is deliberately not here

- **The downloader** — the engine, the runtime and the models are fetched by W5.2 (resumable,
  checksummed), and the plan names them until then ✓.
- **The shell's own bytes** — the installer ships the built shell; the build needs the
  WebView2 SDK (the owner's item #1) ✓.
- **The install folder's full licence texts** — the owner's or the installer's to place ✓
  (the notices and the file names are ours ✓).

## Checks

```powershell
uv run --directory core pytest -q tests/test_install_manifest.py
python tools/ci/licence_notice_guard.py
```
