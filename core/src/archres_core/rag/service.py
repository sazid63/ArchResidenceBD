"""RAG service v0 (W1.1) - hybrid retrieval with citations and a pack-keyed clause cache.

Design (ADR-0014):

* **Hybrid recall** = BM25 (lexical, always available) + dense vectors (embedder seam,
  hash embedder offline / ``archie-embed`` on the fleet), fused with reciprocal-rank fusion.
* **Rerank** = a seam (deterministic lexical reranker by default, ``archie-rerank`` on the
  fleet). A failed rerank is recorded in ``SearchResult.degraded`` and the fused order is
  kept - degraded retrieval is visible, never silent.
* **Citations** = every hit carries the pack's gazette citation (page, PDF page, tier) and
  the pack sha256 it was read from. ``textKind`` distinguishes transcribed gazette wording
  from our summary; rendering says which one the reader is looking at.
* **Clause cache** = citations/clause payloads keyed to the pinned corpus (pack id +
  version + sha256). Reusing a cached citation is safe only while the pack hash matches.

Determinism: same corpus + same query + same embedder/reranker => same hit order and the
same citation objects (ties break on doc id).
"""

from __future__ import annotations

import pathlib
import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from .corpus import ClauseDoc, Corpus, RagError
from .embed import Embedder, HashingEmbedder, VectorStore, cosine
from .lexical import BM25Index
from .rerank import LexicalReranker, Reranker

_BENGALI = re.compile(r"[\u0980-\u09ff]")
RRF_K = 60
LANG_BOOST = 1.15
# A reranker whose scores are all near zero, or identical, carries no signal. Keep the fused
# order and say so - this is how a mis-templated reranker was caught live (ADR-0014).
MIN_RERANK_SCORE = 1e-4
MIN_RERANK_SPREAD = 1e-6


def detect_lang(text: str) -> str:
    """Bangla when the query contains Bengali script, English otherwise (v0 heuristic)."""
    return "bn" if _BENGALI.search(text or "") else "en"


@dataclass(frozen=True)
class Hit:
    doc_id: str
    kind: str
    lang: str
    entity_id: str
    clause: str
    title: str
    text: str
    text_kind: str
    citation: dict | None
    refs: tuple[str, ...]
    scores: dict[str, float]
    same_lang: bool

    def as_dict(self) -> dict:
        return {
            "docId": self.doc_id,
            "kind": self.kind,
            "lang": self.lang,
            "entityId": self.entity_id,
            "clause": self.clause,
            "title": self.title,
            "text": self.text,
            "textKind": self.text_kind,
            "citation": self.citation,
            "scores": self.scores,
            "sameLang": self.same_lang,
        }


@dataclass(frozen=True)
class SearchResult:
    query: str
    lang: str
    hits: tuple[Hit, ...]
    pack_id: str
    pack_version: str
    pack_sha256: str
    corpus_documents: int
    embedder: str
    reranker: str | None
    degraded: tuple[str, ...] = ()
    note: str | None = None

    def citations(self) -> list[dict]:
        return [hit.citation for hit in self.hits if hit.citation]

    def doc_ids(self) -> list[str]:
        return [hit.doc_id for hit in self.hits]


class ClauseCache:
    """Citation/clause payloads keyed to ``(packId, packVersion, packSha256)``.

    A cache built from a different pack revision is rejected instead of serving a citation
    against the wrong gazette bytes - the same rule verdict sets follow (W1.2).
    """

    def __init__(self, corpus: Corpus) -> None:
        self.key = (corpus.pack_id, corpus.pack_version, corpus.pack_sha256)
        self._entries: dict[str, dict] = {}
        self.hits = 0
        self.misses = 0

    def get(self, doc: ClauseDoc) -> dict:
        if doc.corpus_key != self.key:
            raise RagError(
                f"clause {doc.id} belongs to a different pack pin than this cache "
                f"({doc.pack_sha256[:12]} vs {self.key[2][:12]})"
            )
        cached = self._entries.get(doc.id)
        if cached is not None:
            self.hits += 1
            return cached
        self.misses += 1
        entry = {
            "docId": doc.id,
            "entityId": doc.entity_id,
            "clause": doc.clause,
            "title": doc.title,
            "textKind": doc.text_kind,
            "citation": doc.citation,
            "packId": doc.pack_id,
            "packVersion": doc.pack_version,
            "packSha256": doc.pack_sha256,
        }
        self._entries[doc.id] = entry
        return entry

    def stats(self) -> dict[str, int | str]:
        return {
            "packId": self.key[0],
            "packVersion": self.key[1],
            "packSha256": self.key[2],
            "entries": len(self._entries),
            "hits": self.hits,
            "misses": self.misses,
        }


