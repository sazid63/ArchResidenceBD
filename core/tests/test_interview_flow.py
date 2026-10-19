"""Interview flow layer (W1.4): book access, chips, conditions, pointer templates.

The flow book is data; these tests keep the engine's reading of it honest:
every question type is supported, every `when` operand is answered earlier,
and every `maps_to` target agrees with the Building Spec schema — or is one of
the three declared answer→spec mappings.
"""

from __future__ import annotations

import pathlib

import pytest

from archres_core.interview import (
    DISPLAY_UNITS,
    ConditionError,
    FlowBookError,
    chips,
    condition_holds,
    parse_when,
    pointer_for,
)
from archres_core.training.generators import load_flow_book as training_loader

SUPPORTED_TYPES = {"text", "number", "integer", "yes_no", "choice", "multi_choice", "file"}

#: Answer values that intentionally differ in vocabulary from the spec (ADR-0010).
DECLARED_MAPPINGS = {
    "/project/displayUnits/area",  # choice metric/feet-inch/bangla-land -> area+length enums
    "/pricing/source",  # yes/no -> user | fetched
    "/site/soil/status",  # yes/no -> user_report | area_default
}


def _deref(node: dict, schema: dict) -> dict:
    while isinstance(node, dict) and "$ref" in node:
        node = schema["$defs"][node["$ref"].split("/")[-1]]
    return node


def _schema_at(pointer: str, schema: dict) -> dict | None:
    """Walk the Building Spec schema for a pointer; None for open phase payloads."""
    node: dict = schema
    tokens = [token for token in pointer.replace("<n>", "0").split("/") if token]
    for token in tokens:
        node = _deref(node, schema)
        if "properties" in node and token in node["properties"]:
            node = node["properties"][token]
            continue
        if node.get("type") == "array" and isinstance(node.get("items"), dict):
            node = _deref(node["items"], schema)
            if "properties" in node and token in node["properties"]:
                node = node["properties"][token]
                continue
            if node.get("additionalProperties"):
                node = node["additionalProperties"]
                continue
        if node.get("additionalProperties") is True:
            return None
        return None
    return _deref(node, schema)


def test_book_loads_all_flows_and_the_expected_question_count(book) -> None:
    assert book.version == "0.1.0"
    assert book.status == "draft"
    assert [flow.id for flow in book.flows] == [
        "setup",
        "site-excavation",
        "foundation",
        "floor",
        "roof-boundary",
        "common-services",
    ]
    assert len(book.questions) == 60
    assert len({question.id for question in book.questions}) == 60
    assert book.flow("floor").per_storey
    assert all(not flow.per_storey for flow in book.flows if flow.id != "floor")


def test_training_loader_and_interview_loader_agree(book) -> None:
    """Two readers, one book: the training pipeline and the interview engine cannot fork."""
    root = pathlib.Path(__file__).resolve().parents[2]
    training = training_loader(root / "spec" / "flows" / "phase-flow-book.yaml")
    assert [question.id for question in training] == [question.id for question in book.questions]
    assert [question.maps_to for question in training] == [question.maps_to for question in book.questions]
    assert [question.type for question in training] == [question.type for question in book.questions]


def test_every_question_type_is_supported(book) -> None:
    assert {question.type for question in book.questions} <= SUPPORTED_TYPES


def test_every_number_question_has_a_canonical_unit(book) -> None:
    missing = [question.id for question in book.questions if question.type == "number" and not question.unit]
    assert not missing, f"number questions without a unit: {missing}"


def test_every_maps_to_agrees_with_the_spec_schema(book, spec_schema) -> None:
    mismatches = []
    for question in book.questions:
        node = _schema_at(question.maps_to, spec_schema)
        if node is None:
            continue  # open phase payload: /phases/<id>/data/*
        if question.maps_to in DECLARED_MAPPINGS:
            continue
        expected = node.get("type")
        wanted = {
            "text": "string",
            "file": "string",
            "choice": "string",
            "multi_choice": "array",
            "yes_no": "boolean",
            "number": "number",
            "integer": "integer",
        }[question.type]
        if expected != wanted:
            mismatches.append((question.id, question.maps_to, question.type, expected))
    assert not mismatches, f"question/spec type drift: {mismatches}"


def test_declared_mappings_still_describe_real_questions(book) -> None:
    pointers = {question.maps_to for question in book.questions}
    assert DECLARED_MAPPINGS <= pointers


