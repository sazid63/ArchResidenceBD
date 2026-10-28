# ADR-0014 — RAG service v0: generated cited corpus, hybrid retrieval, visible degradation

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W1.1
**Spec:** `docs/spec/rag-service-v0.md` · **Code:** `archres_core.rag` · **Data:** `spec/rag/`

## Context

The plan's law system has three channels (§5.6): structured rule packs for numbers, a
clause-level RAG corpus for text, and fine-tuning for behaviour. W1.2 built the packs and
verdicts; W1.5 built the chat data; the interview and orchestrator can already ask, parse,
commit and explain a verdict. What is missing is the ability to answer “what does the
regulation say about X, and where?” without a model inventing a clause.

Constraints that shaped the design:

- **$0, offline-first.** No vector database, no embedding service, no hosted index.
- **Quality law (§9).** Unverified content is a candidate; coverage gaps must be explicit;
  every number and clause citation stays tied to a pinned artifact.
- **No new model members** beyond the roster: the embedder and reranker are the stock
  Qwen3-0.6B pair already in the fleet (S2), served on CPU by llama-swap.
- We hold **one** rule pack and its gazette citations. The gazette PDF's text layer is
  unusable for letters (legacy fonts); pack summaries were read from page images.

## Decisions

1. **The corpus is generated from the pack, never authored in parallel.** Every document is
   derived from a provision, FAR/setback table, parking row/note, geometry rule, footnote or
   declared gap, and carries the citation of the entity it came from. Build fails on an
   entity whose `cite` does not resolve — there is no code path that emits an uncited
   document. The committed JSONL is byte-stable and CI checks freshness.
2. **`textKind` says what the words are.** `gazette_quote` (transcribed footnote wording),
   `pack_summary` (our summary of the provision; numbers pinned by the pack), `pack_note`,
   `declared_gap` (the pack explicitly does not assert this). Consumers that render a summary
   must say so; the corpus never presents a summary as the gazette's wording.
3. **The reference set is declared, not implied.** `spec/rag/sources.yaml` lists one ingested
   pack and every reference not ingested (BNBC 2020 core, RAJUK Appendix 5 definitions,
   other city packs) with a reason. The manifest and `RagService.coverage()` repeat it, so a
   narrow corpus cannot masquerade as full legal coverage.
4. **Hybrid recall with a deterministic floor.** BM25 (always on, BN/EN, Bengali digits
   folded, light suffix folding) plus dense vectors, fused with reciprocal-rank fusion. The
   embedder is a seam: `HashingEmbedder` (offline, deterministic, lexical n-grams) in CI;
   `LlamaEmbedder` (`archie-embed`) on the fleet. Rerank is a seam too: `LexicalReranker`
   offline; `LlamaReranker` (`archie-rerank`) on the fleet. The reranker sees the union of
   the fused head and the lexical head, so fusion noise cannot hide a strong exact match.
   **Amended 2026-10-20 at W1.1 closure:** the *production* v0 reranker is
   `LexicalReranker`. A live probe of the real `archie-rerank` route returns **degenerate
   all-zero scores for every candidate** (`max=0, spread=0`), which decision 5 correctly
   reports as `degraded(rerank:no usable signal)` and degrades to the fused order — i.e. on
   the fleet today the neural rerank stage is a no-op that costs a round trip. The fleet
   config also supplies no instruct template for Qwen3-Reranker (an S2 carry-forward), which
   is the most likely cause. `LlamaReranker` is therefore an **experimental seam**, and any
   claim that live ranking is "reranked by the model" is unsupported until W1.9 measures
   non-degenerate scores and citation recall against `LexicalReranker`.
5. **Degradation is data.** A reranker failure or a partial response does not abort the
   answer: the hits come back in fused order and `SearchResult.degraded` records
   `rerank:<reason>`. `SearchResult.embedder` / `.reranker` name what was actually
   **invoked** — including a reranker that was asked and produced no usable signal, so a
   live probe reports `reranker="archie-rerank"` *and* a `degraded` reason rather than
   reading as "no reranker configured". Silent substitution with a different component is
   forbidden.
6. **Citations are pack-pinned and cached by pin.** Every hit carries the gazette page, PDF
   page, tier, cite key and the pack sha256. `ClauseCache` is keyed by
   `(packId, packVersion, packSha256)`; a document from another pin is refused. A cached
   citation is therefore never served against different gazette bytes.
7. **Only words we can cite become documents.** Tables contribute a derived, deterministic
   bounds line (katha/sqm ranges, FAR by road width, coverage range) plus the full rows in
   `meta`; the rule engine remains the only place that selects a row. The corpus does not
   paraphrase numbers that the pack does not state.
8. **Model-parsed RAG output is a candidate.** The service returns hits and a prompt block;
   it does not write to the spec or the deviation register. Anything a model says with these
   citations stays `candidate` until the structured channel (pack/engine) or a human agrees.

## Consequences

- Works with no model at all; the same query returns the same order and citations in CI.
- Quality of the offline mode is **lexical, not semantic** (the hash embedder is a feature
  hash, not a trained embedding), and the lexical reranker under-ranks numeric table
  questions phrased semantically (“FAR for a 6 m road”). Citation-recall and ranking quality
  are W1.9's measurement job with the real embedder/reranker; k and the dense floor are
  parameters, not constants of nature.
- **The live neural rerank adds nothing today.** `archie-rerank` answers with all-zero
  scores, so live queries come back fused-or-lexical with `degraded` set. `LlamaEmbedder`,
  by contrast, returns healthy non-degenerate scores — the embedder seam is genuinely live
  and the reranker seam is not. Nothing fails; nothing is hidden; the honest statement is
  that v0 ships with `LexicalReranker` as production and `LlamaReranker` as an experiment
  waiting on its prompt template.
- The corpus is RAJUK-only in v0. BNBC core, Appendix 5 and other cities are declared gaps
  and must be closed by data work (BYO-PDF + P4 packs), never by a model's memory.
- The corpus adds ~210 KB of committed data; it is rebuilt in well under a second.

## Alternatives rejected

- **A vector database** (sqlite-vss, LanceDB, Chroma): new dependency and platform weight
  for 186 documents (the pack declares 12 gaps, 4 of them subject-level since 2026-10-21); a pure-Python cosine over a cached matrix is enough until evals say
  otherwise.
- **Downloading BNBC/RAJUK text into the repo**: redistribution and fidelity problems; the
  BYO-PDF path in §5.6 is the lawful route.
- **Hand-writing clause summaries as corpus docs**: duplicates the pack and invites drift;
  the builder would have no way to know whether a summary still matches the law.
- **Failing the search when the reranker is down**: makes the offline-first promise
  conditional on a model; a visible degraded result is more useful and honest.