class RagService:
    """Hybrid clause retrieval over one pinned corpus."""

    def __init__(
        self,
        corpus: Corpus,
        *,
        embedder: Embedder | None = None,
        reranker: Reranker | None = None,
        vector_store: VectorStore | None = None,
        candidate_depth: int = 20,
        rerank_depth: int = 12,
        min_dense: float = 0.05,
    ) -> None:
        if not corpus.docs:
            raise RagError("the corpus has no documents")
        if candidate_depth < 1 or rerank_depth < 1:
            raise ValueError("retrieval depths must be positive")
        self.corpus = corpus
        self.docs = corpus.by_id()
        self.embedder = embedder or HashingEmbedder()
        self.reranker = reranker or LexicalReranker()
        self.vector_store = vector_store or VectorStore()
        self.candidate_depth = candidate_depth
        self.rerank_depth = rerank_depth
        self.min_dense = min_dense
        self.cache = ClauseCache(corpus)
        self._bm25 = BM25Index(list(corpus.docs))
        self._vectors: dict[str, list[float]] | None = None
        self._query_vectors: dict[str, list[float]] = {}

    # -- index ---------------------------------------------------------

    def _ensure_vectors(self) -> dict[str, list[float]]:
        if self._vectors is not None:
            return self._vectors
        doc_ids = [doc.id for doc in self.corpus.docs]
        # A transport embedder (llama) learns its dimension from the first response; until then
        # there is no cache key to look up, so the batch is computed and saved once.
        cached = (
            self.vector_store.load(self.corpus.sha256, self.embedder, doc_ids)
            if self.embedder.dim
            else None
        )
        if cached is not None:
            self._vectors = cached
            return cached
        vectors = self.embedder.embed([self._document_text(doc) for doc in self.corpus.docs])
        if len(vectors) != len(self.corpus.docs):
            raise RagError("embedder returned a different number of vectors than documents")
        dims = {len(vector) for vector in vectors}
        if len(dims) != 1:
            raise RagError(f"embedder returned inconsistent dimensions: {sorted(dims)}")
        if not self.embedder.dim:
            self.embedder.dim = dims.pop()  # type: ignore[misc]
        self._vectors = {doc.id: vector for doc, vector in zip(self.corpus.docs, vectors)}
        self.vector_store.save(self.corpus.sha256, self.embedder, doc_ids, self._vectors)
        return self._vectors

    @staticmethod
    def _document_text(doc: ClauseDoc) -> str:
        return f"{doc.clause}\n{doc.title}\n{doc.text}"

    def _query_vector(self, query: str) -> list[float]:
        cached = self._query_vectors.get(query)
        if cached is None:
            cached = self.embedder.embed([query])[0]
            self._query_vectors[query] = cached
        return cached

    # -- retrieval -----------------------------------------------------

    def search(
        self,
        query: str,
        *,
        k: int = 6,
        lang: str | None = None,
        kinds: Iterable[str] | None = None,
        rerank: bool = True,
    ) -> SearchResult:
        """Hybrid search; returns cited hits plus any visible degradation."""
        if not isinstance(query, str) or not query.strip():
            raise RagError("a search query is required")
        if k < 1:
            raise ValueError("k must be positive")
        if lang is not None and lang not in {"bn", "en"}:
            raise ValueError("lang must be 'bn' or 'en'")
        query_lang = lang or detect_lang(query)
        kind_set = set(kinds) if kinds is not None else None
        if kind_set is not None:
            unknown = kind_set - {doc.kind for doc in self.corpus.docs}
            if unknown:
                raise RagError(f"unknown document kinds: {sorted(unknown)}")

        allowed = {
            doc.id
            for doc in self.corpus.docs
            if (kind_set is None or doc.kind in kind_set) and (lang is None or doc.lang == lang)
        }
        if not allowed:
            return self._empty(query, query_lang, "no documents match the requested filters")

        lexical = self._bm25.search(query, limit=self.candidate_depth, allowed=allowed)
        vectors = self._ensure_vectors()
        query_vector = self._query_vector(query)
        dense_scored = []
        for doc_id in allowed:
            value = cosine(query_vector, vectors[doc_id])
            if value >= self.min_dense:
                dense_scored.append((doc_id, value))
        dense_scored.sort(key=lambda item: (-item[1], item[0]))
        dense = dense_scored[: self.candidate_depth]
        if not lexical and not dense:
            return self._empty(query, query_lang, "no clause matched the query")

        lexical_scores = {hit.doc_id: hit.score for hit in lexical}
        dense_scores = {doc_id: round(value, 6) for doc_id, value in dense}
        fused: dict[str, float] = {}
        for rank, hit in enumerate(lexical, start=1):
            fused[hit.doc_id] = fused.get(hit.doc_id, 0.0) + 1.0 / (RRF_K + rank)
        for rank, (doc_id, _value) in enumerate(dense, start=1):
            fused[doc_id] = fused.get(doc_id, 0.0) + 1.0 / (RRF_K + rank)
        for doc_id in fused:
            if self.docs[doc_id].lang == query_lang and lang is None:
                fused[doc_id] *= LANG_BOOST
        ordered = sorted(fused.items(), key=lambda item: (-item[1], item[0]))

        degraded: list[str] = []
        # Rerank a union of the fused head and the lexical head: RRF can push a strong
        # lexical-only hit below the depth line (dense noise), and the reranker must still
        # get the chance to rescue it.
        candidate_ids = list(
            dict.fromkeys(
                [doc_id for doc_id, _score in ordered[: max(self.rerank_depth, k)]]
                + [hit.doc_id for hit in lexical[: max(self.rerank_depth, k)]]
            )
        )
        candidates = [self.docs[doc_id] for doc_id in candidate_ids]
        rerank_scores: dict[str, float] = {}
        reranker_name: str | None = None
        if rerank and self.reranker is not None and candidates:
            try:
                values = self.reranker.rerank(query, candidates)
                if len(values) != len(candidates):
                    raise RagError("reranker returned a different number of scores than candidates")
                rerank_scores = {
                    doc.id: round(float(value), 6) for doc, value in zip(candidates, values)
                }
                highest = max(rerank_scores.values())
                spread = highest - min(rerank_scores.values())
                if highest < MIN_RERANK_SCORE or spread < MIN_RERANK_SPREAD:
                    degraded.append(
                        f"rerank:no usable signal (max={highest:.3g}, spread={spread:.3g})"
                    )
                    rerank_scores = {}
                else:
                    reranker_name = self.reranker.name
            except RagError as exc:
                degraded.append(f"rerank:{exc}")
        if rerank_scores:
            ordered = sorted(
                ordered,
                key=lambda item: (
                    -rerank_scores.get(item[0], -1.0),
                    -item[1],
                    item[0],
                ),
            )

        hits = []
        for doc_id, fused_score in ordered[:k]:
            doc = self.docs[doc_id]
            self.cache.get(doc)
            hits.append(
                Hit(
                    doc_id=doc.id,
                    kind=doc.kind,
                    lang=doc.lang,
                    entity_id=doc.entity_id,
                    clause=doc.clause,
                    title=doc.title,
                    text=doc.text,
                    text_kind=doc.text_kind,
                    citation=doc.citation,
                    refs=doc.refs,
                    scores={
                        "lexical": round(lexical_scores.get(doc_id, 0.0), 6),
                        "dense": round(dense_scores.get(doc_id, 0.0), 6),
                        "fused": round(fused_score, 6),
                        "rerank": rerank_scores.get(doc_id, 0.0),
                    },
                    same_lang=doc.lang == query_lang,
                )
            )
        note = None
        if any(hit.kind == "declared_gap" for hit in hits):
            note = "at least one hit is a declared gap: the pack does not assert this content"
        return SearchResult(
            query=query,
            lang=query_lang,
            hits=tuple(hits),
            pack_id=self.corpus.pack_id,
            pack_version=self.corpus.pack_version,
            pack_sha256=self.corpus.pack_sha256,
            corpus_documents=len(self.corpus.docs),
            embedder=self.embedder.name,
            reranker=reranker_name,
            degraded=tuple(degraded),
            note=note,
        )

    def _empty(self, query: str, lang: str, note: str) -> SearchResult:
        return SearchResult(
            query=query,
            lang=lang,
            hits=(),
            pack_id=self.corpus.pack_id,
            pack_version=self.corpus.pack_version,
            pack_sha256=self.corpus.pack_sha256,
            corpus_documents=len(self.corpus.docs),
            embedder=self.embedder.name,
            reranker=None,
            note=note,
        )

    # -- citations -----------------------------------------------------

    def clause(self, doc_id: str) -> ClauseDoc:
        """One clause document by id; raises rather than returning an uncited blank."""
        doc = self.docs.get(doc_id)
        if doc is None:
            raise RagError(f"unknown clause document: {doc_id}")
        return doc

    def citation(self, doc_id: str) -> dict:
        """The cached citation payload for one clause (pack-pinned)."""
        return self.cache.get(self.clause(doc_id))

    def coverage(self) -> dict:
        """What this corpus can and cannot answer from - never silent."""
        return {
            "packId": self.corpus.pack_id,
            "packVersion": self.corpus.pack_version,
            "packSha256": self.corpus.pack_sha256,
            "documents": len(self.corpus.docs),
            "referenceSet": "declared" if self.corpus.manifest else "unknown",
            "missing": [dict(entry) for entry in self.corpus.missing],
            "clauses": dict(self.corpus.coverage),
        }

    def render_context(self, hits: Sequence[Hit]) -> str:
        """Prompt-ready citation block; states whether the words are gazette or summary."""
        if not hits:
            return "No clause was retrieved; do not answer from memory."
        lines = []
        for number, hit in enumerate(hits, start=1):
            if hit.citation is None:
                source = "Source: declared gap — the pack asserts no clause, page or number here."
            else:
                label = (
                    "gazette wording"
                    if hit.text_kind == "gazette_quote"
                    else "app summary of the provision"
                )
                source = (
                    f"Source: gazette p. {hit.citation.get('gazettePage', '?')} "
                    f"(PDF p. {hit.citation.get('pdfPage', '?')}), tier {hit.citation.get('tier', '?')}; "
                    f"{label}; pack sha256 {self.corpus.pack_sha256[:12]}."
                )
            lines.append(
                f"[{number}] {self.corpus.pack_id} {hit.clause or hit.entity_id} — {hit.title}\n"
                f"{hit.text}\n{source}"
            )
        if any(hit.text_kind == "declared_gap" for hit in hits):
            lines.append("One or more hits are declared gaps; say the pack does not cover them.")
        return "\n\n".join(lines)


def service_from_paths(
    corpus_path: str | pathlib.Path,
    *,
    embedder: Embedder | None = None,
    reranker: Reranker | None = None,
    cache_dir: str | pathlib.Path | None = None,
) -> RagService:
    """Load a committed corpus and build the service (embedder/reranker remain seams)."""
    from .corpus import load_corpus

    corpus = load_corpus(corpus_path)
    if corpus.manifest is None:
        raise RagError(
            "corpus manifest not found - the declared reference gaps would be invisible; "
            "rebuild with tools/rag/build_corpus.py"
        )
    return RagService(
        corpus,
        embedder=embedder,
        reranker=reranker,
        vector_store=VectorStore(cache_dir),
    )
