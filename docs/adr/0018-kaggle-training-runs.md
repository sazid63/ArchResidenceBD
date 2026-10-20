# ADR-0018 — SFT runs as committed Kaggle script kernels; the GPU generates, the repo scores

**Date:** 2026-10-20 · **Status:** accepted · **Work packages:** W1.6, W1.7
**Code:** `tools/training/kaggle/` · **Data:** `data/training/sft-v0/`, `data/training/repair-v0/`
**Eval:** `docs/spec/eval-harness-v0.md` (W1.9)

## Context

The plan puts QLoRA training on Kaggle's free GPU; the dev machine has a 6 GB RTX 4050 and no
training stack, and `$0` rules out paid compute. The Kaggle CLI is authenticated via OAuth
(kernels and datasets API), so runs can be launched and fetched from the command line.

Two failure modes are easy here and both are unacceptable:

- **Notebook-only state.** A training run clicked together in the Kaggle UI is not reviewable,
  not reproducible and not attributable to a commit.
- **Two different scores.** If the GPU node also decides whether the model passed, the gates stop
  being the ones CI runs. The eval harness must score the model, not the notebook.

Constraints: private repository (Kaggle cannot clone it without a token); no secrets in the
image; 9–12 h Kaggle session limits; shared GPU quota; a private dataset is seeded from committed
files.

## Decisions

1. **Every training run is a Kaggle *script kernel* committed in this repository.** The kernel
   code (`chat_sft.py`, later the repair kernel) and its `kernel-metadata.json` (GPU, internet,
   dataset sources) live under `tools/training/kaggle/<run>/`. A run is identified by the commit
   that pushed it; nothing is configured by hand in the UI.
2. **Inputs travel as a private Kaggle dataset built from committed files.** The chat kernel
   receives `train.jsonl`, `holdout.jsonl`, `dataset.jsonl`, `cases.jsonl` and `manifest.json`.
   It never clones the private repo and never sees a token. The manifest pins the source
   dataset/split; the kernel checks the train count and refuses unverified or non-chat records
   and any train/holdout id overlap before training.
3. **The GPU node trains and generates; the repository scores.** The kernel writes greedy
   `replies/finetune.jsonl` for the same 60 `model.parse` holdout cases the stock baseline
   answered, then stops. `tools/eval/run_eval.py` scores that file locally against `gates.json` —
   the identical code and floors CI uses. A model's pass/fail never comes from the training
   script.
4. **Loss masking happens from the chat template, not by a tokenizer guess.** The assistant span
   is cut at the exact prefix produced by `apply_chat_template(..., add_generation_prompt=True)`;
   prefix tokens are labelled `-100`, the answer (including its end token) is trained. Records
   whose prefix would be truncated away are refused, not silently trained as a prompt-only
   example.
5. **The run produces three artifacts: adapter, replies, GGUF.** The kernel saves the LoRA
   adapter, the scored reply set and `train-summary.json` (versions, steps, loss, token stats,
   coverage, timings), then merges on CPU and builds a Q4_K_M GGUF with llama.cpp for the fleet.
   A GGUF failure is recorded in the summary and does not destroy the adapter/replies evidence.
6. **A smoke mode exists and is used before the full run.** `SMOKE = True` trains on 8 records
   for 2 steps, generates 4 replies and skips merge/GGUF; it validates dependency compatibility
   and the bnb/GPU path before an hour of quota is spent.
7. **Shared quota is respected.** A blocked push ("maximum GPU sessions") is recorded on the
   board, not worked around by stopping another session on the account. Runs queue; the owner's
   other work is not collateral.
8. **Auth stays out of the repo.** OAuth credentials live in the user profile; the repository
   contains no Kaggle token, and the dataset/kernel are private.

## Consequences

- W1.6/W1.7 are reproducible from a commit and auditable without Kaggle: the kernel code, the
  input pins and the output artifacts are all in the repo or fetched by CLI.
- Kaggle environment drift is visible: `train-summary.json` records the exact package versions
  and GPU; a future run can differ, and the difference is data, not a surprise.
- The 9–12 h session limit bounds a run; the chat kernel is designed for ~1–2 h (2 epochs on 414
  records, 60 greedy replies, CPU merge + Q4 quantisation).
- The reply set is a *sample* (the 60-case holdout), matching the stock baseline. It measures
  no-regression on the gated sample, not the full 655-case eval; the other suites are
  deterministic and need no model.
- A model that improves the holdout but breaks the demo still has to pass W1.12's live probe;
  the eval gates are a floor, not a product test.
