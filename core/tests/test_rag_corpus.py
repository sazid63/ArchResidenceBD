"""RAG corpus (W1.1): every document is derived, cited and reproducible."""

from __future__ import annotations

import json
import pathlib

import pytest
import yaml

from archres_core.rag import (
    RagError,
    build_corpus,
    load_corpus,
    manifest,
    write_corpus,
)
from archres_core.rag.corpus import corpus_bytes

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
SOURCES = ROOT / "spec" / "rag" / "sources.yaml"
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
MANIFEST = ROOT / "spec" / "rag" / "rajuk-2008.manifest.json"


@pytest.fixture(scope="module")
def corpus():
    return build_corpus(PACK, SOURCES)


@pytest.fixture(scope="module")
def pack() -> dict:
    return yaml.safe_load(PACK.read_text(encoding="utf-8"))


# ------------------------------------------------------------------- shape


def test_corpus_covers_every_pack_entity_kind(corpus, pack) -> None:
    kinds = {doc.kind for doc in corpus.docs}
    assert kinds == {
        "provision",
        "far_table",
        "setback_table",
        "parking_schedule",
        "parking_row",
        "parking_note",
        "geometry_rule",
        "footnote",
        "declared_gap",
    }
    assert {doc.lang for doc in corpus.docs} == {"bn", "en"}
    assert len(corpus.docs) == 186
    assert corpus.counts()["byKind"]["provision"] == 2 * len(pack["provisions"])


def test_every_provision_has_both_languages(corpus, pack) -> None:
    for provision in pack["provisions"]:
        docs = [doc for doc in corpus.docs if doc.entity_id == provision["id"]]
        assert {doc.lang for doc in docs} == {"bn", "en"}
        assert all(doc.kind == "provision" for doc in docs)
        for doc in docs:
            assert provision["summary"][doc.lang].strip() in doc.text


def test_documents_are_ordered_and_unique(corpus) -> None:
    ids = [doc.id for doc in corpus.docs]
    assert ids == sorted(ids)
    assert len(ids) == len(set(ids))


def test_text_is_never_empty(corpus) -> None:
    assert all(doc.text.strip() for doc in corpus.docs)
    assert all(doc.text_kind in {"gazette_quote", "pack_summary", "pack_note", "declared_gap"} for doc in corpus.docs)


# --------------------------------------------------------------- citations


def test_every_law_document_carries_a_gazette_citation(corpus, pack) -> None:
    citations = pack["citations"]
    for doc in corpus.docs:
        if doc.text_kind == "declared_gap":
            assert doc.citation is None
            continue
        assert doc.citation is not None, doc.id
        assert doc.citation["gazettePage"]
        assert doc.citation["pdfPage"]
        assert doc.citation["tier"] in {"page-image", "text-layer"}
        key = doc.citation["citeKey"]
        assert citations[key]["gazettePage"] == doc.citation["gazettePage"]


def test_footnotes_are_transcribed_gazette_wording(corpus) -> None:
    footnotes = [doc for doc in corpus.docs if doc.kind == "footnote"]
    assert len(footnotes) == 20
    assert all(doc.text_kind == "gazette_quote" for doc in footnotes)
    assert all(doc.citation["citeKey"].endswith("-fn") for doc in footnotes)


def test_provision_text_is_labelled_a_summary_not_gazette_wording(corpus) -> None:
    provisions = [doc for doc in corpus.docs if doc.kind == "provision"]
    assert provisions
    assert all(doc.text_kind == "pack_summary" for doc in provisions)


def test_every_pack_gap_is_retrievable_as_a_declared_gap(corpus, pack) -> None:
    gaps = {gap["id"] for gap in pack["gaps"]}
    docs = [doc for doc in corpus.docs if doc.kind == "declared_gap"]
    assert {doc.entity_id for doc in docs} == gaps
    assert len(docs) == 2 * len(gaps)
    assert all(doc.citation is None for doc in docs)


def test_uncited_entity_refuses_to_become_a_document(tmp_path, pack) -> None:
    broken = json.loads(json.dumps(pack))
    broken["provisions"][0]["cite"] = "no-such-citation"
    path = tmp_path / "pack.yaml"
    path.write_text(yaml.safe_dump(broken, allow_unicode=True), encoding="utf-8")
    with pytest.raises(RagError, match="no-such-citation"):
        build_corpus(path, SOURCES)


def test_missing_pack_is_a_rag_error(tmp_path) -> None:
    with pytest.raises(RagError, match="not found"):
        build_corpus(tmp_path / "absent.yaml", SOURCES)


# ---------------------------------------------------------------- coverage


def test_declared_sources_make_missing_references_explicit(corpus) -> None:
    missing = {entry["id"]: entry for entry in corpus.missing}
    assert set(missing) == {
        "bnbc-2020-core",
        "rajuk-appendix5-definitions",
        "city-authority-rules-chattogram-khulna-rajshahi-sylhet",
    }
    assert all(entry["status"] == "not_ingested" and entry["reason"] for entry in missing.values())
    assert corpus.coverage["sourcesIngested"] == 1
    assert corpus.coverage["sourcesMissing"] == 3


