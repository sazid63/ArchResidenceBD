# ADR-0064 — The engine is bundled too: the user installs one thing and the geometry works

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
engine slice) · **Plan:** §5.9 (the runtime stack the installer ships) · §4 (the shell) ·
**Related:** ADR-0061 (the install layout), ADR-0062 (the install manifest), ADR-0063 (the
installer)
**Code:** `core/src/archres_core/install.py` (`engine_home` · `ENGINE_FOLDERS` ·) ·
**Tests:** `core/tests/test_install_manifest.py` · `core/tests/test_install_layout.py` ·
**Spec:** `docs/spec/install-layout-v0.md`

## Context

The owner's promise (2026-10-22): **the user downloads the app, installs it, and everything
is there** — the models ✓ ✓ (ADR-0063 ✓ ✓) and the **CAD engine** ✓ ✓. The engine was the
last piece missing ✓: the installer named it ✓ and nothing copied it ✓ ✓.

And the engine is **LGPL-2.1** ✓ ✓ (the third-party register ✓ ✓) — so the notices are
legal text ✓ (the app's Licences screen ✓ · ADR-0059 ✓ ✓) and the install folder carries
the licence files ✓ ✓.

## Decisions

1. **The engine's home comes from the core's own discovery** ✓ — `find_engine()` ✓ ✓ — the
   CAD engine's rule ✓: explicit ✓, and its failure is loud ✓ ✓. An engine that is not
   there is **named** ✓ (not silently skipped ✓ ✓).
2. **The installer copies the folders the headless engine needs** ✓ — `bin` ✓ (the binary
   and its libraries ✓), `Mod` ✓ (the workbench modules ✓), `lib` ✓ (the Python libraries
   ✓) and `data` ✓ (the resources ✓) ✓ ✓ — and a folder that is missing is named ✓ ✓.
3. **The install is now complete** ✓ — with the engine ✓, the models ✓, the core ✓, the
   packs ✓ and the cards ✓, **nothing is missing** ✓ ✓ — so the commercial promise holds
   ✓: one download ✓, everything inside ✓ ✓.
4. **The tests use stand-ins** ✓ — the real engine is two gigabytes ✓ and the real models
   are six ✓ — so the tests point the installer at small stand-ins ✓ (the same shape ✓ ✓)
   and the copy's **check** still means something ✓ (the stand-in's hash is the manifest's
   ✓ ✓).

## Consequences

- **The install is one thing** ✓ — the app ✓, the core ✓, the engine ✓, the models ✓, the
  law ✓ and the notices ✓ ✓.
- **The engine's licence travels with it** ✓ — the install folder's `licenses/` ✓ ✓, and the
  app's Licences screen shows the notice ✓ ✓.
- **What is not here** ✓: the **installer binary itself** ✓ (the bundle ✓ — the owner's
  item #1 for the WebView2 SDK ✓ ✓), the **corresponding source** for the LGPL engine ✓
  (the owner's ✓ — the licence's own requirement ✓ ✓), and the **signing** ✓ ✗.
