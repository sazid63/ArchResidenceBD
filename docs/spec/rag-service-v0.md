# RAG service v0 (W1.1)

**Status:** v0.1.0 · decision record: **ADR-0014**
**Code:** `archres_core.rag` (`corpus` · `lexical` · `embed` · `rerank` · `service`)
**Data:** `spec/rag/rajuk-2008.corpus.jsonl` + `rajuk-2008.manifest.json` + `sources.yaml`
**CLIs:** `tools/rag/build_corpus.py` · `tools/rag/search.py`
**Consumes:** rule pack (W1.2), fleet routes `embed`/`rerank` (W1.11), source registry (W0.10)
**Plan:** §5.6 (three-channel law system), §8 (RAG on CPU, candidate depth by evals), Appendix C W1.1

## What it does

Turns the pinned rule pack into **cited clause documents** and answers questions over them
with a hybrid retriever. Every hit names the pack, the clause, the gazette page and the PDF
page it came from, and whether the words are the gazette's or our summary. Nothing is
answered from model memory: no match means an empty result with a reason.

```text
rule pack ──build_corpus──▶ 178 cited docs (BN+EN) ──BM25 + dense──▶ RRF ──rerank──▶ hits
                                   │                                            │
                        manifest: pins, counts, gaps               ClauseCache (pack-pinned)
```

## Corpus

`build_corpus(pack_path, sources_path)` derives documents from the pack; build errors instead
of dropping an entity whose citation is missing.

| Kind | Count | Text | Source |
|---|---|---|---|
| `provision` | 46 (23 × BN/EN) | clause + title + summary | pack `provisions[].summary` |
| `far_table` | 20 | title, katha/sqm bounds, FAR by road width, coverage range; full rows in `meta.rows` | pack `farTables[]` |
| `setback_table` | 2 | row count, katha/sqm bounds, front/rear/side ranges, above-33 m rule | pack `setbackTable` |
| `parking_schedule` | 2 | row/note counts | pack `parkingSchedule` |
| `parking_row` | 54 | use, vehicle, ratio and minimum | pack `parkingSchedule.rows[]` |
| `parking_note` | 12 | note text | pack `parkingSchedule.notes[]` |
| `geometry_rule` | 6 | clause + title + summary | pack `parkingGeometry.rules[]` |
| `footnote` | 20 | transcribed gazette wording (`gazette_quote`) | pack `footnotes[]` |
| `declared_gap` | 16 | what the pack cannot assert, and why; **no** citation | pack `gaps[]` |

Document fields: `id` (`<packId>:<kind>:<entityId>:<lang>`), `kind`, `lang`, `entityId`,
`clause`, `title`, `text`, `textKind`, `citation` (`citeKey`, `gazettePage`, `pdfPage`,
`tier`, `note`), `packId`, `packVersion`, `packSha256`, `refs`, `meta` (structured rows for
tables). Lines are canonical JSON (`sort_keys`, compact separators), sorted by id, LF.

### Declared reference set

`spec/rag/sources.yaml` is the honest coverage statement. v0:

- **ingested:** `rajuk-bidhimala-2008` (pack `rajuk@2008.1`).
- **not ingested, with reasons:** `bnbc-2020-core`, `rajuk-appendix5-definitions`
  (pack candidate C4), `city-authority-rules-chattogram-khulna-rajshahi-sylhet`.

The manifest carries the same list; `RagService.coverage()` returns it at runtime.

## Retrieval

1. **Lexical** — BM25 (`k1=1.2`, `b=0.75`) over `clause + title ×2 + text`. Tokens: lowercase,
   Bengali digits → ASCII, light suffix folding (`অফিসের → অফিস`, `sides → side`), no
   stemming library and no stop-word removal (IDF does that).
2. **Dense** — embedder seam over `clause + title + text`; cosine; vectors cached under
   `data/cache/rag/<corpusSha>-<embedder>-<dim>.json` and discarded when the corpus hash,
   embedder name or dimension changes. Hits below `min_dense` (0.05) are not introduced.
3. **Fusion** — reciprocal-rank fusion (`k=60`), same-language boost `1.15` when no language
   filter is set; ties break on doc id.
4. **Rerank** — over the union of the fused head and the lexical head (`rerank_depth=12`
   each). A failed/partial/degenerate rerank is recorded in `degraded` and the fused order is
   kept. Degenerate means "no usable signal": the probe checks the score spread, so an
   all-zero response from the route is a degradation, not a ranking.

