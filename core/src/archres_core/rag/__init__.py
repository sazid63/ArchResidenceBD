"""RAG service v0 (W1.1) - cited clause retrieval over the rule pack.

Layers: ``corpus`` (pack -> cited clause documents + declared gaps), ``lexical`` (BM25),
``embed`` (embedder seam + vector cache), ``rerank`` (reranker seam), ``service`` (hybrid
search, citations, clause cache, prompt rendering).

See docs/spec/rag-service-v0.md and ADR-0014.
"""

from __future__ import annotations

from .corpus import (
    CORPUS_VERSION,
    ClauseDoc,
    Corpus,
    RagError,
    build_corpus,
    load_corpus,
    load_sources,
    manifest,
    write_corpus,
)
from .embed import Embedder, HashingEmbedder, LlamaEmbedder, VectorStore, cosine
from .lexical import BM25Index, LexicalHit, normalize, tokenize
from .rerank import LexicalReranker, LlamaReranker, Reranker
from .service import ClauseCache, Hit, RagService, SearchResult, detect_lang, service_from_paths

__all__ = [
    "BM25Index",
    "CORPUS_VERSION",
    "ClauseCache",
    "ClauseDoc",
    "Corpus",
    "Embedder",
    "HashingEmbedder",
    "Hit",
    "LexicalHit",
    "LexicalReranker",
    "LlamaEmbedder",
    "LlamaReranker",
    "RagError",
    "RagService",
    "Reranker",
    "SearchResult",
    "VectorStore",
    "build_corpus",
    "cosine",
    "detect_lang",
    "load_corpus",
    "load_sources",
    "manifest",
    "normalize",
    "service_from_paths",
    "tokenize",
    "write_corpus",
]
