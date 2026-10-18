"""W1.2 rule engine: frozen vector semantics, verdict sets, restore, register sync."""

from __future__ import annotations

import copy
import json
import pathlib
from collections import Counter

import pytest

from archres_core import compliance
from archres_core.compliance import CHECKS, ENGINE_ID, ComplianceError, RulePackError, tables
from archres_core.compliance import checks as compliance_checks
from archres_core.spec import apply_patch, spec_sha256

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "spec" / "examples"
PACK_PATH = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
VERDICT_EXAMPLE = EXAMPLES / "interfaces" / "verdict-set-example.json"

# Pinned pack file hash (W0.9 froze the same value in verdict-set-example.json).
PACK_SHA256 = "d50cce8c4f08246f8ed7ab6576f7ecbfc672e29d340510b799bf679a924551d1"
AT = "2026-10-18T10:02:00+06:00"

PACK = compliance.load_pack(PACK_PATH)
VECTORS = PACK["testVectors"]

# The full compliance run used across tests (new-project + every v0 design input).
FULL_INPUTS = [
    {"op": "add", "path": "/phases/0/data/setbackFrontM", "value": 1.2},
    {"op": "add", "path": "/phases/0/data/setbackRearM", "value": 2.0},
    {"op": "add", "path": "/phases/0/data/setbackSideLeftM", "value": 1.25},
    {"op": "add", "path": "/phases/0/data/setbackSideRightM", "value": 1.25},
    {"op": "add", "path": "/phases/0/data/plannedTotalFloorAreaSqm", "value": 1400},
    {"op": "add", "path": "/phases/0/data/parkingSpaces", "value": 1},
    {"op": "add", "path": "/building/typicalUnitAreaSqm", "value": 150},
]


def _spec() -> dict:
    return json.loads((EXAMPLES / "new-project.json").read_text(encoding="utf-8"))


def _patched(spec: dict, ops: list[dict], *, source: str = "user") -> dict:
    return apply_patch(spec, ops, provenance={"source": source}, at=AT)


def _evaluate(spec: dict, pack: dict | None = None) -> dict:
    return compliance.evaluate_spec(
        spec, pack or PACK, pack_path=PACK_PATH, evaluated_at=AT
    )


def _find(verdicts: list[dict], path: str) -> dict:
    return next(v for v in verdicts if (v.get("measured") or {}).get("path") == path)


# --- pack pinning -----------------------------------------------------------


def test_pack_pin_matches_frozen_hash() -> None:
    assert compliance.pack_sha256(PACK_PATH) == PACK_SHA256


def test_pack_pin_matches_verdict_example() -> None:
    example = json.loads(VERDICT_EXAMPLE.read_text(encoding="utf-8"))
    assert example["pack"]["sha256"] == PACK_SHA256
    assert example["pack"]["id"] == PACK["id"]


def test_pack_status_is_candidate() -> None:
    assert PACK["status"] == "candidate"


def test_rule_ref_form() -> None:
    assert compliance.rule_ref(PACK, "setback-schedule") == "rajuk@2008.1#setback-schedule"


# --- frozen vector semantics (the pack's own test vectors) ------------------


def test_vector_count_pinned() -> None:
    assert len(VECTORS) == 49


@pytest.mark.parametrize("vector", VECTORS, ids=[v["id"] for v in VECTORS])
def test_pack_test_vectors(vector: dict) -> None:
    got = tables.run_vector(PACK, vector)
    assert got is not None, f"{vector['id']}: evaluator found no applicable row"
    for key, want in vector["expect"].items():
        have = got.get(key)
        if key == "footnotes":
            assert sorted(have or []) == sorted(want), f"{vector['id']}: footnotes"
        else:
            assert have == want, f"{vector['id']}: {key} got {have!r}, want {want!r}"


# --- coverage ---------------------------------------------------------------


def test_coverage_statement() -> None:
    statement = compliance.coverage(PACK)
    assert statement["covered"] == ["far-tables", "schedule4-parking", "setback-schedule"]
    assert "s55-corner-clear-zone" in statement["uncovered_provisions"]
    assert "s54-6-9" in statement["uncovered_provisions"]
    assert not set(statement["covered"]) & set(statement["uncovered_provisions"])
    assert CHECKS  # registry is non-empty


# --- evaluation -------------------------------------------------------------


