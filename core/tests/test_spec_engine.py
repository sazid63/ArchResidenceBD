"""W1.3 spec engine: JSON-pointers, canonical hash, patch law, revision store."""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.spec import (
    PointerError,
    SpecPatchError,
    SpecStore,
    SpecStoreError,
    SpecValidationError,
    apply_patch,
    diff_specs,
    escape_token,
    parse_pointer,
    resolve,
    spec_sha256,
    validate_spec,
)
from archres_core.spec import pointers as ptr

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "spec" / "examples"

# Pinned canonical hashes (W1.3 fixpoint: canonical form + op semantics + provenance shape).
NEW_PROJECT_SHA256 = "9e583b0f092702db133d46316855b94cc6ddf8304880915bb575f9ac61024d6d"
SOIL_PATCH_SHA256 = "d9dc98dd9f9de0af589e3b0ccb14851a49bb24e7b6422d1302e8108a82594c03"

SOIL_PATCH = [
    {"op": "replace", "path": "/site/soil/status", "value": "user_report"},
    {"op": "replace", "path": "/site/soil/sbcKpa", "value": 120},
]
SOIL_PROVENANCE = {"source": "user", "detail": "soil test report uploaded (doc sbc-2026-10)", "confidence": "high"}
SOIL_PATCH_AT = "2026-10-18T09:00:00+06:00"
AT = "2026-10-18T09:00:00+06:00"


@pytest.fixture(scope="module")
def spec() -> dict:
    return json.loads((EXAMPLES / "new-project.json").read_text(encoding="utf-8"))


# --- RFC 6901 pointers ------------------------------------------------------


def test_parse_pointer_basics() -> None:
    assert parse_pointer("") == []
    assert parse_pointer("/a/b") == ["a", "b"]
    assert parse_pointer("/") == [""]
    assert parse_pointer("//x") == ["", "x"]


def test_parse_pointer_escapes() -> None:
    assert parse_pointer("/a~1b/c~0d") == ["a/b", "c~d"]
    assert escape_token("a/b~c") == "a~1b~0c"


def test_parse_pointer_rejects_garbage() -> None:
    for bad in ("a/b", "/a~2b", "/a~"):
        with pytest.raises(PointerError):
            parse_pointer(bad)


def test_resolve_walks_dicts_and_lists(spec: dict) -> None:
    assert resolve(spec, "/site/soil/status") == "area_default"
    assert resolve(spec, "/phases/0/id") == "site-excavation"
    assert resolve(spec, "")["project"]["name"] == "Project 1"


def test_resolve_errors(spec: dict) -> None:
    with pytest.raises(PointerError):
        resolve(spec, "/site/soil/nope")
    with pytest.raises(PointerError):
        resolve(spec, "/phases/-")
    with pytest.raises(PointerError):
        resolve(spec, "/phases/00")
    with pytest.raises(PointerError):
        resolve(spec, "/phases/999")
    with pytest.raises(PointerError):
        resolve(spec, "/site/plot/areaSqm/x")


def test_add_replace_remove_semantics() -> None:
    doc = {"a": {"b": [1, 2]}, "x": 0}
    assert ptr.add(doc, "/a/c", 5)["a"]["c"] == 5
    ptr.add(doc, "/a/b/-", 3)
    ptr.add(doc, "/a/b/0", 9)
    assert doc["a"]["b"] == [9, 1, 2, 3]
    assert ptr.replace(doc, "/x", 7)["x"] == 7
    with pytest.raises(PointerError):
        ptr.replace(doc, "/missing", 1)
    assert ptr.remove(doc, "/a/b/0") == 9
    assert doc["a"]["b"] == [1, 2, 3]
    with pytest.raises(PointerError):
        ptr.remove(doc, "/missing")


def test_root_operations() -> None:
    assert ptr.add({"a": 1}, "", {"b": 2}) == {"b": 2}
    assert ptr.replace({"a": 1}, "", 5) == 5
    with pytest.raises(PointerError):
        ptr.remove({"a": 1}, "")


# --- validation + canonical hash -------------------------------------------


@pytest.mark.parametrize("name", ["new-project.json", "two-storey-residential.json", "three-storey-with-soil-report.json"])
def test_examples_validate(name: str) -> None:
    validate_spec(json.loads((EXAMPLES / name).read_text(encoding="utf-8")))


def test_validate_rejects_bad_spec(spec: dict) -> None:
    bad = json.loads(json.dumps(spec))
    bad["phases"][0]["status"] = "banana"
    with pytest.raises(SpecValidationError):
        validate_spec(bad)


def test_canonical_hash_is_pinned(spec: dict) -> None:
    assert spec_sha256(spec) == NEW_PROJECT_SHA256


