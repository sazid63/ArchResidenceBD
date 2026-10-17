"""Phase Flow Book v0 — schema + invariant tests (W0.4, plan 5.5).

The book is data, not code: these tests keep it honest.
They also bind it to the Building Spec schema (maps_to roots, phase kinds)
so the book and the spec cannot drift apart silently.
"""

from __future__ import annotations

import copy
import json
import pathlib
import re

import pytest
import yaml
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parents[2]
BOOK_PATH = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
FLOW_SCHEMA_PATH = ROOT / "spec" / "schemas" / "flow-book.schema.json"
SPEC_SCHEMA_PATH = ROOT / "spec" / "schemas" / "building-spec.schema.json"

WHEN_PATTERN = re.compile(r"^([A-Za-z0-9-]+) (==|!=|>=|<=|>|<) (-?\d+|[A-Za-z0-9-]+)$")


@pytest.fixture(scope="module")
def book() -> dict:
    return yaml.safe_load(BOOK_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def flow_schema() -> dict:
    return json.loads(FLOW_SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def spec_schema() -> dict:
    return json.loads(SPEC_SCHEMA_PATH.read_text(encoding="utf-8"))


def _questions(book_data: dict):
    for flow in book_data["flows"]:
        for question in flow["questions"]:
            yield flow, question


def test_book_validates_against_schema(book: dict, flow_schema: dict) -> None:
    Draft202012Validator(flow_schema).validate(book)


def test_question_ids_are_unique(book: dict) -> None:
    ids = [question["id"] for _, question in _questions(book)]
    duplicates = sorted({id_ for id_ in ids if ids.count(id_) > 1})
    assert not duplicates, f"question ids must be unique across the book: {duplicates}"


def test_every_question_has_localized_why(book: dict) -> None:
    """Authoring standard (stricter than the schema): every question explains itself in BN and EN."""
    missing = [
        question["id"]
        for _, question in _questions(book)
        if not question.get("why", {}).get("bn") or not question.get("why", {}).get("en")
    ]
    assert not missing, f"questions without a BN+EN 'why': {missing}"


def test_fallback_assumption_rules(book: dict) -> None:
    for _, question in _questions(book):
        fallback = question.get("fallback")
        if fallback is None:
            continue
        if fallback["kind"] in ("registry", "area_default"):
            assumption = fallback.get("assumption")
            assert assumption, f"{question['id']}: {fallback['kind']} fallback must carry an assumption"
            assert assumption.get("bn") and assumption.get("en"), (
                f"{question['id']}: assumption needs both languages"
            )
        if fallback["kind"] == "omit":
            assert "value" not in fallback and "assumption" not in fallback, (
                f"{question['id']}: an omitted field carries no value or assumption"
            )


def test_maps_to_roots_exist_in_spec_schema(book: dict, spec_schema: dict) -> None:
    roots = set(spec_schema["properties"].keys())
    for _, question in _questions(book):
        first = question["maps_to"].split("/")[1]
        assert first in roots, (
            f"{question['id']}: maps_to root '{first}' is not a Building Spec top-level field"
        )


def test_phase_payloads_live_under_their_flow(book: dict) -> None:
    for flow in book["flows"]:
        if not flow.get("phaseKind"):
            continue
        prefix = (
            "/phases/floor-<n>/data/"
            if flow["id"] == "floor"
            else f"/phases/{flow['id']}/data/"
        )
        for question in flow["questions"]:
            if question["maps_to"].startswith("/phases/"):
                assert question["maps_to"].startswith(prefix), (
                    f"{question['id']}: phase payload must live under {prefix}"
                )


def test_phase_kinds_and_repeats_match_the_spec(book: dict, spec_schema: dict) -> None:
    spec_kinds = set(spec_schema["$defs"]["Phase"]["properties"]["kind"]["enum"])
    for flow in book["flows"]:
        if flow["id"] == "setup":
            assert "phaseKind" not in flow, "setup is not a phase"
            assert flow["repeats"] == "once"
        else:
            assert flow["phaseKind"] in spec_kinds, (
                f"{flow['id']}: phaseKind '{flow.get('phaseKind')}' is not a Building Spec Phase.kind"
            )
            expected = "per_storey" if flow["id"] == "floor" else "once"
            assert flow["repeats"] == expected


def test_when_conditions_reference_known_questions(book: dict) -> None:
    ids = {question["id"] for _, question in _questions(book)}
    for _, question in _questions(book):
        when = question.get("when")
        if when is None:
            continue
        match = WHEN_PATTERN.match(when)
        assert match, f"{question['id']}: cannot parse when condition {when!r}"
        operand = match.group(1)
        assert operand in ids or operand == "storeyIndex", (
            f"{question['id']}: when condition references unknown operand {operand!r}"
        )


def test_negative_missing_bangla_rejected(book: dict, flow_schema: dict) -> None:
    broken = copy.deepcopy(book)
    del broken["flows"][0]["questions"][0]["ask"]["bn"]
    assert list(Draft202012Validator(flow_schema).iter_errors(broken)), (
        "schema must reject a question without hand-authored Bangla"
    )


def test_negative_essential_with_fallback_rejected(book: dict, flow_schema: dict) -> None:
    broken = copy.deepcopy(book)
    question = broken["flows"][0]["questions"][0]
    assert question.get("essential") is True, "fixture question must be essential"
    question["fallback"] = {"kind": "omit"}
    assert list(Draft202012Validator(flow_schema).iter_errors(broken)), (
        "schema must reject essential + fallback on the same question"
    )


def test_negative_choice_without_options_rejected(book: dict, flow_schema: dict) -> None:
    broken = copy.deepcopy(book)
    for flow in broken["flows"]:
        for question in flow["questions"]:
            if question["type"] == "choice":
                del question["options"]
                break
        else:
            continue
        break
    assert list(Draft202012Validator(flow_schema).iter_errors(broken)), (
        "schema must reject a choice question without options"
    )
