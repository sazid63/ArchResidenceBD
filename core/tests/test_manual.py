"""The offline manual (W5.5): the app's own answers, with no network and no model.

The laws these tests hold:

- **every answer is sourced** — the flow question id or the pack's provision — so a user
  can check it;
- **the search is deterministic** — the same question always gives the same answer;
- **the search needs no model and no network** — it is term matching, and that is all;
- **silence is honest** — a query that matches nothing returns nothing, because a manual
  that invents an answer is worse than one that says "not found".
"""

from __future__ import annotations

import pathlib

import pytest

from archres_core.manual import (
    MANUAL_VERSION,
    ManualError,
    build_manual,
    manual_document,
    search_manual,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"


def _manual():
    return build_manual(BOOK, [PACK])


def test_the_manual_is_built_from_the_repo_s_facts() -> None:
    entries = _manual()
    assert entries
    # the flows' questions and the pack's provisions are in it
    ids = {entry.id for entry in entries}
    assert any(entry.startswith("ask-") for entry in ids)
    assert any(entry.startswith("flow-") for entry in ids)
    assert any(entry.startswith("rule-") for entry in ids)


def test_every_answer_is_sourced() -> None:
    """A user can check it; a support answer can point at it."""
    for entry in _manual():
        assert entry.source, entry.id
        assert entry.source_kind in ("flow", "rule")
        assert entry.id


def test_every_entry_is_in_both_languages() -> None:
    for entry in _manual():
        assert entry.question.get("en"), entry.id
        assert entry.question.get("bn"), entry.id
        assert entry.answer.get("en"), entry.id
        assert entry.answer.get("bn"), entry.id


def test_an_english_question_finds_its_answer() -> None:
    entries = _manual()
    hits = search_manual(entries, "what should we call this project", lang="en")
    assert hits
    top = hits[0][0]
    assert top.id == "ask-project-name"
    assert "drawings" in top.answer["en"].lower()


def test_a_bangla_question_finds_its_answer() -> None:
    """The product speaks Bangla; the manual does too."""
    entries = _manual()
    hits = search_manual(entries, "প্রকল্পের নাম", lang="bn")
    assert hits
    assert hits[0][0].id == "ask-project-name"


def test_a_rule_question_finds_the_provision() -> None:
    entries = _manual()
    hits = search_manual(entries, "FAR ground coverage table", lang="en")
    assert hits
    assert hits[0][0].source_kind == "rule"
    assert "rajuk@2008.1" in hits[0][0].source


def test_the_search_is_deterministic() -> None:
    """The same question always gives the same answer."""
    entries = _manual()
    first = [entry.id for entry, _score in search_manual(entries, "soil report", lang="en")]
    second = [entry.id for entry, _score in search_manual(entries, "soil report", lang="en")]
    assert first == second
    assert first


def test_a_question_that_matches_nothing_returns_nothing() -> None:
    """Silence is honest: a manual that invents an answer is worse than one that says so."""
    entries = _manual()
    assert search_manual(entries, "zzzz qqqq xxxx", lang="en") == []
    assert search_manual(entries, "", lang="en") == []
    assert search_manual(entries, "the", lang="en") == [], "the stopwords carry no meaning"


def test_the_manual_is_a_document() -> None:
    document = manual_document(_manual())
    assert document["version"] == MANUAL_VERSION
    assert document["counts"]["entries"] == len(document["entries"])
    assert document["counts"]["topics"] >= 1
    assert document["entries"][0]["source"]


def test_a_missing_source_is_an_error() -> None:
    with pytest.raises(ManualError):
        build_manual(ROOT / "spec" / "flows" / "nothing.yaml")
