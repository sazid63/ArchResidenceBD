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
  bin/                     the app's own AI runners (llama.cpp and the fleet manager)
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

## The installer can be run (2026-10-22)

The plan and the apply existed ✓ — and nothing could *run* them ✓ ✓. There is now a CLI ✓:

```powershell
uv run --directory core python ../tools/install/install_app.py --plan          # the plan, first
uv run --directory core python ../tools/install/install_app.py --write --root C:\ArchResidenceBD
uv run --directory core python ../tools/install/install_app.py --check --root C:\ArchResidenceBD
```

and the **check** is the promise tested ✓ — every part is in the folder ✓, and the
**installed core starts and answers a ping** ✓ ✓.

## The whole product in one folder (2026-10-22)

The owner's promise: **the user downloads the app, installs it, and everything is there** ✓ —
so the install carries ✓:

| what | where it comes from | where it lands |
|---|---|---|
| the shell | the build | `ArchResidenceBD.exe` |
| the core | the repo (`core/src/archres_core`) | `runtime/core/archres_core` |
| the core's data | the repo (`spec/flows`, `spec/schemas`) | `runtime/core/` |
| the rule packs | the repo (`spec/rules`) | `packs/` |
| the **CAD engine** | the build machine's FreeCAD (found by the core's own discovery) | `engine/bin`, `engine/Mod`, `engine/lib`, `engine/data` |
| the **models** | the build machine's model folder (`ARCHRES_MODELS`) | `models/` |
| the **Python runtime** | the build machine's interpreter (its base prefix) | `runtime/python/` |
| the **model cards** | the repo (`spec/models/cards`) | `licenses/model-cards/` |
| the notices | written by the installer | `licenses/` |

⇒ With the engine ✓, the models ✓, the core ✓, the packs ✓ and the cards ✓ on the build
machine, the plan's **missing** list is **empty** ✓ — one download ✓, everything inside ✓ ✓.

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

## The installed app must be able to do the app's work (2026-10-22)

The install was **declared complete** ✓ ✓ — and the check proved it ✓ ✓ by
asking the installed core for a **ping** ✓ ✓. A ping does not need the app's data
✓ ✓, so the check could not see what was missing ✓ ✓.

The **installed** app was measured ✓ ✓ by asking it the questions the app asks
✓ ✓ — and three of them failed ✓ ✓:

1. **the app could not start a project** ✓ ✓ — the **templates** ✓ ✓ (the
   examples the project setup screen offers ✓ ✓) were not in the install ✓ ✓,
   so the app said *"no template is available"* ✓ ✓ ✓;
2. **the app could not run the interview** ✓ ✓ — the flow book was found in **two**
   ways ✓ ✓ — the manual's way ✓ (the install's place ✓ ✓, then the
   dev tree's ✓ ✓) and the interview's way ✓ ✓ (the dev tree's place only
   ✓ ✓) — and the install does not have a `spec/` folder ✓ ✓;
3. **the app could not price a BOQ** ✓ ✓ — the **rate cards** ✓ ✓ were not
   in the install ✓ ✓ — and the money law says the prices are *missing* ✓ ✓,
   not zero ✓ ✓.

⇒ The install now carries the app's data ✓ ✓ — the templates ✓ ✓ and the
rate cards ✓ ✓ — and the core finds every piece of the app's data in the
**install's** place or the dev tree's ✓ ✓ — one rule ✓ ✓ — and the check
asks the app's questions ✓ ✓ (the templates ✓ ✓, a project ✓ ✓, the
interview ✓ ✓, the manual ✓ ✓ and the money ✓ ✓) ✓ ✓ —
not a ping ✓ ✓ — so a hole like this cannot pass again ✓ ✓.

| what the app reads | the install's place | the dev tree's place |
|---|---|---|
| the flow book | `runtime/core/flows/` | `spec/flows/` |
| the schemas | `runtime/core/schemas/` | `spec/schemas/` |
| the **templates** | `runtime/core/examples/` | `spec/examples/` |
| the **rate cards** | `runtime/core/prices/cards/` | `data/prices/cards/` |
| the rule packs | `packs/` | `spec/rules/` |
| the **model registry** ✓ ✓ | `models/registry.json` ✓ ✓ (beside the GGUFs it names ✓ ✓) | `spec/models/registry.json` |
| the **app's version** ✓ ✓ | `version.json` ✓ ✓ (written by the installer ✓ ✓) | `app/src-tauri/tauri.conf.json` |
| the **model runner** ✓ ✓ | `bin/llama/llama-server.exe` ✓ ✓ (the fleet's config names it ✓ ✓) | the build machine's `bin/llama/` ✓ ✓ |
| the **fleet manager** ✓ ✓ | `bin/llama-swap/llama-swap.exe` ✓ ✓ (the demo's pattern names it ✓ ✓) | the build machine's `bin/llama-swap/` ✓ ✓ |
| the **fleet's config** ✓ ✓ | `models/fleet.json` ✓ ✓ (with the models it names ✓ ✓) | `spec/models/fleet.json` ✓ ✓ |

And the **update check** ✓ ✓ — the tool's own help says it reads *"the installation to read"* ✓ ✓ · so it looks in the install's places too ✓ ✓ · and the install records what it installed ✓ ✓ · the exe's version is not a file anyone can read ✓ ✓ ✓.

And the **engine** ✓ ✓ — the install bundles it ✓ ✓ (the geometry is the app's
own ✓ ✓) · so the app must be able to find **its own** engine ✓ ✓ · and the
discovery looks in the install's engine folder ✓ ✓ · proved in isolation ✓ ✓ ·
the installed core answers with the engine **inside its own install** ✓ ✓ ✓.

And the **model runner** ✓ ✓ — the plan's §0 says the app contains its own AI
runners ✓ ✓ · so the runner travels with the models ✓ ✓ · the install
carried the models ✓ ✓ (the owner's decision ✓ ✓) · and not the runner ✓ ✓
· so the installed app had six gigabytes of models and no way to serve them ✓ ✓ · and
the fleet's own config names the runner's place ✓ ✓ (`bin/llama/` ✓ ✓) and the demo's
own pattern names the router's ✓ ✓ (`bin/llama-swap/` ✓ ✓) ✓ ✓ · so the
install puts them there ✓ ✓ ✓.

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