```python
from archres_core.rag import service_from_paths, LlamaEmbedder, LexicalReranker

service = service_from_paths(
    "spec/rag/rajuk-2008.corpus.jsonl",
    embedder=LlamaEmbedder(),          # archie-embed; HashingEmbedder() offline
    reranker=LexicalReranker(),        # v0 production; LlamaReranker() is experimental
    cache_dir="data/cache/rag",
)
result = service.search("৫ কাঠা জমিতে FAR কত", k=5)
print(service.render_context(result.hits))
```

`SearchResult`: `query`, `lang`, `hits`, `pack_id/version/sha256`, `corpus_documents`,
`embedder`, `reranker`, `degraded`, `note`. `Hit`: `doc_id`, `kind`, `lang`, `entity_id`,
`clause`, `title`, `text`, `text_kind`, `citation`, `refs`, `scores` (`lexical`, `dense`,
`fused`, `rerank`), `same_lang`.

## Citations & the clause cache

`render_context(hits)` produces a numbered prompt block:

```text
[1] rajuk@2008.1 §46(1)-(2) — Setback table
Setback table §46(1)-(2) — 15 plot-size rows (2–20 katha / 134–1340 sqm): …
Source: gazette p. 3046 (PDF p. 49), tier page-image; app summary of the provision; pack sha256 7c1e…
```

It never invents a page for a declared gap (`Source: declared gap — the pack asserts no
clause, page or number here.`) and tells the reader when the words are a summary.

`ClauseCache` stores each clause's citation payload under the pack pin. A document from a
different `packSha256` is refused (`RagError`), so a cached citation cannot outlive its
gazette bytes. `stats()` reports `entries`, `hits`, `misses` and the pin.

## Coverage law

- **No uncited document**: build fails if an entity's `cite` key is missing or lacks a page.
- **No silent gap**: every pack gap is a `declared_gap` document; every un-ingested reference
  is in `sources.yaml`, the manifest and `coverage()`.
- **No invented numbers**: table documents restate pack rows; row selection stays in W1.2.
- **No silent degradation**: `degraded`, `embedder` and `reranker` are always reported.

## Known limitations (v0)

- **RAJUK only.** BNBC core text, Appendix 5 definitions and other city packs are declared
  gaps, not covered knowledge.
- **Offline ranking is lexical.** `HashingEmbedder` is a deterministic feature hash, not a
  trained embedder; the lexical reranker under-ranks numeric table questions asked
  semantically (e.g. “FAR for a 6 m road”). `k`, `min_dense`, `rerank_depth` and the fusion
  weights are eval-tuned parameters — W1.9's citation-recall work, run against the real
  Qwen3 embedder/reranker pair.
- **The live reranker is experimental, not production.** `LlamaEmbedder` is genuinely live
  (healthy, spread-out cosine scores). `LlamaReranker` is not: against the running fleet it
  returns all-zero scores for every candidate, so every live query reports
  `degraded(rerank:no usable signal)` and is served in fused order. The fleet config carries
  no instruct template for Qwen3-Reranker (an S2 carry-forward). Until W1.9 shows
  non-degenerate scores **and** better citation recall than `LexicalReranker`, lexical is the
  v0 production reranker and live ranking should be described as fused+lexical.
- **No PDF ingestion yet.** The BYO-PDF importer (§5.6) is what will add BNBC/clause text as
  candidates; nothing here pretends to read the gazette PDF directly.
- **CPU cost is untested at scale.** 178 documents are indexed in memory; a real reference
  set (thousands of clauses) will need a sharded cache and likely numpy — an owner-signoff
  dependency decision, deliberately deferred.

## Checks

```powershell
uv run --directory core python ../tools/rag/build_corpus.py --check       # CI freshness
uv run --directory core python ../tools/rag/search.py "FAR for 5 katha" --k 5
uv run --directory core python ../tools/rag/search.py "setback" --coverage
uv run --directory core pytest -q -k rag                                  # corpus, retrieval, service
uv run --directory core python ../tools/rag/search.py "পার্কিং" --base-url http://127.0.0.1:8787
```

The last command uses the running fleet (`interview`/`design` modes warm `embed`/`rerank`).