def test_canonical_hash_is_formatting_independent(spec: dict) -> None:
    variant = json.loads(json.dumps(spec, indent=4, sort_keys=True, ensure_ascii=True))
    assert spec_sha256(variant) == NEW_PROJECT_SHA256


def test_hash_detects_change(spec: dict) -> None:
    changed = json.loads(json.dumps(spec))
    changed["building"]["storeys"]["count"] = 6
    assert spec_sha256(changed) != NEW_PROJECT_SHA256


# --- patch law ---------------------------------------------------------------


def test_patch_is_pure_and_records_provenance(spec: dict) -> None:
    patched = apply_patch(spec, SOIL_PATCH, provenance=SOIL_PROVENANCE, at=SOIL_PATCH_AT)
    assert spec["site"]["soil"]["status"] == "area_default" and spec["site"]["soil"]["sbcKpa"] == 65
    assert patched["site"]["soil"]["status"] == "user_report" and patched["site"]["soil"]["sbcKpa"] == 120
    entry = patched["provenance"]["/site/soil/sbcKpa"]
    assert entry == {"source": "user", "detail": SOIL_PROVENANCE["detail"], "at": SOIL_PATCH_AT, "confidence": "high"}
    assert patched["provenance"]["/site/soil/status"] == entry
    validate_spec(patched)
    assert spec_sha256(patched) == SOIL_PATCH_SHA256


def test_patch_adds_into_open_phase_data(spec: dict) -> None:
    ops = [{"op": "add", "path": "/phases/0/data/setbackFrontM", "value": 1.5}]
    patched = apply_patch(spec, ops, provenance={"source": "engine", "detail": "restore-to-compliant"}, at=AT)
    assert patched["phases"][0]["data"]["setbackFrontM"] == 1.5
    validate_spec(patched)


def test_patch_can_remove_optional_fields(spec: dict) -> None:
    patched = apply_patch(
        spec,
        [{"op": "remove", "path": "/site/soil/note"}],
        provenance={"source": "user", "detail": "note cleared"},
        at=AT,
    )
    assert "note" not in patched["site"]["soil"]
    assert "note" in spec["site"]["soil"]


def test_patch_never_returns_partial_results(spec: dict) -> None:
    ops = list(SOIL_PATCH) + [{"op": "replace", "path": "/site/soil/sbcKpa", "value": -5}]
    with pytest.raises(SpecValidationError):
        apply_patch(spec, ops, provenance=SOIL_PROVENANCE, at=AT)
    with pytest.raises(SpecPatchError):
        apply_patch(spec, [{"op": "replace", "path": "/site/soil/nope", "value": 1}], provenance=SOIL_PROVENANCE, at=AT)
    assert spec["site"]["soil"]["status"] == "area_default"


def test_patch_refuses_reserved_paths(spec: dict) -> None:
    for path in ("/revision", "/locked", "/updatedAt"):
        with pytest.raises(SpecPatchError):
            apply_patch(spec, [{"op": "replace", "path": path, "value": 99}], provenance=SOIL_PROVENANCE, at=AT)


def test_patch_argument_errors(spec: dict) -> None:
    with pytest.raises(SpecPatchError):
        apply_patch(spec, [], provenance=SOIL_PROVENANCE, at=AT)
    with pytest.raises(SpecPatchError):
        apply_patch(spec, SOIL_PATCH, provenance={}, at=AT)
    with pytest.raises(SpecPatchError):
        apply_patch(spec, SOIL_PATCH, provenance={"source": "banana"}, at=AT)
    with pytest.raises(SpecPatchError):
        apply_patch(spec, [{"op": "add", "path": "/site/soil/status"}], provenance=SOIL_PROVENANCE, at=AT)
    with pytest.raises(SpecPatchError):
        apply_patch(spec, [{"op": "merge", "path": "/site/soil/status", "value": 1}], provenance=SOIL_PROVENANCE, at=AT)
    with pytest.raises(SpecPatchError):
        apply_patch(spec, [{"op": "replace", "path": 5, "value": 1}], provenance=SOIL_PROVENANCE, at=AT)


# --- diff ---------------------------------------------------------------------


def test_diff_reports_pointer_level_changes(spec: dict) -> None:
    patched = apply_patch(spec, SOIL_PATCH, provenance=SOIL_PROVENANCE, at=SOIL_PATCH_AT)
    rows = {row["path"]: row for row in diff_specs(spec, patched)}
    assert rows["/site/soil/status"]["before"] == "area_default"
    assert rows["/site/soil/status"]["after"] == "user_report"
    assert rows["/site/soil/sbcKpa"]["after"] == 120
    assert "/provenance/~1site~1soil~1status" in rows  # provenance keys are pointers: escaped in diff paths
    assert diff_specs(spec, spec) == []


