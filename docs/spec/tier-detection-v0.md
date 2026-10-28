# The tier detection v0 (W5.3): measured, never assumed

**Status:** v0.1.0 — the machine is measured and the tier is named from what was found.
**Code:** `core/src/archres_core/tiers.py` · **Tests:** `core/tests/test_tiers.py` (6) ·
**Decision record:** ADR-0065 · **Plan:** §5.9 (the runtime stack: CUDA / Vulkan / CPU)

## What it is

The plan's §5.9 runtime stack has three tiers — CUDA, Vulkan and CPU — and the installer
picks one. The plan does not say how, and the repo had a rule that answers it: the **CAD
engine's** discovery is explicit and its failure is loud — the engine never assumes an
install. A tier the installer **cannot verify** is a tier it **does not claim**.

## What it does

- **The tier is measured, never assumed** — the machine is read (the NVIDIA driver through
  its own reporting, the Vulkan loader through the DLL that is or is not there, the CPU
  through the OS) and the tier is named from what was found.
- **The order is the product's order** — CUDA, then Vulkan, then the CPU: the strongest
  measured tier wins.
- **The CPU tier always works** — a machine nothing can be read from still gets a tier,
  because a machine with no GPU still runs the product — and the reason says the GPU probes
  found **nothing**.
- **A broken probe is a probe that found nothing** — not a claim.
- **Every name carries its evidence** — the answer says what it was measured with, so a
  support question is answerable.
- **The stdlib only** — no new dependency.

## The measured output (2026-10-22)

On the reference machine:

```json
{
  "schemaVersion": "0.1.0",
  "tier": "cuda",
  "reason": "the CUDA tier is measured: NVIDIA GeForce RTX 4050 Laptop GPU, 6141 MiB of VRAM, driver 581.86",
  "known": true,
  "findings": [
    {
      "name": "cuda",
      "detail": "NVIDIA GeForce RTX 4050 Laptop GPU, 6141 MiB of VRAM, driver 581.86",
      "evidence": "nvidia-smi --query-gpu"
    }
  ],
  "probes": ["nvidia-smi"]
}
```

So the reference machine is a **CUDA** machine ✓ — with 6 GB of VRAM ✓, which matters for
the fleet (one model resident at a time ✓, the draft model excluded ✓ — ADR-0054 ✓) ✓.

## What is deliberately not here

- **The per-tier configuration** — which engine flags each tier uses. The fleet's groups
  and modes already exist ✓; the auto-config's job is to pick between them ✓.
- **The updates** (W5.4 ✓).

## Checks

```powershell
uv run --directory core pytest -q tests/test_tiers.py
```
