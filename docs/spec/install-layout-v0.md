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
    core/                  the core package (archres_core)
  engine/                  the bundled CAD engine (FreeCAD, LGPL-2.1 - the notices are legal text)
  models/                  the model pack (the GGUFs the fleet serves)
  packs/                   the rule packs (the law the app applies)
  licenses/                the licence files the install folder must carry
  projects/                the user's projects (their data, their backup)
```

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

## What is deliberately not here

- **The installer itself** — the thing that downloads and lays the layout down ✓, and the
  licence files' full texts ✓ (not ours to write from memory ✓). That is the rest of W5.1,
  and W5.2 is the installer's download slice ✓.
- **The update path** (W5.4 ✓) and the **tiers** (W5.3 ✓).

## Checks

```powershell
uv run --directory core python ../tools/ci/rust_gate.py
python tools/ci/licence_notice_guard.py
python tools/ci/brand_guard.py
```
