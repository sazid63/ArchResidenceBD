---
cardVersion: "0.1.0"
id: archie-embed
role: embed
status: skeleton
displayNameEn: Archie Embed
displayNameBn: আর্চি এমবেড
upstreamRepo: Qwen/Qwen3-Embedding-0.6B
upstreamLicense: Apache-2.0
license: Apache-2.0
distribution: bundled
artifactSha256: 06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439
artifactSizeBytes: 639150592
hfRepo: ""
---

# Archie Embed — model card

> **Skeleton (W0.8).** Structure is machine-checked by `core/tests/test_model_cards.py`; every **TBD** fills in at publish time (recipe: `spec/models/publishing.md`). Never publish a card while a TBD remains.
> Pinned to registry entry `archie-embed` (`spec/models/registry.json`, fleet `archie-fleet-v1`). **Stock model — no training** (fleet law: the RAG pair is untrained, plan §4). The card exists for fleet-member documentation; nothing is republished unless we decide to host a GGUF redistribution.

## Narrow task contract

Embed clauses, questions, and user utterances for hybrid retrieval in the RAG service. One job: vectors for search, on the CPU side of the pipeline.

## Intended use

- Query + document embeddings for clause-level retrieval over the RAG corpus (BNBC core, active city pack, project-referenced packs).
- BN + EN text (the corpus is bilingual).

## Out of scope

- Generation of any kind; decisions; verdicts.
- Training/fine-tuning — stock weights only.
- GPU placement: this member is **CPU-pinned by design** (see Limitations).

## Training data

Not applicable — stock model, no training (fleet law). Retrieval quality comes from the corpus + reranker, never from fine-tuning this member.

## Evaluation

No fine-tune evals. Service-level retrieval evals (citation-recall gates, candidate depth `k` tuned by evals — plan §8) live in the RAG service suite (W1.1).

## Limitations

- Context 2048; long clauses are chunked at the corpus level.
- **Must stay `-ngl 0`** (CPU-pinned): llama.cpp auto-fit otherwise pulls it into VRAM and crowds the chat model out on the 6 GB floor (S2 finding).
- Embedding-only mode (`--embeddings --pooling last`); no chat template.

## Licence & attribution

- Base: `Qwen/Qwen3-Embedding-0.6B` — Apache-2.0.
- Redistributed unmodified; licence text + attribution reproduced in the app's Licences screen notices; published card carries the same attribution if ever hosted.

## Provenance

- Bundled artifact = stock upstream GGUF (`Q8_0`), sha256 pinned in `spec/models/registry.json` (also in this card's front matter).
- No derivative exists; any future requantization = **new** registry entry + new card; shipped entries are never edited.
