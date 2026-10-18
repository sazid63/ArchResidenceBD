"""W0.9 interfaces - schema validation, codegen round-trips, cross-artifact guards."""

from __future__ import annotations

import hashlib
import json
import pathlib

import pytest
import yaml
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from archres_core.interfaces import (
    INTERFACES_VERSION,
    SCHEMA_NAMES,
    JobMessage,
    JobRequest,
    JobResult,
    ModelRegistry,
    RateCard,
    VerdictSet,
    load_schema,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE_SCHEMAS = ROOT / "spec" / "schemas"
EXAMPLES = ROOT / "spec" / "examples" / "interfaces"
REGISTRY_PATH = ROOT / "spec" / "models" / "registry.json"
PACK_PATH = ROOT / "spec" / "rules" / "rajuk-2008.yaml"

EXAMPLES_ALL = sorted(EXAMPLES.glob("*.json"))
ROLES = ["chat", "repair", "embed", "rerank"]


def _load(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _example_schema(stem: str) -> str:
    if stem.startswith("job-"):
        return "job-protocol"
    if stem.startswith("rate-card"):
        return "rate-card"
    if stem.startswith("verdict"):
        return "verdict"
    raise AssertionError(f"unmapped example: {stem}")


def _rejects(schema: dict, data: dict) -> bool:
    return bool(list(Draft202012Validator(schema).iter_errors(data)))


@pytest.fixture(scope="module")
def schemas() -> dict[str, dict]:
    return {name: load_schema(name) for name in SCHEMA_NAMES}


@pytest.fixture(scope="module")
def registry() -> dict:
    return _load(REGISTRY_PATH)


@pytest.fixture(scope="module")
def pack() -> dict:
    return yaml.safe_load(PACK_PATH.read_text(encoding="utf-8"))


# --- packaging / freshness -------------------------------------------------


def test_examples_exist() -> None:
    assert len(EXAMPLES_ALL) == 5, "expected the five W0.9 interface examples"


def test_packaged_schemas_are_fresh() -> None:
    for name in SCHEMA_NAMES:
        assert load_schema(name) == _load(SOURCE_SCHEMAS / f"{name}.schema.json")


def test_version_constants(schemas: dict[str, dict]) -> None:
    for name in ("model-registry", "rate-card", "verdict"):
        assert schemas[name]["properties"]["schemaVersion"]["const"] == INTERFACES_VERSION
    job = schemas["job-protocol"]
    for message in ("JobRequest", "JobResult"):
        assert job["$defs"][message]["properties"]["protocolVersion"]["const"] == INTERFACES_VERSION


# --- examples validate + round-trip ---------------------------------------


@pytest.mark.parametrize("example", EXAMPLES_ALL, ids=lambda p: p.stem)
def test_example_validates_against_schema(example: pathlib.Path, schemas: dict[str, dict]) -> None:
    Draft202012Validator(schemas[_example_schema(example.stem)]).validate(_load(example))


def test_job_message_union_routes_by_message_type() -> None:
    req = _load(EXAMPLES / "job-request-geometry.json")
    res = _load(EXAMPLES / "job-result-drawing.json")
    assert isinstance(JobMessage.model_validate(req).root, JobRequest)
    assert isinstance(JobMessage.model_validate(res).root, JobResult)


@pytest.mark.parametrize(
    ("filename", "model"),
    [
        ("job-request-geometry.json", JobRequest),
        ("job-result-drawing.json", JobResult),
        ("job-result-error.json", JobResult),
        ("rate-card-dhaka-example.json", RateCard),
        ("verdict-set-example.json", VerdictSet),
    ],
)
def test_roundtrip_is_byte_stable(filename: str, model: type, schemas: dict[str, dict]) -> None:
    data = _load(EXAMPLES / filename)
    m = model.model_validate(data)
    dump1 = m.model_dump(by_alias=True, mode="json", exclude_none=True)
    assert dump1 == data, "round-trip must reproduce the committed example exactly"
    Draft202012Validator(schemas[_example_schema(pathlib.Path(filename).stem)]).validate(dump1)
    dump2 = model.model_validate(dump1).model_dump(by_alias=True, mode="json", exclude_none=True)
    assert dump2 == dump1


# --- model registry ---------------------------------------------------------


def test_registry_validates_and_roster_is_v1(registry: dict, schemas: dict[str, dict]) -> None:
    Draft202012Validator(schemas["model-registry"]).validate(registry)
    ModelRegistry.model_validate(registry)
    assert [m["role"] for m in registry["models"]] == ROLES
    ids = [m["id"] for m in registry["models"]]
    assert len(ids) == len(set(ids)), "registry ids must be unique"
    hashes = [m["artifact"]["sha256"] for m in registry["models"]]
    assert len(hashes) == len(set(hashes)), "artifact hashes must be unique"
    for m in registry["models"]:
        assert m["distribution"] == "bundled"
        if m["runtime"]["device"] == "cpu":
            assert m["runtime"]["gpuLayers"] == 0
            assert m["swapGroup"] == "cpu-services"
        else:
            assert m["runtime"]["gpuLayers"] >= 1
            assert m["swapGroup"] == "gpu-models"


def test_registry_rejects_bad_hash(registry: dict, schemas: dict[str, dict]) -> None:
    data = json.loads(json.dumps(registry))
    data["models"][0]["artifact"]["sha256"] = "not-a-hash"
    assert _rejects(schemas["model-registry"], data)
    with pytest.raises(ValidationError):
        ModelRegistry.model_validate(data)


def test_registry_rejects_device_layer_mismatch(registry: dict, schemas: dict[str, dict]) -> None:
    data = json.loads(json.dumps(registry))
    data["models"][2]["runtime"]["device"] = "gpu"  # embed is gpuLayers 0 (CPU-pinned)
    assert _rejects(schemas["model-registry"], data)
    data = json.loads(json.dumps(registry))
    data["models"][0]["runtime"]["device"] = "cpu"  # chat is gpuLayers 99
    assert _rejects(schemas["model-registry"], data)


# --- verdicts vs the real rule pack ----------------------------------------


def test_verdict_pack_pin_is_real(pack: dict) -> None:
    data = _load(EXAMPLES / "verdict-set-example.json")
    assert data["pack"]["id"] == pack["id"]
    assert data["pack"]["sha256"] == hashlib.sha256(PACK_PATH.read_bytes()).hexdigest()
    assert data["pack"]["status"] == pack["status"]


def test_verdict_refs_and_citations_resolve(pack: dict) -> None:
    data = _load(EXAMPLES / "verdict-set-example.json")
    resolvable = (
        {p["id"] for p in pack["provisions"]}
        | {pack["setbackTable"]["id"], pack["parkingSchedule"]["id"], pack["parkingGeometry"]["id"]}
        | {t["id"] for t in pack["farTables"]}
        | {r["id"] for r in pack["parkingGeometry"]["rules"]}
    )
    cite_keys = set(pack["citations"])
    for verdict in data["verdicts"]:
        pack_id, _, rule_id = verdict["ruleRef"].partition("#")
        assert pack_id == pack["id"]
        assert rule_id in resolvable, f"ruleRef {verdict['ruleRef']} does not resolve"
        for cite in verdict["citations"]:
            assert cite in cite_keys, f"citation {cite!r} is not in the pack"
    for unevaluated in data["unevaluated"]:
        assert unevaluated["ruleRef"].partition("#")[2] in resolvable


def test_verdict_summary_matches_counts() -> None:
    data = _load(EXAMPLES / "verdict-set-example.json")
    counts = {"compliant": 0, "deviation": 0, "impossible": 0}
    for verdict in data["verdicts"]:
        counts[verdict["status"]] += 1
    assert data["summary"] == counts


# --- conditional laws (schema-level; pydantic mirrors shapes only) ----------


def test_job_conditionals(schemas: dict[str, dict]) -> None:
    schema = schemas["job-protocol"]
    req = _load(EXAMPLES / "job-request-geometry.json")
    res = _load(EXAMPLES / "job-result-drawing.json")

    bad = dict(req, favouriteColour="coral")
    assert _rejects(schema, bad)
    with pytest.raises(ValidationError):
        JobRequest.model_validate(bad)

    assert _rejects(schema, dict(req, deadlineMs=500))

    bad = dict(res, error={"code": "internal", "message": "x"})
    assert _rejects(schema, bad)

    ok_without_error = dict(res)
    ok_without_error.pop("error", None)
    assert not _rejects(schema, ok_without_error)

    err = _load(EXAMPLES / "job-result-error.json")
    err_no_error = {k: v for k, v in err.items() if k != "error"}
    assert _rejects(schema, err_no_error)


def test_rate_card_conditionals(schemas: dict[str, dict]) -> None:
    schema = schemas["rate-card"]
    card = _load(EXAMPLES / "rate-card-dhaka-example.json")
    mixer = card["lines"][5]
    excavator = card["lines"][6]
    piling = card["lines"][7]
    assert mixer["costType"] == "machinery" and excavator["costType"] == "machinery"

    bad = json.loads(json.dumps(card))
    del bad["lines"][5]["fuelIncluded"]
    assert _rejects(schema, bad)

    bad = json.loads(json.dumps(card))
    bad["lines"][5]["unit"] = "bag"
    assert _rejects(schema, bad)

    bad = json.loads(json.dumps(card))
    bad["lines"][7]["unit"] = "day"
    assert _rejects(schema, bad)

    bad = json.loads(json.dumps(card))
    bad["lines"][0]["fuelIncluded"] = True  # material lines must not carry machinery flags
    assert _rejects(schema, bad)

    bad = dict(card, favouriteColour="coral")
    assert _rejects(schema, bad)
    with pytest.raises(ValidationError):
        RateCard.model_validate(bad)


def test_verdict_conditionals(schemas: dict[str, dict]) -> None:
    schema = schemas["verdict"]
    data = _load(EXAMPLES / "verdict-set-example.json")
    compliant = json.loads(json.dumps(data["verdicts"][0]))
    deviation = json.loads(json.dumps(data["verdicts"][1]))

    bad = {k: v for k, v in deviation.items() if k != "alternative"}
    assert _rejects(schema, dict(data, verdicts=[bad]))

    bad = dict(compliant, alternative=deviation["alternative"])
    assert _rejects(schema, dict(data, verdicts=[bad]))

    bad = {k: v for k, v in compliant.items() if k != "limit"}
    assert _rejects(schema, dict(data, verdicts=[bad]))

    bad = dict(compliant, citations=[])
    assert _rejects(schema, dict(data, verdicts=[bad]))

    bad = dict(compliant, ruleRef="setback-schedule")
    assert _rejects(schema, dict(data, verdicts=[bad]))

    bad_patch = {"op": "remove", "path": "/building/x", "value": 1}
    assert _rejects(schema, dict(data, verdicts=[dict(deviation, alternative={"description": deviation["alternative"]["description"], "specPatch": [bad_patch]})]))

    bad_patch = {"op": "replace", "path": "/building/x"}
    assert _rejects(schema, dict(data, verdicts=[dict(deviation, alternative={"description": deviation["alternative"]["description"], "specPatch": [bad_patch]})]))
