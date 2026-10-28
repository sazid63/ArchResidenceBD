# The install manifest v0 (W5.1): what the installer lays down, declared

**Status:** v0.1.0 — the install is one declared manifest, and an unmeasured hash is absent
rather than faked.
**Code:** `core/src/archres_core/install.py` · **Tests:** `core/tests/test_install_manifest.py`
(9) · **Decision record:** ADR-0062 · **Plan:** §5.9 (the runtime stack), §5.10 (the source
registry)

## What it is

ADR-0061 fixed the install **layout** — one folder, and the user installs one thing. A
layout is half a promise: the installer has to know **what** it lays down, **which licence**
each piece carries, **which machine tier** it belongs to, and **whether the bytes it fetched
are the bytes it expected**.

The repo already holds most of that — the registry pins each model's hash and size, the
third-party register holds the licences — but scattered, and the plan's §5.10 law (a curated,
versioned list of trusted sources, with every fetched value carrying its provenance) was
never written as one declaration.

## What it says

- **The install is declared** — one manifest, every piece with its role, its licence, its
  tier, its path and its hash — so the installer, the shell and the core read the same
  declaration.
- **An unmeasured hash is absent, not a fake** — a piece nobody has measured has no hash
  and no size, and the manifest counts those separately. The installer measures the piece
  when it fetches it.
- **Every bundled piece carries its licence** — a piece without one is refused — and the
  notices travel with the install.
- **The model pack's hashes are the registry's** — the measured ones — with each base
  model's upstream licence.
- **The tiers are named** — `cpu`, `cuda`, `vulkan` — and an unknown tier is refused.
- **The ids are unique.**

## The measured output (2026-10-21)

The manifest the product declares today — **10 parts**, **4 measured** and **6 not**:

```
   shell            cpu                   proprietary      ArchResidenceBD.exe
   runtime          cpu                   PSF-2.0          runtime/python.exe
   core             cpu                   proprietary      runtime/core
   engine           cpu                   LGPL-2.1         engine
   licenses         cpu                   mixed            licenses
   packs            cpu                   proprietary      packs
   model-chat       cpu    bea406a8bafb   Apache-2.0       models/archie-chat-v0-Q4_K_M.gguf
   model-repair     cpu    724fb256bec1   Apache-2.0       models/qwen2.5-coder-3b-instruct-q4_k_m.gguf
   model-embed      cpu    06507c7b4268   Apache-2.0       models/Qwen3-Embedding-0.6B-Q8_0.gguf
   model-rerank     cpu    48c062151f5a   Apache-2.0       models/Qwen3-Reranker-0.6B.Q8_0.gguf
```

(The six unmeasured pieces are the ones nobody has fetched and hashed yet: the shell, the
runtime, the core, the engine, the notices and the packs. The four measured ones are the
models, whose hashes the registry already pins.)

## What is deliberately not here

- **The installer** — the thing that fetches the pieces and lays them down ✓ (W5.1's
  remaining half ✓), and the **download slice** (W5.2 ✓: resumable ✓, checksummed ✓).
- **The hashes of the six unmeasured pieces** — they are measured when the installer fetches
  them ✓, not guessed now ✓ ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_install_manifest.py
```
