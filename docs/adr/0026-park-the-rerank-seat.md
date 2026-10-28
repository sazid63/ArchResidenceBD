# ADR-0026 — The rerank seat is parked: a model that answers with zeros is not a reranker

**Date:** 2026-10-21 · **Status:** accepted · **Owner decision:** 2026-10-21 (park, like the
teacher) · **Related:** ADR-0024 (the teacher is parked), ADR-0014 (the reranker needs its own
instruct template), ADR-0012 (the fleet roster is fixed)
**Code:** `spec/models/fleet.json` (the modes' warmup) · `spec/models/registry.json` (the seat's
note) · `core/src/archres_core/rag/rerank.py` (the seam stays)

## Context

The fleet has four seats (ADR-0012): chat, repair, embed, rerank. The **rerank** seat is
`archie-rerank` (Qwen3-Reranker-0.6B.Q8_0) and the live measurement (ADR-0014, 2026-10-20) is
that the route **returns all-zero scores for every candidate**: a reranker with no signal
cannot rank, so every live query reports `degraded(rerank:no usable signal)` and the service
keeps the fused order.

That is not a small defect - it is a seat that does not do its work while the app still pays
for it: the model is warmed in both modes, so it occupies CPU and RAM (a 0.6B model on a
6 GB machine) for a route whose answer is discarded. The production reranker is the **lexical**
one (`LexicalReranker`), which does rank.

The owner was asked what to do with the seat and chose to **park** it - the same treatment the
teacher got (ADR-0024).

## Decisions

1. **The seat stays; the model behind it is parked.** The roster is frozen (one seat per role,
   ADR-0012) and the seat is part of the shipped manifest. Parking means: the route is not
   warmed, the production reranker is the lexical one, and the registry says why.
2. **The fleet stops warming it.** The `interview` and `design` modes warm `chat`/`embed` and
   `repair`/`embed`; the rerank route is not warmed, so the app no longer pays for a route whose
   answer it discards. The rendered `llama-swap.yaml` follows the registry and the fleet
   config, so both are regenerated.
3. **The seam stays experimental.** `LlamaReranker` (the llama.cpp `/v1/rerank` client) is
   still in the code and still usable by `tools/rag/search.py --base-url`; the park is a
   *production routing* decision, not a deletion.
4. **Un-parking needs the template, not a new model.** The measured cause is that the route
   answers with zeros; Qwen3-Reranker needs its own instruct template. So the way back is a
   template (and a re-measurement that shows a spread), not a new seat.
5. **The degradation stays visible.** A live query that *does* reach the model route still
   reports `degraded(rerank:no usable signal)` and names the reranker it used. Parking a seat
   must not make the reason invisible.

## Consequences

- The app stops loading a 0.6B model it does not use, in both modes.
- The RAG's behaviour is unchanged: the lexical reranker was already the production path, and
  the evaluation suite (18/18) is untouched.
- The seat is still declared, so the manifest still says what the product *could* use, and the
  next person to look at the reranker finds the measurement and the way back rather than a
  mystery.
- If a future phase wants a real reranker, the work is a template plus a re-measurement - and
  the un-parking is a one-line change to the modes' warmup.
