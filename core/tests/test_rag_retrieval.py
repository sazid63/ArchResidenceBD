"""RAG retrieval halves (W1.1): BM25, embedder, reranker, vector cache - no model needed."""

from __future__ import annotations

import pathlib

import pytest

from archres_core.rag import (
    BM25Index,
    HashingEmbedder,
    LexicalReranker,
    LlamaEmbedder,
    LlamaReranker,
    RagError,
    VectorStore,
    build_corpus,
    cosine,
    tokenize,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
SOURCES = ROOT / "spec" / "rag" / "sources.yaml"


@pytest.fixture(scope="module")
def corpus():
    return build_corpus(PACK, SOURCES)


@pytest.fixture(scope="module")
def index(corpus):
    return BM25Index(list(corpus.docs))


# --------------------------------------------------------------- tokenizer


def test_tokenizer_folds_bengali_digits_and_suffixes() -> None:
    assert tokenize("৫ কাঠা") == ["5", "কাঠা"]
    assert tokenize("অফিসের জন্য") == ["অফিস", "জন্য"]
    assert tokenize("জমিতে") == ["জমি"]
    assert tokenize("sides") == ["side"]
    assert tokenize("parking, 200 sqm.") == ["parking", "200", "sqm"]


def test_tokenizer_keeps_short_words_intact() -> None:
    assert tokenize("gas") == ["gas"]
    assert tokenize("class") == ["class"]


# --------------------------------------------------------------------- BM25


def test_bm25_finds_the_parking_row_for_an_office(index) -> None:
    hits = index.search("how many car parking for office", limit=5)
    assert hits
    assert hits[0].doc_id == "rajuk@2008.1:parking_row:park-office:en"


def test_bm25_matches_bengali_query_to_bengali_document(index) -> None:
    hits = index.search("অফিসের জন্য পার্কিং", limit=5)
    assert hits
    top = hits[0].doc_id
    assert ":bn" in top
    assert "park-office" in top or "schedule4-parking" in top


def test_bm25_returns_nothing_for_an_unrelated_query(index) -> None:
    assert index.search("supercalifragilistic") == []


def test_bm25_order_is_reproducible(corpus) -> None:
    docs = [doc for doc in corpus.docs if doc.entity_id == "far-a1a4"]
    tiny = BM25Index(docs)
    first = tiny.search("FAR", limit=2)
    second = tiny.search("FAR", limit=2)
    assert [hit.doc_id for hit in first] == [hit.doc_id for hit in second]
    assert first[0].score >= first[-1].score


def test_bm25_requires_a_non_empty_corpus() -> None:
    with pytest.raises(RagError, match="empty corpus"):
        BM25Index([])


def test_bm25_limit_must_be_positive(index) -> None:
    with pytest.raises(ValueError):
        index.search("FAR", limit=0)


# ------------------------------------------------------------ hash embedder


def test_hashing_embedder_is_deterministic_and_unit_length() -> None:
    embedder = HashingEmbedder(dim=64)
    first = embedder.embed(["5 katha plot FAR", "5 katha plot FAR"])
    assert first[0] == first[1]
    assert len(first[0]) == 64
    assert abs(sum(value * value for value in first[0]) - 1.0) < 1e-6
    assert embedder.embed(["different text"])[0] != first[0]


def test_hashing_embedder_prefers_related_text() -> None:
    embedder = HashingEmbedder(dim=256)
    query, near, far = embedder.embed(["side setback", "mandatory side setback from boundary", "car parking spaces"])
    assert cosine(query, near) > cosine(query, far)


def test_hashing_embedder_rejects_a_tiny_dimension() -> None:
    with pytest.raises(ValueError):
        HashingEmbedder(dim=8)


# ---------------------------------------------------------- llama transports


def test_llama_embedder_requires_loopback() -> None:
    with pytest.raises(RagError, match="loopback"):
        LlamaEmbedder(base_url="http://192.168.1.10:8787")


def test_llama_embedder_normalises_and_names_its_request() -> None:
    calls = []

    def fake_post(url, body):
        calls.append((url, body))
        return {"data": [{"embedding": [3.0, 4.0]}, {"embedding": [0.0, 2.0]}]}

    embedder = LlamaEmbedder(base_url="http://127.0.0.1:8787", post=fake_post)
    vectors = embedder.embed(["a", "b"])
    assert calls[0][0] == "http://127.0.0.1:8787/v1/embeddings"
    assert calls[0][1] == {"model": "embed", "input": ["a", "b"], "encoding_format": "float"}
    assert vectors == [[0.6, 0.8], [0.0, 1.0]]
    assert embedder.dim == 2


def test_llama_embedder_rejects_partial_and_ragged_responses() -> None:
    partial = LlamaEmbedder(
        base_url="http://127.0.0.1:8787", post=lambda url, body: {"data": [{"embedding": [1.0]}]}
    )
    with pytest.raises(RagError, match="batch"):
        partial.embed(["a", "b"])
    ragged = LlamaEmbedder(
        base_url="http://127.0.0.1:8787",
        post=lambda url, body: {"data": [{"embedding": [1.0]}, {"embedding": [1.0, 2.0]}]},
    )
    with pytest.raises(RagError, match="inconsistent"):
        ragged.embed(["a", "b"])


def test_llama_reranker_maps_scores_by_index(corpus) -> None:
    docs = [doc for doc in corpus.docs if doc.kind == "provision" and doc.lang == "en"][:3]
    seen = {}

    def fake_post(url, body):
        seen["url"] = url
        assert body["top_n"] == len(docs)
        assert body["model"] == "rerank"
        return {
            "results": [
                {"index": 2, "relevance_score": 0.9},
                {"index": 0, "relevance_score": 0.1},
                {"index": 1, "relevance_score": 0.5},
            ]
        }

    reranker = LlamaReranker(base_url="http://localhost:8787", post=fake_post)
    assert reranker.rerank("setback", docs) == [0.1, 0.5, 0.9]
    assert seen["url"] == "http://localhost:8787/v1/rerank"


def test_llama_reranker_refuses_incomplete_or_invalid_scores(corpus) -> None:
    docs = [doc for doc in corpus.docs if doc.kind == "provision" and doc.lang == "en"][:2]
    missing = LlamaReranker(
        base_url="http://127.0.0.1:8787",
        post=lambda url, body: {"results": [{"index": 0, "relevance_score": 0.5}]},
    )
    with pytest.raises(RagError, match="every candidate"):
        missing.rerank("setback", docs)
    duplicate = LlamaReranker(
        base_url="http://127.0.0.1:8787",
        post=lambda url, body: {
            "results": [
                {"index": 0, "relevance_score": 0.5},
                {"index": 0, "relevance_score": 0.5},
            ]
        },
    )
    with pytest.raises(RagError, match="index"):
        duplicate.rerank("setback", docs)
    non_numeric = LlamaReranker(
        base_url="http://127.0.0.1:8787",
        post=lambda url, body: {
            "results": [
                {"index": 0, "relevance_score": "high"},
                {"index": 1, "relevance_score": 0.2},
            ]
        },
    )
    with pytest.raises(RagError, match="non-numeric"):
        non_numeric.rerank("setback", docs)


def test_llama_reranker_requires_loopback() -> None:
    with pytest.raises(RagError, match="loopback"):
        LlamaReranker(base_url="https://example.com")


def test_lexical_reranker_ignores_english_function_words(corpus) -> None:
    reranker = LexicalReranker()
    table = next(doc for doc in corpus.docs if doc.entity_id == "s46-setbacks" and doc.lang == "en")
    baseline = reranker.score("side setback", table)
    padded = reranker.score("what is the side setback", table)
    assert padded == baseline


def test_lexical_reranker_prefers_exact_clause_match(corpus) -> None:
    reranker = LexicalReranker()
    table = next(doc for doc in corpus.docs if doc.entity_id == "s46-setbacks" and doc.lang == "en")
    other = next(doc for doc in corpus.docs if doc.entity_id == "s57-mixed-use" and doc.lang == "en")
    assert reranker.score("§46(1)-(2) setback", table) > reranker.score("§46(1)-(2) setback", other)


# ------------------------------------------------------------- vector cache


def test_vector_store_round_trip_and_invalidation(tmp_path, corpus) -> None:
    embedder = HashingEmbedder(dim=32)
    docs = [doc.id for doc in corpus.docs]
    vectors = {doc.id: embedder.embed([doc.text])[0] for doc in corpus.docs}
    store = VectorStore(tmp_path)
    assert store.load(corpus.sha256, embedder, docs) is None
    store.save(corpus.sha256, embedder, docs, vectors)
    assert store.load(corpus.sha256, embedder, docs) == vectors
    assert store.load("0" * 64, embedder, docs) is None
    other = HashingEmbedder(dim=32)
    other.name = "different"
    assert store.load(corpus.sha256, other, docs) is None


def test_vector_store_without_a_root_never_persists(corpus) -> None:
    store = VectorStore()
    embedder = HashingEmbedder(dim=32)
    docs = [doc.id for doc in corpus.docs]
    assert store.load(corpus.sha256, embedder, docs) is None
    store.save(corpus.sha256, embedder, docs, {})  # no-op, must not raise
