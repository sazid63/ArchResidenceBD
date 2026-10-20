# ADR-0020 — Reviewed teacher subset, declared token shortfall, parser-owned fractions

**Date:** 2026-10-20 · **Status:** accepted · **Work packages:** W1.6, W1.4 (post-closure guard)
**Data:** `data/training/teacher-review/` · `data/training/sft-v1/`
**Tools:** `tools/training/build_teacher_review.py`, `tools/training/build_sft_teacher.py`
**Decision owner:** owner selected **path A** (review the 8B pool, record the shortfall, cover the
fractional gap) after both teacher batches were measured.

## Context

The plan's teacher batch targeted roughly 0.5M tokens of chat training data. The scripted dataset
contributes ~197k tokens. The plan's Qwen3-8B Q4 teacher produced 1,496 raw calls from 88 train
ask records × 17 variants, but only **111 unique paraphrases** survived deterministic dedupe
(1,385 duplicates). The 4B fallback produced 114 unique records. Seed-only prompt variants
collapse to about one or two distinct paraphrases per question; more GPU passes over the same 88
seeds would mostly reproduce the same text.

The 8B output is better than the 4B but is not promotion-ready as a batch. Review found meaning
drift and question-type changes alongside faithful paraphrases. The app also had a measured
fractional-area miss: `সাড়ে ৫ কাঠা` (5.5 katha) was read as 5.0 by the old parser, which then
escalated to the model. Teacher paraphrase data cannot fix that arithmetic: it only rephrases
questions.

## Decisions

1. **Review the 8B pool record by record, not as a batch.** The ledger in
   `data/training/teacher-review/review.jsonl` has exactly one decision per candidate: **61
   accepted, 50 rejected**, each rejection with a reason. The review is pinned to the candidate
   text sha256. A label echo on one accepted BN record was removed as a declared normalization;
   the raw text stays pinned in the ledger. Two faithful `soil-report-file` imperatives remain
   rejected because the ask shape gate requires a question and the source is an instruction;
   that is a declared gate artefact, not a silent omission.
2. **Only reviewed records enter training.** `accepted.jsonl` contains the 61 accepted records
   with `status: verified`, `review.meaning` in `verifyChecks`, and an `input.review` block naming
   the reviewer, date, owner decision and candidate hash. The Kaggle dataset is `sft-v1`:
   475 train / 247 holdout / 722 total. Holdout is byte-identical to `sft-v0`; accepted records
   are train-side only.
3. **The ~0.5M-token shortfall is declared, not papered over.** `sft-v1` measures **207,558**
   tokens (chars ÷ 4 over full message text), leaving **292,442** below the 500,000 target in
   `manifest.tokens.shortfall`. Closing that gap needs new prompt styles, longer explain/parse
   records, or a new corpus — not another pass over the same 88 seeds.
4. **Fractions are fixed at the deterministic parser, not by SFT.** The parser now expands
   `সাড়ে`/`পৌনে`/`সোয়া`/`দেড়`/`আড়াই` and English "N and a half" to decimals before unit
   conversion; a fraction without a resolvable base still escalates. This is the scripts-first
   layer for a deterministic arithmetic fact. The model-parsed path remains the fallback and is
   still gated; the fractional fix does not rely on an unmeasured model behaviour.
5. **Training the reviewed subset is a candidate round, not promotion.** The Kaggle v1 run must
   pass the W1.9 floors and a live probe before any model is registered. The teacher itself is
   never shipped.

## Measured outcome (2026-10-20)

The v1 round ran on Kaggle (`archresidencebd-chat-sft-v1`, T4, 475 train records, 120 steps, loss
0.23197) and scored **42/60 model.parse = 0.700** — decision 0.867, value 0.676, `accuracy:bn`
0.600, `accuracy:en` 0.800. All four floors pass and none moved. Case by case it **fixed none**
of the scripted round's misses and **broke exactly one**
(`model.parse:chat-parse-gas-source-slp-typo-label-en`): 43/60 → 42/60.

Consequences of that measurement:

- The reviewed subset is **usable** (it trains, it clears every floor) but **not useful** on the
  gated suite, so the candidate is **not selected**: `archie-chat-v0` stays in the fleet, and the
  v1 adapter is neither converted to GGUF nor registered. The reply set is committed and pinned
  (`data/eval/chat-v0/replies/finetune-v1.jsonl`) so the comparison stays reproducible in CI.
- Ask-paraphrase variety is invisible to the W1.9 suite, which scores `model.parse` only. A
  future teacher round must either add a gated ask-phrasing suite or target parse/explain
  records, where the suite can see the gain. "More data" is not a measurable claim here.
- The shortfall decision stands on its own: 207,558 tokens against the 500,000 target, with the
  292,442-token gap declared in `sft-v1/manifest.json`.

## Consequences

- The 8B pool is now an auditable reviewed subset rather than an unexamined candidate pile.
- W1.6 can close with a **declared** shortfall if the candidate round passes; the gap is a
  measured fact in the manifest, not a claim that the target was met.
- The review is biased toward precision: 50 paraphrases were rejected for drift, typos or shape
  artefacts. Future teacher runs should optimize for fewer, higher-quality variants or new
  prompt styles, not more seeds/passes.
- The accepted subset is still mostly question paraphrases, so the W1.9 `model.parse` score may
  not move much; the round tests non-regression, while human meaning review is the quality gate
  for ask records.
- Rebuilding `accepted.jsonl` requires the gitignored raw candidates; the committed ledger and
  accepted file are the audit trail. CI checks the derived `sft-v1` freshness without the raw
  candidate file.