def test_new_project_is_fully_unevaluated_not_silent() -> None:
    verdict_set = _evaluate(_spec())
    assert verdict_set["verdicts"] == []
    reasons = Counter(row["reason"] for row in verdict_set["unevaluated"])
    assert reasons["missing_input"] == 3  # far + setback + parking all lack inputs
    assert reasons["pack_gap"] == len(PACK["gaps"])  # every declared gap is surfaced
    refs = {row["ruleRef"] for row in verdict_set["unevaluated"] if row["reason"] == "missing_input"}
    assert refs == {
        "rajuk@2008.1#far-tables",
        "rajuk@2008.1#setback-schedule",
        "rajuk@2008.1#schedule4-parking",
    }
    gap_refs = {
        row["ruleRef"] for row in verdict_set["unevaluated"] if row["reason"] == "pack_gap"
    }
    assert {"rajuk@2008.1#gap-c1", "rajuk@2008.1#gap-c11"} <= gap_refs
    assert verdict_set["summary"] == {"compliant": 0, "deviation": 0, "impossible": 0}


def test_full_spec_verdict_set() -> None:
    verdict_set = _evaluate(_patched(_spec(), FULL_INPUTS))
    statuses = Counter(v["status"] for v in verdict_set["verdicts"])
    assert statuses == Counter({"deviation": 3, "compliant": 3})
    assert verdict_set["summary"] == {"compliant": 3, "deviation": 3, "impossible": 0}
    # only pack gaps remain unevaluated (every check produced an outcome)
    assert {row["reason"] for row in verdict_set["unevaluated"]} == {"pack_gap"}

    front = _find(verdict_set["verdicts"], "/phases/site-excavation/data/setbackFrontM")
    assert front["status"] == "deviation"
    assert front["limit"]["value"] == 1.5 and front["limit"]["comparator"] == "min"
    assert front["alternative"]["specPatch"] == [
        {"op": "add", "path": "/phases/site-excavation/data/setbackFrontM", "value": 1.5}
    ]

    far = _find(verdict_set["verdicts"], "/phases/site-excavation/data/plannedTotalFloorAreaSqm")
    assert far["status"] == "deviation"
    assert far["limit"]["value"] == 3.5  # area 334.45 sqm, road 6 m -> band (268, 335]
    patch_value = far["alternative"]["specPatch"][0]["value"]
    assert patch_value == 1170.57  # floor2(3.5 * 334.45), never re-breaches the cap

    parking = _find(verdict_set["verdicts"], "/phases/site-excavation/data/parkingSpaces")
    assert parking["status"] == "deviation"
    assert parking["limit"]["value"] == 7  # 2 flats/floor x 5 floors x 2/3 -> ceil(6.67)
    assert parking["alternative"]["specPatch"][0]["value"] == 7


def test_far_compliant_within_limit() -> None:
    spec = _patched(
        _spec(),
        [{"op": "add", "path": "/phases/0/data/plannedTotalFloorAreaSqm", "value": 1170}],
    )
    verdict_set = _evaluate(spec)
    far = _find(verdict_set["verdicts"], "/phases/site-excavation/data/plannedTotalFloorAreaSqm")
    assert far["status"] == "compliant"
    assert far["measured"]["value"] == round(1170 / 334.45, 4)
    assert "alternative" not in far


