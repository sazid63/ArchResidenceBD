"""RAG service (W1.1): hybrid search, citations, degradation and the pack-keyed clause cache."""

from __future__ import annotations

import dataclasses
import json
import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.rag import (
    HashingEmbedder,
    LexicalReranker,
    RagError,
    RagService,
    build_corpus,
    detect_lang,
    service_from_paths,
)
from archres_core.rag.service import ClauseCache

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
SOURCES = ROOT / "spec" / "rag" / "sources.yaml"
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"


@pytest.fixture(scope="module")
def corpus():
    return build_corpus(PACK, SOURCES)


@pytest.fixture()
def service(corpus):
    return RagService(corpus, embedder=HashingEmbedder(dim=128), reranker=LexicalReranker())


class BrokenReranker:
    name = "broken"

    def __init__(self, message: str = "router down"):
        self.message = message

    def rerank(self, query, documents):
        raise RagError(self.message)


class ShortReranker:
    name = "short"

    def rerank(self, query, documents):
        return [0.5]


class FlatReranker:
    """Reproduces the live llama.cpp pathology: near-zero, near-identical scores."""

    name = "flat"

    def rerank(self, query, documents):
        return [1.5e-7 for _ in documents]


class CountingEmbedder(HashingEmbedder):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.calls = 0

    def embed(self, texts):
        self.calls += 1
        return super().embed(texts)


# ------------------------------------------------------------------- search


def test_search_returns_cited_hits_for_an_english_query(service) -> None:
    result = service.search("side setback from boundary", k=5)
    assert result.hits
    assert result.pack_id == "rajuk@2008.1"
    assert result.lang == "en"
    assert all(hit.citation and hit.citation["gazettePage"] for hit in result.hits)
    assert any("setback" in hit.title.lower() for hit in result.hits)
    assert result.degraded == ()


def test_search_answers_a_named_parking_question(service) -> None:
    result = service.search("how many car parking for an office", k=3)
    assert result.hits[0].entity_id == "park-office"
    assert "200 sqm" in result.hits[0].text


def test_search_matches_a_bengali_query_to_bengali_clauses(service) -> None:
    result = service.search("অফিসের জন্য পার্কিং", k=4)
    assert result.lang == "bn"
    assert result.hits
    assert all(hit.lang == "bn" for hit in result.hits)


def test_search_orders_deterministically(service) -> None:
    first = service.search("5 katha plot FAR", k=6)
    second = service.search("5 katha plot FAR", k=6)
    assert [hit.doc_id for hit in first.hits] == [hit.doc_id for hit in second.hits]
    assert [hit.scores for hit in first.hits] == [hit.scores for hit in second.hits]


def test_search_respects_k_and_language_filter(service) -> None:
    assert len(service.search("parking", k=2).hits) <= 2
    english = service.search("parking", k=5, lang="en")
    assert english.hits and all(hit.lang == "en" for hit in english.hits)


def test_search_respects_kind_filter(service) -> None:
    result = service.search("parking", k=5, kinds=["parking_row"])
    assert result.hits
    assert {hit.kind for hit in result.hits} == {"parking_row"}


def test_search_returns_an_explanatory_empty_result(service) -> None:
    # punctuation-only text has no tokens and therefore a zero query vector: no hit can be
    # justified, and the result says why instead of returning the least-bad clause.
    result = service.search("!!! ???", k=3)
    assert result.hits == ()
    assert result.note == "no clause matched the query"
    assert result.corpus_documents == 186


def test_search_flags_a_declared_gap_hit(service) -> None:
    result = service.search("Appendix 5 definitions", k=4)
    assert any(hit.kind == "declared_gap" for hit in result.hits)
    assert "declared gap" in (result.note or "")


def test_search_rejects_bad_requests(service) -> None:
    with pytest.raises(RagError, match="query"):
        service.search("   ")
    with pytest.raises(ValueError, match="k"):
        service.search("parking", k=0)
    with pytest.raises(ValueError, match="lang"):
        service.search("parking", lang="fr")
    with pytest.raises(RagError, match="unknown document kinds"):
        service.search("parking", kinds=["nonsense"])


# --------------------------------------------------------------- degradation


def test_a_failed_rerank_is_visible_but_not_fatal(corpus) -> None:
    service = RagService(corpus, embedder=HashingEmbedder(dim=128), reranker=BrokenReranker())
    result = service.search("side setback", k=3)
    assert result.hits
    # the seam is named even when it fails: `degraded` says it changed nothing, the name
    # says which reranker was asked (lexical vs archie-rerank) - needed to read a live probe
    assert result.reranker == "broken"
    assert result.degraded == ("rerank:router down",)


def test_a_short_reranker_response_is_treated_as_degraded(corpus) -> None:
    service = RagService(corpus, embedder=HashingEmbedder(dim=128), reranker=ShortReranker())
    result = service.search("side setback", k=3)
    assert result.hits
    assert "different number of scores" in result.degraded[0]


def test_a_signal_free_rerank_is_rejected_as_degraded(corpus) -> None:
    float_service = RagService(corpus, embedder=HashingEmbedder(dim=128), reranker=FlatReranker())
    result = float_service.search("side setback", k=3)
    assert result.hits
    assert result.reranker == "flat"
    assert result.degraded and "no usable signal" in result.degraded[0]
    # the fused order is preserved instead of an arbitrary flat-score order
    without_rerank = RagService(corpus, embedder=HashingEmbedder(dim=128)).search(
        "side setback", k=3, rerank=False
    )
    assert [hit.doc_id for hit in result.hits] == [hit.doc_id for hit in without_rerank.hits]