def test_display_unit_choice_covers_every_option_and_valid_enum_targets(book, spec_schema) -> None:
    question = book.question("display-units")
    option_values = [option["value"] for option in question.options]
    assert set(option_values) == set(DISPLAY_UNITS)
    for area, length in DISPLAY_UNITS.values():
        assert area in spec_schema["$defs"]["DisplayUnits"]["properties"]["area"]["enum"]
        assert length in spec_schema["$defs"]["DisplayUnits"]["properties"]["length"]["enum"]


def test_chips_are_option_values_plus_one_skip_chip(book) -> None:
    question = book.question("display-units")
    assert question.fallback  # the skip chip exists only when there is a fallback
    got = chips(question, "en")
    assert [chip["id"] for chip in got[:-1]] == [option["value"] for option in question.options]
    assert got[-1]["id"] == "@skip"
    assert got[-1]["kind"] == "skip"
    assert [chip["label"] for chip in got] == [option["label"]["en"] for option in question.options] + ["I don't know"]


def test_skip_chip_is_absent_on_an_essential_question(book) -> None:
    assert chips(book.question("project-name"), "en") == []
    assert chips(book.question("plot-area"), "bn") == []
    # A non-essential number question has no option chips, only the skip shortcut.
    assert [chip["id"] for chip in chips(book.question("typical-unit-area"), "bn")] == ["@skip"]
    assert chips(book.question("typical-unit-area"), "bn")[0]["label"] == "জানি না"


def test_bangla_chips_use_the_authored_label(book) -> None:
    question = book.question("division")
    got = chips(question, "bn")
    assert got[0]["id"] == "dhaka"
    assert got[0]["label"] == "ঢাকা"


def test_condition_parsing_and_evaluation() -> None:
    assert parse_when("soil-has-report == yes") == ("soil-has-report", "==", "yes")
    assert condition_holds("soil-has-report == yes", {"soil-has-report": True})
    assert not condition_holds("soil-has-report == yes", {"soil-has-report": False})
    assert condition_holds("storeyIndex > 0", {}, storey_index=2)
    assert not condition_holds("storeyIndex == 0", {}, storey_index=2)
    assert condition_holds("foundation-system == pile", {"foundation-system": "pile"})


def test_unknown_condition_operand_is_never_guessed() -> None:
    with pytest.raises(ConditionError):
        condition_holds("soil-has-report == yes", {})
    with pytest.raises(ConditionError):
        condition_holds("storeyIndex > 0", {}, None)


def test_when_operands_are_answered_before_they_are_used(book) -> None:
    seen: set[str] = set()
    problems = []
    for question in book.questions:
        if question.when:
            operand = parse_when(question.when)[0]
            if operand != "storeyIndex" and operand not in seen:
                problems.append((question.id, question.when))
        seen.add(question.id)
    assert not problems, f"conditions used before their operand is answered: {problems}"


def test_pointer_templates_expand_per_storey(book) -> None:
    assert pointer_for(book.question("plot-area")) == "/site/plot/areaSqm"
    assert pointer_for(book.question("floor-usage"), 0) == "/phases/floor-0/data/usage"
    assert pointer_for(book.question("floor-usage"), 3) == "/phases/floor-3/data/usage"
    with pytest.raises(FlowBookError):
        pointer_for(book.question("floor-usage"))


def test_default_fallback_values_fit_their_question_types(book) -> None:
    for question in book.questions:
        fallback = question.fallback
        if fallback.get("kind") != "default":
            continue
        value = fallback.get("value")
        assert value is not None, question.id
        if question.type == "choice":
            assert question.option(value) is not None, f"{question.id}: default {value!r} is not an option"
        elif question.type == "yes_no":
            assert isinstance(value, bool), f"{question.id}: default {value!r} is not boolean"
        elif question.type in ("number", "integer"):
            assert isinstance(value, (int, float)) and not isinstance(value, bool), question.id


def test_all_fallback_kinds_are_known(book) -> None:
    from archres_core.interview import FALLBACK_KINDS

    for question in book.questions:
        kind = question.fallback.get("kind")
        if kind:
            assert kind in FALLBACK_KINDS, f"{question.id}: {kind}"


def test_essential_and_fallback_are_mutually_exclusive(book) -> None:
    for question in book.questions:
        assert bool(question.essential) != bool(question.fallback), question.id
