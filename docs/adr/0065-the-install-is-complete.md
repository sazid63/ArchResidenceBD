# ADR-0065 — The install is complete: the engine, the models, the Python and the core, and the copy is recursive

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
runtime slice) · **Plan:** §4 (the shell) · §5.9 (the runtime stack the installer ships) ·
**Related:** ADR-0061 (the install layout), ADR-0063 (the bundled model), ADR-0064 (the
bundled engine)
**Code:** `core/src/archres_core/install.py` (`python_home` · `_site_packages` ·
`_copy_tree` ·) · `tools/install/install_app.py` (the CLI ·) ·
`app/src-tauri/src/lib.rs` (the runtime lookup ·) · **Tests:**
`core/tests/test_install_layout.py` (9) · `core/tests/test_install_manifest.py` ·
**Spec:** `docs/spec/install-layout-v0.md`

## Context

The owner's promise (2026-10-22): **the user downloads the app, installs it, and everything
is there** ✓ — and the install had three holes left ✓ ✓:

1. **the copy stopped one level down** ✓ — so the engine's `Mod` ✓ and `lib` ✓ (which have
   folders inside them ✓) would have arrived **incomplete** ✓ — an install with a *broken*
   engine ✓ ✓ ✓;
2. **the Python was not bundled** ✓ — so the user would have had to install Python ✓ (or
   Docker ✓, or learn what Linux is ✓) ✗ ✗ ✗;
3. **the installer had no entry point** ✓ — the plan and the apply existed ✓, and nothing
   could *run* them ✓ ✓.

## Decisions

1. **The copy is recursive** ✓ — the engine's folders have folders inside them ✓, and a
   copy that stopped one level down would leave the install with a broken engine ✓ ✓ ✓.
2. **The Python travels with the app** ✓ — the build machine's **base prefix** ✓ (a venv
   holds absolute paths ✓ and is not relocatable ✓ ✓) — and the core's **dependencies**
   travel with it ✓ ✓ ✓.
3. **The installer has a CLI** ✓ — `--plan` ✓ (the plan, printed before anything is
   written ✓ ✓), `--write` ✓ (lay it down ✓), `--check` ✓ (every part is in the folder ✓ and
   the **installed core starts and answers** ✓ ✓) ✓ ✓.
4. **The shell looks for the runtime** ✓ — `runtime/python/python.exe` ✓ ✓ — so the app
   never needs a Python on the PATH ✓ ✓.

## Consequences

- **The install is complete** ✓ — the core ✓, the core's data ✓, the engine ✓, the models ✓,
  the Python ✓, the packs ✓, the notices ✓ — **nothing missing** ✓ ✓ ✓.
- **The user meets one download** ✓ — and nothing to install but the app ✓ ✓ ✓.
- **The check proves it** ✓ — the installed core is imported in isolation ✓ and answers a
  ping ✓ ✓ ✓.
