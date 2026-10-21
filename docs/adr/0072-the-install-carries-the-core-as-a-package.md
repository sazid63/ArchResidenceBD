# ADR-0072 — The install carries the core as a package, and the bridge looks where the data is

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
layout fix) · **Plan:** §4 (the shell) · **Related:** ADR-0061 (the install layout), ADR-0060
(the shell and the bridge)
**Code:** `core/src/archres_core/install.py` (the layout · the plan · the apply ·) ·
`core/src/archres_core/bridge.py` (the data lookups ·) · **Tests:**
`core/tests/test_install_layout.py` (4) · **Spec:** `docs/spec/install-layout-v0.md`

## Context

The layout was declared (ADR-0061 ✓) and the installer was written ✓ — and **nothing asked
the question the commercial path depends on**: *can the installed folder actually run the
app?* ✓ ✓.

The answer was **no** ✓, and two bugs were behind it ✓ ✓:

1. **the installer copied the core's files, not the package** ✓ — so the installed folder
   held `bridge.py` and `importer.py` **loose** in `runtime/core` ✓, and the core was **not
   importable as `archres_core`** ✓ — so the shell's sidecar could never have started ✓ ✓;
2. **the bridge looked for the flow book and the packs in `spec/`** ✓ — a folder the
   **install does not have** ✓ ✓.

And the bug was **invisible on the dev machine** ✓ — the venv has the core installed ✓, so
every import worked ✓ regardless of the layout ✓ ✓. It only showed where the layout was
really used ✓ — the installed folder ✓ ✓.

## Decisions

1. **The install carries the core as a package** ✓ — `runtime/core/archres_core/` ✓ — so the
   import name is the package's name ✓, and a copy that loses it is a copy that breaks the
   app ✓ ✓.
2. **The install carries the core's data** ✓ — the **flow book** ✓ and the **schemas** ✓,
   under `runtime/core/` ✓ — because the app reads them at runtime ✓ and the install is the
   app ✓ ✓.
3. **The bridge looks in the install's places and the dev tree's** ✓ — explicitly ✓, and
   **loudly** when neither has the file ✓ (the CAD engine's rule ✓: discovery is explicit ✓
   and its failure is loud ✓ ✓).
4. **The proof is an isolation** ✓ — the test runs the installed core with the venv's
   *hooks* out ✓ (the editable install's `.pth` ✓ — which is how the venv's copy sneaks in
   ✓) ✓ while the site's *packages* stay ✓ (the core's dependencies live there ✓ ✓) ✓ — so
   the import that passes is **the install's own** ✓ ✓.

## Consequences

- **The installed folder starts the core and answers** ✓ — proven ✓, not assumed ✓ ✓.
- **The layout and the code that reads it agree** ✓ — and a test holds them together ✓ ✓.
- **The bug class is named** ✓ — a declared layout and an unconnected reader ✓ — and the
  proof that catches it is *the installed folder, running* ✓ ✓.
