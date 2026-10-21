"""The rule-pack vectors must follow the packs (W4.6), so a city pack arrives gated.

The plan's section 9 guard is "rule-pack test vectors" in CI ✓ - and today it is one pack
wired into the code ✓. W4.5 adds the city packs (Chattogram, then Khulna/Rajshahi/Sylhet) ✓,
and a pack whose numbers nobody checks is a pack whose numbers are guesses ✓ ✓.

So the pack set is **discovered** ✓: every pack in ``spec/rules/`` is loaded ✓, every pack's
vectors become cases ✓, and each case is scored against **its own** pack ✓ ✓.

These tests hold it:

1. the pack set is discovered ✓, and a second pack brings its own vectors ✓;
2. a pack with **no vectors** is an error ✓, not a silent pass ✓;
3. two packs may use the same vector name ✓ (the case id carries the pack ✓), but a pack may
   not carry the same vector twice ✓.
"""

from __future__ import annotations

import pathlib

import pytest
import yaml

from archres_core.eval.build import (
    build_rule_cases,
    build_rule_cases_for_packs,
    load_pack_set,
)
from archres_core.eval.cases import EvalError

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK_DIR = ROOT / "spec" / "rules"


def _pack_document() -> dict:
    document = yaml.safe_load((PACK_DIR / "rajuk-2008.yaml").read_text(encoding="utf-8"))
    return document


def _write_pack(path: pathlib.Path, document: dict) -> None:
    path.write_text(
        yaml.safe_dump(document, allow_unicode=True, sort_keys=False), encoding="utf-8"
    )


def test_the_pack_set_is_discovered() -> None:
    """The pack set is the directory, not a constant."""
    packs = load_pack_set(PACK_DIR)
    assert packs
    assert {str(pack["id"]) for pack in packs} == {
        "rajuk@2008.1"
    }, "the committed pack set is one pack; a second one must be discovered, not configured"


def test_a_second_pack_brings_its_own_vectors(tmp_path: pathlib.Path) -> None:
    """A city pack (W4.5) arrives with its vectors - and its own gate."""
    document = _pack_document()
    document["id"] = "testcity@2026.1"
    document["testVectors"] = (document.get("testVectors") or [])[:2]
    pack_dir = tmp_path / "rules"
    pack_dir.mkdir()
    _write_pack(pack_dir / "rajuk-2008.yaml", _pack_document())
    _write_pack(pack_dir / "test-city.yaml", document)

    packs = load_pack_set(pack_dir)
    assert {str(pack["id"]) for pack in packs} == {"rajuk@2008.1", "testcity@2026.1"}

    cases = build_rule_cases_for_packs(packs)
    by_pack: dict[str, list[str]] = {}
    for case in cases:
        by_pack.setdefault(str(case.source["pack"]), []).append(case.id)
    assert len(by_pack["testcity@2026.1"]) == 2
    assert len(by_pack["rajuk@2008.1"]) == len(_pack_document()["testVectors"])
    # and the ids are pack-qualified, so the two packs may use the same vector name
    assert all(case.id.startswith(f"rule.vector:{case.source['pack']}:") for case in cases)


def test_a_pack_with_no_vectors_is_an_error(tmp_path: pathlib.Path) -> None:
    """A pack whose numbers nobody checks is a pack whose numbers are guesses."""
    document = _pack_document()
    document["id"] = "novectors@2026.1"
    document["testVectors"] = []
    pack_dir = tmp_path / "rules"
    pack_dir.mkdir()
    _write_pack(pack_dir / "novectors.yaml", document)

    packs = load_pack_set(pack_dir)
    with pytest.raises(EvalError, match="no test vectors"):
        build_rule_cases(packs[0])


def test_two_packs_may_use_the_same_vector_name(tmp_path: pathlib.Path) -> None:
    """The vector ids are the pack's own names; the case id carries the pack."""
    document = _pack_document()
    document["id"] = "same@2026.1"
    document["testVectors"] = (document.get("testVectors") or [])[:1]
    pack_dir = tmp_path / "rules"
    pack_dir.mkdir()
    _write_pack(pack_dir / "rajuk-2008.yaml", _pack_document())
    _write_pack(pack_dir / "same.yaml", document)

    packs = load_pack_set(pack_dir)
    cases = build_rule_cases_for_packs(packs)
    ids = [case.id for case in cases]
    assert len(ids) == len(set(ids)), "the case ids must be unique across the pack set"


def test_a_pack_may_not_carry_the_same_vector_twice(tmp_path: pathlib.Path) -> None:
    """Within one pack, the vectors must be unique - or the gate would count one twice."""
    document = _pack_document()
    vectors = (document.get("testVectors") or [])[:2]
    document["testVectors"] = [vectors[0], dict(vectors[0])]
    pack_dir = tmp_path / "rules"
    pack_dir.mkdir()
    _write_pack(pack_dir / "dupes.yaml", document)

    packs = load_pack_set(pack_dir)
    with pytest.raises(EvalError, match="twice"):
        build_rule_cases_for_packs(packs)


def test_every_committed_pack_has_vectors() -> None:
    """The pack set the repo ships is gated, vector by vector."""
    for pack in load_pack_set(PACK_DIR):
        cases = build_rule_cases(pack)
        assert cases, f"the pack {pack['id']} carries no test vectors"
