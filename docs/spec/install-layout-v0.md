# The install layout v0 (W5.1): what the user gets, and what they never meet

**Status:** v0.1.0 — the layout is declared, the shell finds its own runtime, and the
commercial law is written down.
**Code:** `app/src-tauri/src/lib.rs` (the runtime discovery ✓) ·
`app/src-tauri/crates/bridge/src/lib.rs` (the core's path ✓) · **Decision record:** ADR-0061
· **Plan:** §4 (the shell), §5.9 (the runtime stack), §10 (offline-first)

## The law

This is a **commercial** product: a person installs it and gets a working building designer.
So:

> **The user downloads one thing, and nothing about it asks them to be a systems engineer.**

They must not have to install Python, Docker, a Linux toolchain, a CUDA driver or a Git
client — and must not have to know that any of those exist.

## The layout

```
<install root>/
  ArchResidenceBD.exe     the shell (Tauri) - the one thing the user clicks
  runtime/
    python.exe             the bundled Python: the core's runtime, not the user's business
    core/
      archres_core/        the core package - the name matters, or the import fails
      flows/               the flow book (the questions the app asks)
      schemas/             the schemas the app reads at runtime
  engine/                  the bundled CAD engine (FreeCAD, LGPL-2.1 - the notices are legal text)
  models/                  the model pack (the GGUFs the fleet serves)
  packs/                   the rule packs (the law the app applies)
  licenses/                the licence files the install folder must carry
  projects/                the user's projects (their data, their backup)
```

(The core's **package** keeps its name ✓ — a copy that loses it is a copy that breaks the
app ✓ — and the core's **data** travels with it ✓, because the app reads the flow book and
the schemas at runtime ✓ ✓.)

## What it settles

- **The shell finds its own runtime** — the bundled Python at `runtime/python.exe` ✓, with
  `ARCHRES_PYTHON` as the dev override ✓; nothing asks the user to put Python on their PATH
  ✓.
- **The core is found the same way** — the install folder's `runtime/core` ✓, and the dev
  tree's `core/src` ✓ — so the same bridge works in both ✓.
- **The licences travel with the install** — the `licenses/` folder ✓ — and the app's
  Licences screen shows the notices ✓ (ADR-0004 ✓).
- **The user's data is theirs** — the `projects/` folder ✓, and a backup is the project
  bundle ✓ (the plan's one-file export ✓).
- **The tiers are measured, never assumed** (W5.3 ✓) — and the shell does not claim a tier
  it cannot verify ✓ (the CAD engine's own rule ✓).

## The measured output (2026-10-21)

- The shell's runtime discovery is written ✓ and the Rust gate compiles it ✓ (`cargo check`
  on the app crate ✓ in CI ✓, where the WebView2 SDK is not needed ✓).
- The bridge's core discovery takes the install folder's `runtime/core` ✓ and falls back to
  the dev tree's `core/src` ✓ ✓.
- The **Rust gate runs on this machine** ✓ — no MSVC toolchain ✗, no gcc ✗ — because Rust
  ships its own GNU toolchain ✓, its own `rust-lld` ✓ and its own self-contained MinGW ✓:
  `uv run --directory core python ../tools/ci/rust_gate.py` ✓ (5 tests ✓ + the formatting ✓) ✓.

## The two bugs the installed folder found (2026-10-22)

The layout was declared and the installer was written, and **nothing asked the question the
commercial path depends on**: *can the installed folder actually run the app?* The answer was
**no** ✓ ✓:

1. **the installer copied the core's files, not the package** ✓ — so the installed folder
   held `bridge.py` and `importer.py` loose in `runtime/core` ✓, and the core was **not
   importable as `archres_core`** ✓ — the shell's sidecar could never have started ✓ ✓;
2. **the bridge looked for the flow book and the packs in `spec/`** ✓ — a folder the
   **install does not have** ✓ ✓.

And the bug was **invisible on the dev machine** ✓ — the venv has the core installed ✓, so
every import worked ✓ whatever the layout said ✓ ✓. It only showed where the layout was
really used ✓ ✓.

The proof is an **isolation** ✓: the test runs the installed core with the venv's *hooks*
out ✓ (the editable install's `.pth` ✓ — which is how the venv's copy sneaks in ✓) ✓ while
the site's *packages* stay ✓ (the core's dependencies live there ✓ ✓) ✓ — so the import that
passes is **the install's own** ✓ ✓.

## What is deliberately not here

- **The installer itself** — the thing that downloads and lays the layout down ✓, and the
  licence files' full texts ✓ (not ours to write from memory ✓). That is the rest of W5.1,
  and W5.2 is the installer's download slice ✓.
- **The update path** (W5.4 ✓) and the **tiers** (W5.3 ✓).

## Checks

```powershell
uv run --directory core pytest -q tests/test_install_layout.py
uv run --directory core python ../tools/ci/rust_gate.py
python tools/ci/licence_notice_guard.py
python tools/ci/brand_guard.py
```
