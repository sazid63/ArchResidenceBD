"""Law desk (W1.9): a cited answer, a declared gap, or an honest refusal - never a guess."""

from __future__ import annotations

import pathlib
import re

import pytest

from archres_core.agent import LawAnswer, LawDesk
from archres_core.agent.law import DECLARED_GAP, NOT_IN_CORPUS, STATUSES
from archres_core.rag import HashingEmbedder, LexicalReranker, service_from_paths
from archres_core.rag.service import Hit, SearchResult

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
BENGALI = re.compile(r"[\u0980-\u09ff]")

SETBACK_EN = "What is the minimum setback from the plot boundary?"
SETBACK_BN = "প্লটের সীমানা থেকে সর্বনিম্ন কতটুকু ছাড় দিতে হবে?"
GAP_EN = "What is the minimum ceiling height of a habitable room?"
GAP_BN = "বসবাসযোগ্য ঘরের ন্যূনতম জায়গার চাহিদা কী?"


@pytest.fixture(scope="module")
def desk() -> LawDesk:
    return LawDesk(
        service_from_paths(CORPUS, embedder=HashingEmbedder(), reranker=LexicalReranker())
    )


class StubService:
    """The seam a real search fills: used to force the refusals a good corpus never shows."""

    def __init__(self, result: SearchResult) -> None:
        self._result = result

    def search(self, query: str, *, k: int = 5) -> SearchResult:
        return self._result

    def render_context(self, hits) -> str:
        if not hits:
            return "No clause was retrieved; do not answer from memory."
        return "\n\n".join(f"[{number}] {hit.text}" for number, hit in enumerate(hits, start=1))


def _empty_result(query: str, *, degraded: tuple[str, ...] = ()) -> SearchResult:
    return SearchResult(
        query=query,
        lang="en",
        hits=(),
        pack_id="rajuk@2008.1",
        pack_version="0.1.0",
        pack_sha256="0" * 64,
        corpus_documents=178,
        embedder="hash-v2",
        reranker="lexical",
        degraded=degraded,
    )


# ------------------------------------------------------------------- retrieved


@pytest.mark.parametrize("query", [SETBACK_EN, SETBACK_BN])
def test_a_covered_question_is_retrieved_with_pinned_citations(desk, query) -> None:
    answer = desk.ask(query)
    assert answer.status == "retrieved"
    assert answer.hits
    assert answer.citations
    for citation in answer.citations:
        assert citation.get("gazettePage"), "a handed-out citation must name a page"
    assert answer.context
    assert not answer.degraded


def test_the_answer_language_follows_the_script_of_the_question(desk) -> None:
    assert desk.ask(SETBACK_BN).lang == "bn"
    assert desk.ask(SETBACK_EN).lang == "en"


def test_the_retrieved_text_is_the_citation_block(desk) -> None:
    answer = desk.ask(SETBACK_EN)
    assert answer.text == answer.context
    assert "Source:" in answer.text


# ---------------------------------------------------------------- declared_gap


@pytest.mark.parametrize("query", [GAP_EN, GAP_BN])
def test_a_declared_gap_is_stated_not_answered(desk, query) -> None:
    answer = desk.ask(query)
    assert answer.status == "declared_gap"
    lang = answer.lang
    assert answer.text.startswith(DECLARED_GAP[lang])
    gap = answer.hits[0]
    assert gap.kind == "declared_gap"
    assert gap.citation is None, "a gap document must not carry a clause or page"
    assert gap.text in answer.text


def test_no_citation_is_invented_for_a_gap(desk) -> None:
    answer = desk.ask(GAP_EN)
    assert all(citation.get("gazettePage") for citation in answer.citations)
    gap_citations = [c for c in answer.citations if c.get("clause") == answer.hits[0].clause]
    assert not gap_citations


# ------------------------------------------------------------------- not_found


def test_no_hits_means_an_honest_refusal() -> None:
    stub = StubService(_empty_result(SETBACK_EN))
    answer = LawDesk(stub).ask(SETBACK_EN)
    assert answer.status == "not_found"
    assert answer.status in STATUSES
    assert answer.hits == ()
    assert answer.citations == ()
    assert answer.text == NOT_IN_CORPUS["en"]


def test_the_refusal_is_bangla_for_a_bangla_question() -> None:
    stub = StubService(_empty_result(SETBACK_BN))  # the stub even mislabels the language
    answer = LawDesk(stub).ask(SETBACK_BN)
    assert answer.status == "not_found"
    assert answer.text == NOT_IN_CORPUS["bn"]
    assert BENGALI.search(answer.text)


def test_a_caller_can_ask_for_the_other_language() -> None:
    stub = StubService(_empty_result(SETBACK_EN))
    answer = LawDesk(stub).ask(SETBACK_EN, lang="bn")
    assert answer.text == NOT_IN_CORPUS["bn"]


def test_the_notices_are_hand_written_in_both_languages() -> None:
    for table in (NOT_IN_CORPUS, DECLARED_GAP):
        assert set(table) == {"bn", "en"}
        assert BENGALI.search(table["bn"]), "the Bangla notice must be Bangla, not English"
        assert not BENGALI.search(table["en"])
    assert NOT_IN_CORPUS["en"] != NOT_IN_CORPUS["bn"]


def test_degradation_travels_with_the_answer() -> None:
    stub = StubService(_empty_result(SETBACK_EN, degraded=("dense:down", "rerank:no signal")))
    answer = LawDesk(stub).ask(SETBACK_EN)
    assert answer.degraded == ("dense:down", "rerank:no signal")


# ---------------------------------------------------------------------- payload


def test_the_answer_serialises_for_a_transcript(desk) -> None:
    answer = desk.ask(SETBACK_EN)
    assert isinstance(answer, LawAnswer)
    payload = answer.to_dict()
    assert set(payload) == {
        "question",
        "lang",
        "status",
        "docIds",
        "citations",
        "text",
        "context",
        "degraded",
    }
    assert payload["docIds"] == [hit.doc_id for hit in answer.hits]
    assert payload["question"] == SETBACK_EN
    assert payload["degraded"] == []


def test_the_desk_does_not_rewrite_the_query(desk) -> None:
    answer = desk.ask("  " + SETBACK_EN + "  ")
    assert answer.question == "  " + SETBACK_EN + "  "
    assert answer.status == "retrieved"
