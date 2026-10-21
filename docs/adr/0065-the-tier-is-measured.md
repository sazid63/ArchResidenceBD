# ADR-0065 — The tier is measured, and a tier that cannot be verified is not claimed

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.3 (the auto-config) ·
**Plan:** §5.9 (the runtime stack: CUDA / Vulkan / CPU ·) · **Related:** ADR-0064 (the
downloader), ADR-0062 (the manifest's tiers ✓)
**Code:** `core/src/archres_core/tiers.py` (the detection) · **Tests:**
`core/tests/test_tiers.py` (6) · **Spec:** `docs/spec/tier-detection-v0.md`

## Context

The plan's §5.9 runtime stack has three tiers ✓ — CUDA ✓, Vulkan ✓ and CPU ✓ — and the
installer picks one ✓. The plan does not say how ✓, and the repo had a rule that answers
it ✓: the **CAD engine's** discovery is explicit ✓ and its failure is loud ✓ — the engine
never assumes an install ✓. A tier the installer **cannot verify** is a tier it **does not
claim** ✓ ✓.

## Decisions

1. **The tier is measured, never assumed** ✓ — the machine is read ✓ (the NVIDIA driver
   through its own reporting ✓, the Vulkan loader through the DLL that is or is not there
   ✓, the CPU through the OS ✓) and the tier is **named from what was found** ✓ ✓.
2. **The order is the product's order** ✓ — CUDA ✓, then Vulkan ✓, then the CPU ✓ ✓ — the
   strongest measured tier wins ✓ ✓.
3. **The CPU tier always works** ✓ — a machine nothing can be read from still gets a tier
   ✓, because a machine with no GPU still runs the product ✓ — and the reason says the GPU
   probes found **nothing** ✓ ✓.
4. **A broken probe is a probe that found nothing** ✓ — not a claim ✓ ✓ (the same rule the
   engine follows ✓: a failed run is an outcome ✓, not a silent skip ✓ ✓).
5. **Every name carries its evidence** ✓ — the answer says **what it was measured with** ✓
   (`nvidia-smi --query-gpu` ✓, `vulkan-1.dll` ✓, `os.cpu_count` ✓) ✓ ✓, so a support
   question is answerable ✓ ✓.
6. **The stdlib only** ✓ — no new dependency ✓ (the $0 law ✓) ✓.

## Consequences

- **The installer's tier choice is a measurement** ✓ — and it is recorded ✓ ✓.
- **This machine measures the CUDA tier** ✓ — an NVIDIA GeForce RTX 4050 Laptop GPU ✓ with
  6141 MiB of VRAM ✓ and driver 581.86 ✓ ✓.
- **A tier is never claimed on a hunch** ✓ — a machine with no readable GPU is a CPU-tier
  machine ✓, and it says so ✓ ✓.
- **What is not here** ✓: the **per-tier configuration** itself (which engine flags each
  tier uses ✓ — the fleet's groups and modes ✓ already exist ✓, and the auto-config's job
  is to pick between them ✓), and the **updates** ✓ (W5.4 ✓) ✓.