def test_far_prohibited_class_is_impossible(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(compliance_checks.OCCUPANCY_CLASS, "residential", "B1")
    spec = _spec()  # 334.45 sqm -> B1 prohibited.
    verdict_set = _evaluate(spec)
    far = next(v for v in verdict_set["verdicts"] if v["ruleRef"].endswith("#far-tables"))
    assert far["status"] == "impossible"
    assert "measured" not in far and "limit" not in far and "alternative" not in far
    assert far["citations"]
    assert all(key in PACK["citations"] for key in far["citations"])


def test_setback_deviation_restore_roundtrip() -> None:
    spec = _patched(_spec(), FULL_INPUTS)
    verdict_set = _evaluate(spec)
    front = _find(verdict_set["verdicts"], "/phases/site-excavation/data/setbackFrontM")
    restored = compliance.restore_patch(spec, front, at=AT)
    assert restored["phases"][0]["data"]["setbackFrontM"] == 1.5
    second = _evaluate(restored)
    setback_rows = [
        v for v in second["verdicts"] if v["ruleRef"].endswith("#setback-schedule")
    ]
    assert len(setback_rows) == 4
    assert all(row["status"] == "compliant" for row in setback_rows)


def test_parking_deviation_restore_roundtrip() -> None:
    spec = _patched(_spec(), FULL_INPUTS)
    verdict_set = _evaluate(spec)
    parking = _find(verdict_set["verdicts"], "/phases/site-excavation/data/parkingSpaces")
    restored = compliance.restore_patch(spec, parking, at=AT)
    assert restored["phases"][0]["data"]["parkingSpaces"] == 7
    second = _evaluate(restored)
    row = next(v for v in second["verdicts"] if v["ruleRef"].endswith("#schedule4-parking"))
    assert row["status"] == "compliant"


def test_parking_small_flat_motorcycle_stays_unevaluated() -> None:
    spec = _patched(
        _spec(),
        [
            {"op": "add", "path": "/building/typicalUnitAreaSqm", "value": 80},
            {"op": "add", "path": "/phases/0/data/parkingSpaces", "value": 3},
        ],
    )
    verdict_set = _evaluate(spec)
    parking = next(v for v in verdict_set["verdicts"] if v["ruleRef"].endswith("#schedule4-parking"))
    assert parking["status"] == "compliant"  # 10 units x 1/4 -> ceil(2.5) = 3
    assert parking["limit"]["value"] == 3
    motorcycle = [
        row
        for row in verdict_set["unevaluated"]
        if row["reason"] == "missing_input" and "motorcycleSpaces" in row["detail"]
    ]
    assert len(motorcycle) == 1
    assert motorcycle[0]["ruleRef"] == "rajuk@2008.1#schedule4-parking"


def test_rule_refs_and_citations_resolve() -> None:
    verdict_set = _evaluate(_patched(_spec(), FULL_INPUTS))
    index = compliance.entities(PACK)
    gap_ids = {f"rajuk@2008.1#{gap['id']}" for gap in PACK["gaps"]}
    for row in verdict_set["verdicts"]:
        assert row["ruleRef"].split("#", 1)[1] in index, row["ruleRef"]
        assert row["citations"], row["ruleRef"]
        assert all(key in PACK["citations"] for key in row["citations"]), row["ruleRef"]
    for row in verdict_set["unevaluated"]:
        assert row["ruleRef"].split("#", 1)[1] in index or row["ruleRef"] in gap_ids


def test_subject_fields() -> None:
    spec = _spec()
    verdict_set = _evaluate(spec)
    assert verdict_set["pack"] == {"id": "rajuk@2008.1", "sha256": PACK_SHA256, "status": "candidate"}
    assert verdict_set["evaluator"] == ENGINE_ID
    assert verdict_set["subject"]["specRevision"] == spec["revision"]
    assert verdict_set["subject"]["specSha256"] == spec_sha256(spec)
    assert verdict_set["subject"]["projectId"] == spec["project"]["id"]


def test_evaluate_is_deterministic() -> None:
    spec = _patched(_spec(), FULL_INPUTS)
    first = _evaluate(spec)
    second = compliance.evaluate_spec(
        spec, compliance.load_pack(PACK_PATH), pack_path=PACK_PATH, evaluated_at=AT
    )
    assert json.dumps(first, sort_keys=True, ensure_ascii=False) == json.dumps(
        second, sort_keys=True, ensure_ascii=False
    )


def test_evaluate_requires_pin() -> None:
    with pytest.raises(ComplianceError, match="pin"):
        compliance.evaluate_spec(_spec(), PACK)


def test_evaluate_rejects_unknown_pack_status() -> None:
    bad = copy.deepcopy(PACK)
    bad["status"] = "draft"
    with pytest.raises(ComplianceError, match="status"):
        compliance.evaluate_spec(_spec(), bad, pack_sha256_pin=PACK_SHA256)


# --- deviation register -----------------------------------------------------


def _register_entry_ids(spec: dict) -> list[str]:
    return [entry["id"] for entry in spec.get("deviations", [])]


def test_register_lifecycle() -> None:
    spec = _patched(_spec(), FULL_INPUTS)
    verdict_set = _evaluate(spec)

    registered = compliance.apply_register(spec, verdict_set, at=AT)
    assert _register_entry_ids(registered) == [
        "dev-far-tables-plannedtotalfloorareasqm",
        "dev-setback-schedule-setbackfrontm",
        "dev-schedule4-parking-parkingspaces",
    ]
    assert registered["provenance"]["/deviations"]["source"] == "engine"

    # a synced register yields no ops (idempotent) and the spec object is untouched
    assert compliance.register_ops(registered, verdict_set, at=AT) == []
    assert compliance.apply_register(registered, verdict_set, at=AT) is registered

    # the user acknowledges the setback deviation; a re-run must preserve that
    index = _register_entry_ids(registered).index("dev-setback-schedule-setbackfrontm")
    acknowledged = apply_patch(
        registered,
        [
            {"op": "add", "path": f"/deviations/{index}/rationale", "value": "Shall reduce to 1.5 m."},
            {"op": "replace", "path": f"/deviations/{index}/acknowledged", "value": True},
        ],
        provenance={"source": "user"},
        at=AT,
    )
    re_run = _evaluate(acknowledged)
    synced = compliance.apply_register(acknowledged, re_run, at=AT)
    entry = next(e for e in synced["deviations"] if e["id"] == "dev-setback-schedule-setbackfrontm")
    assert entry["rationale"] == "Shall reduce to 1.5 m."
    assert entry["acknowledged"] is True
    assert entry["recordedAt"] == AT

    # restoring the deviation removes exactly that register entry
    front = _find(re_run["verdicts"], "/phases/site-excavation/data/setbackFrontM")
    restored = compliance.restore_patch(synced, front, at=AT)
    after = compliance.apply_register(restored, _evaluate(restored), at=AT)
    assert _register_entry_ids(after) == [
        "dev-far-tables-plannedtotalfloorareasqm",
        "dev-schedule4-parking-parkingspaces",
    ]


def test_register_keeps_user_entries() -> None:
    user_entry = {
        "id": "user-parking-variance",
        "ruleRef": "rajuk@2008.1#schedule4-parking",
        "expected": ">= 2 spaces",
        "actual": "1 space",
        "riskTier": "approval_risk",
        "acknowledged": True,
        "recordedAt": AT,
    }
    spec = _patched(
        _patched(_spec(), FULL_INPUTS), [{"op": "add", "path": "/deviations", "value": [user_entry]}]
    )
    verdict_set = _evaluate(spec)
    registered = compliance.apply_register(spec, verdict_set, at=AT)
    assert registered["deviations"][0] == user_entry
    assert len(registered["deviations"]) == 4


def test_register_add_when_deviations_key_absent() -> None:
    spec = _patched(_spec(), FULL_INPUTS)
    assert "deviations" not in spec
    verdict_set = _evaluate(spec)
    ops = compliance.register_ops(spec, verdict_set, at=AT)
    assert ops and ops[0]["op"] == "add" and ops[0]["path"] == "/deviations"
    assert len(ops[0]["value"]) == 3


def test_restore_patch_rejects_non_deviations() -> None:
    spec = _patched(
        _spec(),
        [{"op": "add", "path": "/phases/0/data/plannedTotalFloorAreaSqm", "value": 1170}],
    )
    far = _find(_evaluate(spec)["verdicts"], "/phases/site-excavation/data/plannedTotalFloorAreaSqm")
    assert far["status"] == "compliant"
    with pytest.raises(ComplianceError, match="deviation"):
        compliance.restore_patch(spec, far)
    without_patch = {"status": "deviation", "ruleRef": "rajuk@2008.1#setback-schedule"}
    with pytest.raises(ComplianceError, match="specPatch"):
        compliance.restore_patch(spec, without_patch)


# --- pack loading -----------------------------------------------------------


def test_load_pack_missing_file() -> None:
    with pytest.raises(RulePackError, match="not found"):
        compliance.load_pack(ROOT / "spec" / "rules" / "does-not-exist.yaml")


def test_load_pack_requires_engine_keys(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "pack.yaml"
    path.write_text("id: demo@2020.1\nstatus: candidate\n", encoding="utf-8")
    with pytest.raises(RulePackError, match="missing required key"):
        compliance.load_pack(path)


def test_run_vectors_reports_every_vector() -> None:
    results = compliance.run_vectors(PACK)
    assert len(results) == len(VECTORS)
    assert all(row["ok"] for row in results)
