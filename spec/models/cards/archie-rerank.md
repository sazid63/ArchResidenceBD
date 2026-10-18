---
cardVersion: "0.1.0"
id: archie-rerank
role: rerank
status: skeleton
displayNameEn: Archie Rerank
displayNameBn: আর্চি রির্যাংক
upstreamRepo: Qwen/Qwen3-Reranker-0.6B
upstreamLicense: Apache-2.0
license: Apache-2.0
distribution: bundled
artifactSha256: 48c062151f5a3026f74a2066a37011ff9d7c135ddc8b7c22034b0051257908e9
artifactSizeBytes: 804166240
hfRepo: ""
---

# Archie Rerank — model card

> **Skeleton (W0.8).** Structure is machine-checked by `core/tests/test_model_cards.py`; every **TBD** fills in at publish time (recipe: `spec/models/publishing.md`). Never publish a card while a TBD remains.
> Pinned to registry entry `archie-rerank` (`spec/models/registry.json`, fleet `archie-fleet-v1`). **Stock model — no training** (fleet law: the RAG pair is untrained, plan §4). Nothing is republished unless we decide to host a GGUF redistribution.

## Narrow task contract

Rerank candidate clauses for citation quality. One job: order candidate passages so the citations the chat model sees are the best available for the question.

## Intended use

- Second stage of hybrid retrieval: rerank the embed-stage candidate list before citation assembly.
- BN + EN queries against bilingual clauses.

## Out of scope

- Generation; verdicts; any compliance judgment — the rule pack decides, this model only orders candidates.
- Training/fine-tuning — stock weights only.
- GPU placement: CPU-pinned by design (see Limitations).

## Training data

Not applicable — stock model, no training (fleet law).

## Evaluation

No fine-tune evals. Service-level evals: citation-recall after rerank (the depth `k` is tuned by citation-recall, not latency — plan §8) live in the RAG service suite (W1.1).

## Limitations

- Needs **its own instruct template** for meaningful scores (S2 finding) — the service owns that template, not the caller.
- Scores are relative rankings, not calibrated probabilities; thresholds come from evals, never from vibes.
- Reranking-only mode; context 2048; CPU-pinned `-ngl 0` for the same VRAM-floor reason as the embedder (S2).

## Licence & attribution

- Base: `Qwen/Qwen3-Reranker-0.6B` — Apache-2.0.
- Redistributed unmodified; licence text + attribution reproduced in the app's Licences screen notices; published card carries the same attribution if ever hosted.

## Provenance

- Bundled artifact = stock upstream GGUF (`Q8_0`), sha256 pinned in `spec/models/registry.json` (also in this card's front matter).
- No derivative exists; any future requantization = **new** registry entry + new card; shipped entries are never edited.