def test_rerank_can_be_skipped(corpus) -> None:
    service = RagService(corpus, embedder=HashingEmbedder(dim=128), reranker=BrokenReranker())
    result = service.search("side setback", k=3, rerank=False)
    assert result.degraded == ()
    assert result.hits


# ------------------------------------------------------------------- caches


def test_query_vectors_are_embedded_once(corpus) -> None:
    embedder = CountingEmbedder(dim=128)
    service = RagService(corpus, embedder=embedder, reranker=LexicalReranker())
    service.search("side setback", k=3)
    service.search("side setback", k=3)
    assert embedder.calls == 2  # one document batch + one query


def test_clause_cache_reuses_citations_and_counts_hits(service) -> None:
    first = service.search("side setback", k=3)
    misses_after_first = service.cache.stats()["misses"]
    citation = service.citation(first.hits[0].doc_id)
    assert citation["citation"] == first.hits[0].citation
    assert service.cache.stats()["misses"] == misses_after_first
    service.search("side setback", k=3)
    assert service.cache.stats()["hits"] >= 1


def test_clause_cache_refuses_a_different_pack_pin(service) -> None:
    doc = service.corpus.docs[0]
    foreign = dataclasses.replace(doc, pack_sha256="0" * 64)
    with pytest.raises(RagError, match="different pack pin"):
        service.cache.get(foreign)


def test_unknown_clause_is_an_error(service) -> None:
    with pytest.raises(RagError, match="unknown clause"):
        service.clause("rajuk@2008.1:provision:nope:en")


def test_coverage_surfaces_missing_sources(service) -> None:
    coverage = service.coverage()
    assert coverage["packId"] == "rajuk@2008.1"
    assert {entry["id"] for entry in coverage["missing"]} == {
        "bnbc-2020-core",
        "rajuk-appendix5-definitions",
        "city-authority-rules-chattogram-khulna-rajshahi-sylhet",
    }


# ------------------------------------------------------------ prompt context


def test_render_context_names_the_source_kind_and_pack_pin(service) -> None:
    result = service.search("side setback", k=2)
    block = service.render_context(result.hits)
    assert "gazette p." in block
    assert "pack sha256" in block
    assert "app summary of the provision" in block


def test_render_context_marks_gazette_wording(service) -> None:
    footnote = service.search("24 m road portico", k=5, kinds=["footnote"]).hits[0]
    assert "gazette wording" in service.render_context([footnote])


def test_render_context_does_not_invent_a_page_for_a_gap(service) -> None:
    gap = service.search("Appendix 5 definitions", k=1, kinds=["declared_gap"]).hits[0]
    block = service.render_context([gap])
    assert "declared gap" in block
    assert "gazette p." not in block


def test_render_context_with_no_hits_forbids_memory(service) -> None:
    assert "do not answer from memory" in service.render_context([])


# -------------------------------------------------------------- entry points


def test_service_from_paths_loads_the_committed_corpus() -> None:
    service = service_from_paths(CORPUS, embedder=HashingEmbedder(dim=64))
    assert service.corpus.pack_id == "rajuk@2008.1"
    assert service.search("parking", k=1).hits


def test_service_from_paths_reports_a_missing_corpus(tmp_path) -> None:
    with pytest.raises(RagError, match="not found"):
        service_from_paths(tmp_path / "absent.jsonl")


def test_service_from_paths_requires_the_declared_reference_set(tmp_path) -> None:
    from archres_core.rag import write_corpus

    corpus = build_corpus(PACK, SOURCES)
    path = tmp_path / "rajuk-2008.corpus.jsonl"
    write_corpus(corpus, path)
    with pytest.raises(RagError, match="manifest"):
        service_from_paths(path)


def test_detect_lang() -> None:
    assert detect_lang("কাঠা কত") == "bn"
    assert detect_lang("5 katha") == "en"
    assert detect_lang("5 katha, ৫ শতাংশ") == "bn"


def test_clause_cache_stats_name_the_pack(service) -> None:
    service.search("parking", k=2)
    stats = service.cache.stats()
    assert stats["packId"] == "rajuk@2008.1"
    assert stats["packVersion"] == "0.1.0"
    assert stats["entries"] >= 1
    assert isinstance(service.cache, ClauseCache)


# ------------------------------------------------------------------- the CLI


def test_the_search_cli_survives_a_cp1252_console() -> None:
    """Clause text is Bangla; a captured cp1252 stdout used to raise UnicodeEncodeError."""
    env = dict(os.environ)
    env.update({"PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"})
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "tools" / "rag" / "search.py"),
            "side setback from boundary",
            "--k",
            "2",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=180,
    )
    assert result.returncode == 0, result.stderr
    assert "UnicodeEncodeError" not in result.stderr
    assert "hits" in result.stdout


def test_the_search_cli_reports_coverage_without_a_query() -> None:
    """`--coverage` is a corpus statement, not a search; it must not demand a question."""
    result = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "rag" / "search.py"), "--coverage"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
    )
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    assert payload["documents"] >= 1
    assert payload["referenceSet"] == "declared"

    missing = subprocess.run(
        [sys.executable, str(ROOT / "tools" / "rag" / "search.py")],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
    )
    assert missing.returncode == 2
    assert "--coverage" in missing.stderr
