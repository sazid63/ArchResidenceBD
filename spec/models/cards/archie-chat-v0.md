---
cardVersion: "0.1.0"
id: archie-chat-v0
role: chat
status: draft
displayNameEn: Archie Chat
displayNameBn: আর্চি চ্যাট
upstreamRepo: Qwen/Qwen3-4B-Instruct-2507
upstreamLicense: Apache-2.0
license: Apache-2.0
distribution: bundled
artifactSha256: bea406a8bafb47c076f4bc2b61ed481cd88c3eff094171af6046a2aad2a54f73
artifactSizeBytes: 2497278880
hfRepo: ""
---

# Archie Chat v0 — model card

> **Draft (W1.6).** Structure is machine-checked by `core/tests/test_model_cards.py`. The card
> describes the **scripted-round fine-tune** currently registered as `archie-chat-v0`
> (`spec/models/registry.json`, fleet `archie-fleet-v1`). The plan's full teacher-augmented batch
> is still open, so this card is not publish-ready. The stock base card was retired with its
> registry entry; the stock GGUF remains on disk for rollback only and is not routed.

## Narrow task contract

The voice of the app. One task family: conduct the phase interview (BN/EN, Banglish tolerated),
parse free-text answers into Building Spec edits, and explain rule verdicts **with citations** from
the pinned rule pack. Numbers and verdicts are always produced by the deterministic engines
(spec/rule/BOQ scripts); the model only asks, phrases, and narrates. Never computes compliance
values itself (plan §9 law: scripts first, AI last-mile).

## Intended use

- Phase interviews and follow-up questions (Site & Excavation … Common Services), BN or EN.
- Turning answers into candidate Spec patches (validated deterministically before commit).
- Explaining `compliant | deviation | impossible` verdicts and deviation alternatives in plain BN/EN, citing the pack.
- Narrating reports (BOQ summaries, engineer pack) where every figure traces to a script output.

## Out of scope

- Computing FAR/BCR/setbacks/BOQ numbers itself — those come from rule packs and scripts.
- Legal advice, certification, or engineer sign-off.
- General-purpose chat, languages beyond BN/EN/Banglish.
- Network access at runtime (offline-first; tool calls are separately permission-gated host features).

## Training data

- **Scripted round (measured):** 414 training records derived from the frozen eval split by source
  question id; Qwen3-4B-Instruct-2507, 4-bit QLoRA, r16, 2 epochs / 104 steps, max length 2048,
  seed 20261020, bf16; Kaggle T4. Adapter: 132,187,888 bytes.
- **Teacher batch (open):** the plan's ~0.5M-token teacher-augmented batch is still a W1.6 job.
  Teacher output is candidate-only; promotion needs the W1.6/W1.9 gate and human review.
- **Language:** BN + EN hand-authored/reviewed templates; never machine-translated for
  user-facing question text.
- **TBD at publish:** exact teacher counts, teacher model + revision, data card reference.

## Evaluation

- **Gated holdout:** 43/60 `model.parse` (0.717) vs stock 32/60 (0.533); decision 0.867
  (floor 0.650), value 0.706 (0.500), `accuracy:bn` 0.600 (0.5667), `accuracy:en` 0.833 (0.500).
  All recorded floors pass; none moved.
- **Remaining misses:** 17 `model.parse` cases are enumerated by the reproducible gated report;
  there is no 1.0 claim.
- **Live:** BN 2.389 s / EN 1.991 s with 61 accept + 2 fallback and 0 open essentials. A forced
  fractional-area escalation (`সাড়ে ৫ কাঠা`) returned `5.0 katha` instead of `5.5`, accepted only
  at `confidence: low`; this is a measured teacher-batch case, not a claimed success.
- **TBD at publish:** full eval tables vs gates after the teacher batch.

## Limitations

- Bengali fractional quantifiers are a known miss: the scripted round never saw them and the
  model returns the integer part (`সাড়ে ৫` → 5.0). The deterministic parser now escalates these
  phrases instead of silently truncating; the model still needs teacher data.
- Can phrase imprecisely; may never supply an uncited number — if a figure cannot be traced to an
  engine output, it must not appear.
- BN orthography and Banglish coverage remain soft spots; covered by the sloppy-input eval class.
- Speculative decoding was measured and rejected on the reference machine (S2, ~8 % acceptance) —
  do not re-add without re-measuring.

## Licence & attribution

- Base: `Qwen/Qwen3-4B-Instruct-2507` — Apache-2.0.
- This derivative: Apache-2.0 (default = upstream licence family; owner confirms at first publish).
- Attribution: base model name + licence reproduced in the published card and in the app's Licences
  screen notices.

## Provenance

- Adapter: Kaggle v3 QLoRA output (`chat-v0-v3`), merged on CPU and quantized to Q4_K_M by
  `tools/training/convert_gguf.py`.
- Artifact: `data/downloads/s2/models/archie-chat-v0-Q4_K_M.gguf`, 2,497,278,880 bytes, sha256
  `bea406a8bafb47c076f4bc2b61ed481cd88c3eff094171af6046a2aad2a54f73`.
- Any fine-tune or requantization is a **new** registry entry + new card; shipped entries are never
  edited.