def test_diff_reports_list_growth(spec: dict) -> None:
    patched = apply_patch(spec, [{"op": "add", "path": "/phases/0/data/x", "value": 1}], provenance=SOIL_PROVENANCE, at=AT)
    rows = diff_specs(spec, patched)
    assert {"path": "/phases/0/data/x", "after": 1} in rows


# --- revision store -----------------------------------------------------------


def test_store_create_and_load(tmp_path: pathlib.Path, spec: dict) -> None:
    store = SpecStore.create(tmp_path / "p1", spec, at=AT)
    tip = store.tip()
    assert tip.number == 0 and tip.parentSha256 is None and not tip.locked
    snapshot = store.load(tip.sha256)
    assert snapshot["revision"] == 0 and snapshot["updatedAt"] == AT
    assert (tmp_path / "p1" / "revisions" / f"{tip.sha256}.json").is_file()


def test_store_create_twice_is_refused(tmp_path: pathlib.Path, spec: dict) -> None:
    SpecStore.create(tmp_path / "p1", spec, at=AT)
    with pytest.raises(SpecStoreError):
        SpecStore.create(tmp_path / "p1", spec, at=AT)


def test_store_commit_chain(tmp_path: pathlib.Path, spec: dict) -> None:
    store = SpecStore.create(tmp_path / "p1", spec, at=AT)
    first = store.tip()
    rev1 = store.commit(first.sha256, SOIL_PATCH, provenance=SOIL_PROVENANCE, note="soil report", at="2026-10-18T09:05:00+06:00")
    assert rev1.number == 1 and rev1.parentSha256 == first.sha256 and rev1.ops == ("replace /site/soil/status", "replace /site/soil/sbcKpa")
    snapshot = store.load(rev1.sha256)
    assert snapshot["revision"] == 1 and snapshot["provenance"]["/site/soil/sbcKpa"]["source"] == "user"
    assert [r.number for r in store.revisions()] == [0, 1]
    assert store.tip().sha256 == rev1.sha256
    # stale parents cannot fork the history
    with pytest.raises(SpecStoreError):
        store.commit(first.sha256, SOIL_PATCH, provenance=SOIL_PROVENANCE, at=AT)
    # unknown revisions cannot be loaded
    with pytest.raises(SpecStoreError):
        store.load("0" * 64)
    # log shas stay unique
    shas = [r.sha256 for r in store.revisions()]
    assert len(shas) == len(set(shas))


def test_store_lock_blocks_commits_until_reopened(tmp_path: pathlib.Path, spec: dict) -> None:
    store = SpecStore.create(tmp_path / "p1", spec, at=AT)
    locked = store.lock(store.tip().sha256, at="2026-10-18T10:00:00+06:00")
    assert locked.locked and store.load(locked.sha256)["locked"] is True
    with pytest.raises(SpecStoreError):
        store.commit(locked.sha256, SOIL_PATCH, provenance=SOIL_PROVENANCE, at=AT)
    with pytest.raises(SpecStoreError):
        store.lock(locked.sha256, at=AT)  # already locked
    reopened = store.reopen(locked.sha256, at="2026-10-18T10:30:00+06:00")
    assert not reopened.locked and store.load(reopened.sha256)["locked"] is False
    rev = store.commit(reopened.sha256, SOIL_PATCH, provenance=SOIL_PROVENANCE, at=AT)
    assert rev.number == reopened.number + 1


def test_store_lock_and_reopen_require_tip(tmp_path: pathlib.Path, spec: dict) -> None:
    store = SpecStore.create(tmp_path / "p1", spec, at=AT)
    first = store.tip().sha256
    store.commit(first, [{"op": "replace", "path": "/site/soil/status", "value": "user_report"}], provenance=SOIL_PROVENANCE, at=AT)
    with pytest.raises(SpecStoreError):
        store.lock(first, at=AT)
    with pytest.raises(SpecStoreError):
        store.reopen(store.tip().sha256, at=AT)  # tip is not locked


def test_store_diff_between_revisions(tmp_path: pathlib.Path, spec: dict) -> None:
    store = SpecStore.create(tmp_path / "p1", spec, at=AT)
    first = store.tip()
    rev1 = store.commit(first.sha256, SOIL_PATCH, provenance=SOIL_PROVENANCE, at=AT)
    rows = {row["path"]: row for row in store.diff(first.sha256, rev1.sha256)}
    assert rows["/site/soil/sbcKpa"]["after"] == 120
    assert rows["/revision"]["after"] == 1