def test_coverage_counts_provisions_and_unused_citations(corpus, pack) -> None:
    coverage = corpus.coverage
    assert coverage["provisions"] == len(pack["provisions"])
    assert coverage["provisionsWithDocs"] == len(pack["provisions"])
    assert coverage["citationsUsed"] <= coverage["citationsDeclared"]
    assert set(coverage["citationsUnused"]) <= set(pack["citations"])
    assert coverage["declaredGapsInCorpus"] == coverage["declaredGapsInPack"]


def test_source_list_refuses_an_unexplained_missing_reference(tmp_path) -> None:
    path = tmp_path / "sources.yaml"
    path.write_text(
        yaml.safe_dump({"sources": [{"id": "x", "status": "not_ingested"}]}), encoding="utf-8"
    )
    with pytest.raises(RagError, match="reason"):
        build_corpus(PACK, path)


def test_source_list_refuses_an_ingested_entry_without_a_pack(tmp_path) -> None:
    path = tmp_path / "sources.yaml"
    path.write_text(yaml.safe_dump({"sources": [{"id": "x", "status": "ingested"}]}), encoding="utf-8")
    with pytest.raises(RagError, match="pack"):
        build_corpus(PACK, path)


# --------------------------------------------------------- table rendering


def test_far_table_text_exposes_katha_and_road_width_bounds(corpus) -> None:
    table = next(doc for doc in corpus.docs if doc.entity_id == "far-a1a4" and doc.lang == "en")
    assert "katha" in table.text and "FAR by road width" in table.text
    assert "6 m:" in table.text and "24 m:" in table.text
    assert table.meta["rowCount"] == len(table.meta["rows"])


def test_parking_row_text_names_the_vehicle_and_ratio(corpus) -> None:
    office = next(doc for doc in corpus.docs if doc.entity_id == "park-office" and doc.lang == "en")
    assert "Schedule 4 parking" in office.text
    assert "1 car space per 200 sqm gross area" in office.text
    bengali = next(doc for doc in corpus.docs if doc.entity_id == "park-office" and doc.lang == "bn")
    assert "কার" in bengali.text and "২০০" in bengali.text


# ------------------------------------------------------------- determinism


def test_corpus_bytes_are_stable_across_builds(corpus) -> None:
    again = build_corpus(PACK, SOURCES)
    assert corpus_bytes(corpus.docs) == corpus_bytes(again.docs)
    assert corpus.sha256 == again.sha256


def test_write_and_load_round_trip(corpus, tmp_path) -> None:
    path = tmp_path / "corpus.jsonl"
    result = write_corpus(corpus, path)
    assert result["documents"] == len(corpus.docs)
    loaded = load_corpus(path)
    assert [doc.id for doc in loaded.docs] == [doc.id for doc in corpus.docs]
    assert loaded.pack_sha256 == corpus.pack_sha256
    assert loaded.sha256 == corpus.sha256


def test_a_corpus_without_the_naming_convention_has_no_guessed_manifest(corpus, tmp_path) -> None:
    """A sidecar is guessed only for ``*.corpus.jsonl``; anything else is its own file.

    The naive ``str.replace`` form left ``corpus.jsonl`` unchanged, so the corpus was
    re-read as its own manifest and failed with "not valid JSON".
    """
    path = tmp_path / "corpus.jsonl"
    write_corpus(corpus, path)
    loaded = load_corpus(path)
    assert loaded.manifest is None
    assert loaded.sources == () and loaded.missing == ()
    # an explicit path still works when the caller knows where it is
    sidecar = tmp_path / "corpus.manifest.json"
    sidecar.write_text(
        json.dumps(manifest(corpus, corpus_sha=corpus.sha256, corpus_bytes_count=1)),
        encoding="utf-8",
    )
    with_sidecar = load_corpus(path, sidecar)
    assert with_sidecar.manifest is not None


def test_load_rejects_an_unusable_line(tmp_path) -> None:
    path = tmp_path / "bad.jsonl"
    path.write_text('{"id": "x"}\n', encoding="utf-8")
    with pytest.raises(RagError, match="unusable"):
        load_corpus(path)


def test_manifest_pins_the_pack_and_declares_missing_sources(corpus) -> None:
    payload = corpus_bytes(corpus.docs)
    data = manifest(corpus, corpus_sha=corpus.sha256, corpus_bytes_count=len(payload))
    assert data["packId"] == "rajuk@2008.1"
    assert data["packSha256"] == corpus.pack_sha256
    assert data["documents"] == len(corpus.docs)
    assert data["corpusSha256"] == corpus.sha256
    assert len(data["missing"]) == 3
    assert data["byTextKind"]["gazette_quote"] == 20


def test_committed_corpus_and_manifest_are_fresh() -> None:
    built = build_corpus(PACK, SOURCES)
    payload = corpus_bytes(built.docs)
    assert CORPUS.is_file(), "spec/rag corpus is missing - run tools/rag/build_corpus.py"
    assert CORPUS.read_bytes() == payload
    sidecar = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert sidecar["corpusSha256"] == built.sha256
    assert sidecar["packSha256"] == built.pack_sha256
    assert sidecar["documents"] == len(built.docs)
