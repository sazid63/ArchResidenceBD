# ADR-0019 — Venue-neutral SFT kernel, with a bounded local GPU fallback

**Date:** 2026-10-20 · **Status:** accepted · **Work packages:** W1.6, W1.7
**Code:** `tools/training/kaggle/chat/chat_sft.py` · **Primary venue:** Kaggle (ADR-0018)
**Fallback venue:** dev RTX 4050 6 GB, isolated venv · **Eval:** W1.9 harness (unchanged)

## Context

The committed Kaggle kernel is the primary training path: free GPU, reproducible from a commit,
artifacts fetched by CLI. On 2026-10-20 the account's two batch GPU sessions were occupied by a
non-repo 27B server kernel with a 7-hour self-cap. The queue is external and must not be broken
by stopping someone else's session (ADR-0018 decision 7).

The dev machine has an RTX 4050 Laptop (6 GB, 5.1 GB free), 16 GB RAM and enough disk for a
4-bit 4B run. The committed data is small (414 records, max 962 tokens). A local run is therefore
technically possible without touching the product's dependency set.

Leaving P1 blocked for seven hours is a halt, not autonomy. The fallback must be bounded,
declared, and identical in everything the eval can see.

## Decisions

1. **One kernel, two venues, no forks.** `chat_sft.py` reads its input/output/data paths from
   `ARCHRES_SFT_DATA`, `ARCHRES_SFT_OUT`, `ARCHRES_SFT_MAX_LEN`, `ARCHRES_SFT_SMOKE`,
   `ARCHRES_SFT_NO_INSTALL` and `ARCHRES_SFT_SKIP_GGUF`. The training, masking, generation and
   summary code is the same on Kaggle and locally; only the paths and dependency installation
   differ.
2. **The local fallback is bounded and declared.** It runs only when the Kaggle GPU is occupied
   by a non-repo session, in an isolated venv under `data/tmp/` (never the app environment),
   with 4-bit QLoRA, batch 1, gradient checkpointing and `MAX_LEN=1024` (covers the 962-token
   maximum; truncation is not allowed). The run summary records the GPU name, precision, package
   versions and token statistics, so a local artifact is never presented as Kaggle evidence.
3. **The eval does not care where the reply set was generated.** The 60 model.parse replies are
   scored by `tools/eval/run_eval.py` against the committed floors. A local run that misses a
   floor fails exactly like a Kaggle run that misses it.
4. **The adapter is the training artifact; GGUF conversion is venue-independent.** Conversion
   and quantization need no GPU. If the local machine cannot build llama.cpp, the adapter
   (~50 MB) is uploaded as a private dataset and converted on a Kaggle **CPU** kernel (CPU quota
   is separate from GPU quota, proven by the preflight kernel). The Q4_K_M file is the fleet
   artifact either way.
5. **The primary path remains the committed Kaggle kernel.** The fallback does not remove the
   GPU queue item, does not change the plan's venue, and does not close W1.6 on its own: the
   package still needs the W1.9 gate result and the W1.12 live probe on the resulting model.
6. **A failed local attempt is recorded, not hidden.** If the 6 GB card OOMs or the Windows
   bitsandbytes path fails, the attempt is noted with the error; the Kaggle run stays queued and
   the package stays open.

## Consequences

- P1 can progress while a shared GPU session is busy, without touching the account's other work.
- The same kernel can silently drift between venues if an environment variable is mis-set;
  `train-summary.json` records the effective paths, GPU, versions and `maxLen`, and the board
  states the venue, so the claim is visible.
- A local 4B QLoRA on 6 GB is tight; OOM is a likely failure mode. `MAX_LEN=1024` and batch 1
  are the guardrails; the fallback is abandoned rather than silently reducing data or truncating
  answers.
- Adapter-only local runs make the GGUF step a second, CPU-only job. That is acceptable and
  keeps the GPU for training, but it adds a dataset upload/download round trip.
