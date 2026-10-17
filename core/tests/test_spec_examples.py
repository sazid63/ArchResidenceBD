"""Building Spec v0 — example validation + round-trip stability (W0.3)."""

from __future__ import annotations

import json
import pathlib

import pytest
from jsonschema import Draft202012Validator
from pydantic import ValidationError

from archres_core.spec import PACKAGED_SCHEMA_PATH, SPEC_VERSION, BuildingSpec, load_schema

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE_SCHEMA = ROOT / "spec" / "schemas" / "building-spec.schema.json"
EXAMPLES = sorted((ROOT / "spec" / "examples").glob("*.json"))


def _load(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def schema() -> dict:
    return _load(SOURCE_SCHEMA)


def test_examples_exist() -> None:
    assert EXAMPLES, "no spec examples found in spec/examples/"


@pytest.mark.parametrize("example", EXAMPLES, ids=lambda p: p.stem)
def test_example_validates_against_schema(example: pathlib.Path, schema: dict) -> None:
    Draft202012Validator(schema).validate(_load(example))


@pytest.mark.parametrize("example", EXAMPLES, ids=lambda p: p.stem)
def test_example_roundtrip_is_stable(example: pathlib.Path, schema: dict) -> None:
    spec = BuildingSpec.model_validate(_load(example))
    assert spec.schema_version == SPEC_VERSION

    dump1 = spec.model_dump(by_alias=True, mode="json", exclude_none=True)
    Draft202012Validator(schema).validate(dump1)

    dump2 = BuildingSpec.model_validate(dump1).model_dump(by_alias=True, mode="json", exclude_none=True)
    assert dump2 == dump1


@pytest.mark.parametrize("example", EXAMPLES, ids=lambda p: p.stem)
def test_phase_ids_are_unique(example: pathlib.Path) -> None:
    spec = BuildingSpec.model_validate(_load(example))
    ids = [phase.id for phase in spec.phases]
    assert len(ids) == len(set(ids)), "phase ids must be unique"


def test_negative_plot_area_rejected(schema: dict) -> None:
    data = _load(EXAMPLES[0])
    data["site"]["plot"]["areaSqm"] = -1
    assert list(Draft202012Validator(schema).iter_errors(data)), "schema must reject negative area"
    with pytest.raises(ValidationError):
        BuildingSpec.model_validate(data)


def test_unknown_language_rejected(schema: dict) -> None:
    data = _load(EXAMPLES[0])
    data["project"]["language"] = "fr"
    assert list(Draft202012Validator(schema).iter_errors(data)), "schema must reject unknown language"
    with pytest.raises(ValidationError):
        BuildingSpec.model_validate(data)


def test_empty_phases_rejected_by_schema(schema: dict) -> None:
    data = _load(EXAMPLES[0])
    data["phases"] = []
    assert list(Draft202012Validator(schema).iter_errors(data)), "schema must reject a phaseless spec"


def test_unknown_field_rejected(schema: dict) -> None:
    data = _load(EXAMPLES[0])
    data["project"]["favouriteColour"] = "coral"
    assert list(Draft202012Validator(schema).iter_errors(data)), "strict schema must reject unknown fields"
    with pytest.raises(ValidationError):
        BuildingSpec.model_validate(data)


def test_packaged_schema_is_fresh() -> None:
    assert load_schema() == _load(SOURCE_SCHEMA)
    assert PACKAGED_SCHEMA_PATH.exists()
