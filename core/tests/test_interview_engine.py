"""Interview engine (W1.4): walk the book, write the spec, never lose a question.

These are the quality-law tests for the conversation spine: every answer becomes a
validated, provenance-stamped patch; fallbacks are applied, omitted or declared pending;
essential questions stay open; coverage is counted per question and per storey.
"""

from __future__ import annotations

import copy
import json

import pytest

from archres_core.interview import (
    FlowBookError,
    Interview,
    InterviewError,
)
from archres_core.spec import SpecValidationError, resolve, spec_sha256, validate_spec

AT = "2026-10-20T10:00:00+06:00"

ESSENTIAL_ANSWERS = {
    "project-name": "Green Villa",
    "division": "Dhaka",
    "district": "Dhaka",
    "plot-area": "5 katha",
    "road-width": "20 ft",
    "storeys-count": "2",
}

NUMBER_ANSWERS = {
    "plot-area": "5 katha",
    "plot-frontage": "40 ft",
    "plot-depth": "50 ft",
    "road-width": "20 ft",
    "typical-unit-area": "1200 sqft",
    "soil-sbc": "95 kPa",
    "soil-groundwater": "4.5 m",
    "excavation-depth-req": "2.5 m",
    "depth-constraint": "3 m",
    "plinth-height": "0.6 m",
    "ground-floor-height": "3.2 m",
    "typical-floor-height": "3 m",
    "parapet-height": "1 m",
    "boundary-wall-height": "1.5 m",
}


def answer_value(question) -> str:
    if question.id in ESSENTIAL_ANSWERS:
        return ESSENTIAL_ANSWERS[question.id]
    if question.id in NUMBER_ANSWERS:
        return NUMBER_ANSWERS[question.id]
    if question.type == "choice":
        return "pile" if question.id == "foundation-system" else question.options[0]["value"]
    if question.type == "yes_no":
        return "yes"
    if question.type == "integer":
        return "2" if question.id == "units-per-floor" else "1"
    if question.type == "number":
        if question.unit_code == "m2":
            return "3 sqm"
        if question.unit_code == "m":
            return "3 m"
        return "3 kPa"
    if question.type == "file":
        return "soil-report.pdf"
    return "Green Villa" if question.id == "project-name" else "Test"


def run_book(book, spec, **kwargs):
    spec_before = copy.deepcopy(spec)
    interview = Interview(book, spec, at=AT, **kwargs)
    while not interview.done:
        question = interview.current.question
        turn = interview.answer(answer_value(question))
        assert turn.decision == "accept", (question.id, turn.decision, turn.reason, turn.reply)
    return interview, spec_before


def drive_to(book, spec, question_id: str, **kwargs) -> Interview:
    interview = Interview(book, spec, at=AT, **kwargs)
    while not interview.done and interview.current.question.id != question_id:
        question = interview.current.question
        if question.essential:
            turn = interview.answer(ESSENTIAL_ANSWERS[question.id])
            assert turn.decision == "accept", (question.id, turn.reason)
        else:
            interview.skip()
    assert interview.current is not None, f"never reached {question_id}"
    return interview


# --------------------------------------------------------------------- full runs


def test_full_book_walkthrough_is_valid_complete_and_provenanced(book, base_spec) -> None:
    spec = base_spec(storeys=2)
    interview, spec_before = run_book(book, spec)

    assert interview.done
    validate_spec(interview.spec)
    assert spec == spec_before, "the engine must not mutate the caller's spec"

    # Every question got an outcome; the floor flow ran once per storey.
    coverage = interview.coverage()
    floor_questions = {question.id for question in book.flow("floor").questions}
    assert len(coverage) == len(book.questions) + len(floor_questions)
    floor_keys = {key for key in coverage if "#" in key}
    assert len(floor_keys) == 2 * len(floor_questions)
    assert {coverage[key]["question"] for key in floor_keys} == floor_questions
    assert {coverage[key]["storeyIndex"] for key in floor_keys} == {0, 1}
    for question in book.questions:
        assert any(entry["question"] == question.id for entry in coverage.values()), question.id

    assert {entry["outcome"] for entry in coverage.values()} <= {"answered", "skipped"}
    for entry in coverage.values():
        if entry["outcome"] == "skipped":
            assert entry["reason"] == "condition", entry

    # The values landed where the book says, in canonical units.
    assert interview.spec["project"]["name"] == "Green Villa"
    assert interview.spec["site"]["plot"]["areaSqm"] == pytest.approx(334.45)
    assert interview.spec["site"]["plot"]["roadWidthM"] == pytest.approx(6.096)
    assert interview.spec["site"]["plot"]["frontageM"] == pytest.approx(12.192)
    assert interview.spec["site"]["address"]["division"] == "dhaka"
    assert interview.spec["site"]["jurisdiction"]["authority"] == "rajuk"
    assert interview.spec["site"]["soil"] == {
        "status": "user_report",
        "sbcKpa": 95.0,
        "reportRef": "soil-report.pdf",
        "groundwaterDepthM": 4.5,
    }
    assert interview.spec["pricing"] == {"currency": "BDT", "source": "user"}
    assert interview.spec["building"]["storeys"]["groundFloorHeightM"] == pytest.approx(3.2)
    assert interview.spec["building"]["storeys"]["typicalFloorHeightM"] == pytest.approx(3.0)
    for index in range(2):
        data = interview.spec["phases"][2 + index]["data"]
        assert data["usage"] == "residential"
        assert data["attachedBathPerBedroom"] is True
    assert interview.spec["phases"][0]["data"]["existingStructureAction"] == "demolish-full"
    assert interview.spec["phases"][1]["data"]["foundationSystem"] == "pile"
    assert interview.spec["phases"][1]["data"]["pileTypePref"] == "no-preference"

    # Provenance: user answers say so, and the entered unit is preserved.
    area_entry = interview.spec["provenance"]["/site/plot/areaSqm"]
    assert area_entry["source"] == "user"
    assert area_entry["confidence"] == "high"
    assert "as entered: 5 katha" in area_entry["detail"]
    assert interview.spec["provenance"]["/phases/floor-1/data/usage"]["source"] == "user"


def test_identical_runs_produce_identical_specs(book, base_spec) -> None:
    one, _ = run_book(book, base_spec(storeys=2))
    two, _ = run_book(book, base_spec(storeys=2))
    assert spec_sha256(one.spec) == spec_sha256(two.spec)
    assert one.history() == two.history()


def test_lazy_walkthrough_declares_fallbacks_pending_and_assumptions(book, base_spec) -> None:
    interview = Interview(book, base_spec(storeys=2), at=AT)
    while not interview.done:
        question = interview.current.question
        if question.essential:
            turn = interview.answer(ESSENTIAL_ANSWERS[question.id])
            assert turn.decision == "accept", (question.id, turn.reason)
        else:
            turn = interview.skip()
            assert turn.decision == "fallback", (question.id, turn.decision, turn.reason)

    validate_spec(interview.spec)
    progress = interview.progress()
    assert progress["done"] and not progress["openEssential"]

    # Defaults, registry and area-default fallbacks all landed as authored.
    assert interview.spec["project"]["displayUnits"] == {"length": "ft", "area": "sqft", "currency": "BDT"}
    assert interview.spec["pricing"] == {"currency": "BDT", "source": "fetched"}
    assert interview.spec["site"]["soil"]["status"] == "area_default"
    assert interview.spec["building"]["storeys"]["hasBasement"] is False
    assert interview.spec["building"]["unitsPerFloor"] == 1
    assert interview.spec["site"]["plot"]["cornerPlot"] is False
    assert interview.spec["phases"][2]["data"]["unitsPerFloor"] == 1

    # Symbolic fallbacks are never invented: they are declared pending, with their statement.
    pending_questions = {item["question"] for item in progress["pending"]}
    assert {"authority", "excavation-depth-req"} <= pending_questions
    authority = next(item for item in progress["pending"] if item["question"] == "authority")
    assert authority["kind"] == "registry"
    assert "derived from the location" in authority["assumption"]["en"].lower()

    assumption_ids = {entry["id"] for entry in interview.spec["assumptions"]}
    assert {"asm-soil-has-report", "asm-material-prices", "asm-adjacent-close"} <= assumption_ids
    soil_assumption = next(entry for entry in interview.spec["assumptions"] if entry["id"] == "asm-soil-has-report")
    assert soil_assumption["basis"] == "area_default"
    assert soil_assumption["verifyOnSite"] is True
    assert soil_assumption["relatedPath"] == "/site/soil/status"

    # Every question still has an outcome (no silent gaps), even the skipped chain.
    coverage = interview.coverage()
    assert len(coverage) == len(book.questions) + len(book.flow("floor").questions)
    assert {entry["outcome"] for entry in coverage.values()} <= {
        "answered",
        "fallback",
        "omitted",
        "skipped",
    }
    assert coverage["soil-report-file"]["reason"] == "condition"
    assert coverage["old-building-action"]["reason"] == "condition"
    assert coverage["pile-preference"]["reason"] == "condition"


# ------------------------------------------------------------------- one question


def test_essential_question_stays_open_and_writes_nothing(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT)
    original = copy.deepcopy(interview.spec)
    turn = interview.skip()
    assert turn.decision == "ask_again" and turn.reason == "essential_open"
    assert turn.ops == ()
    assert interview.current.question.id == "project-name"
    assert interview.spec == original
    assert interview.progress()["openEssential"] == ["project-name"]

    accepted = interview.answer("Green Villa")
    assert accepted.decision == "accept"
    assert interview.progress()["openEssential"] == []
    assert interview.current.question.id == "display-units"


def test_display_units_writes_area_and_length(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT)
    interview.answer("Green Villa")
    turn = interview.answer("bangla land")
    assert turn.decision == "accept" and turn.value == "bangla-land"
    assert interview.spec["project"]["displayUnits"]["area"] == "katha"
    assert interview.spec["project"]["displayUnits"]["length"] == "ft"
    assert interview.spec["provenance"]["/project/displayUnits/area"]["source"] == "user"
    assert interview.spec["provenance"]["/project/displayUnits/length"]["source"] == "user"


def test_chip_answers_bypass_the_parser(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT)
    interview.answer("Green Villa")
    turn = interview.answer("", choice="metric")
    assert turn.decision == "accept" and turn.value == "metric"
    assert interview.spec["project"]["displayUnits"]["area"] == "sqm"


def test_number_answers_are_converted_and_echoed_in_display_units(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT, lang="bn")
    interview.answer("সবুজ ভিলা")
    interview.answer("metric")
    interview.answer("ঢাকা")
    interview.answer("ঢাকা")
    interview.skip()  # area name: omit
    turn = interview.answer("5 katha")
    assert turn.decision == "accept"
    assert interview.spec["site"]["plot"]["areaSqm"] == pytest.approx(334.45)
    assert "৩৩৪.৪৫" in turn.reply["bn"]
    assert "বর্গমিটার" in turn.reply["bn"]


def test_default_fallback_records_an_authored_assumption(book, base_spec) -> None:
    spec = base_spec()
    spec["site"]["plot"]["existingStructure"] = False  # setup already answered
    interview = Interview(book, spec, flows=["site-excavation"], at=AT, skip_answered=True)
    while interview.current.question.id != "adjacent-close":
        interview.skip()
    turn = interview.skip()
    assert turn.decision == "fallback" and turn.reason == "fallback:default"
    assert interview.spec["phases"][0]["data"]["adjacentStructuresClose"] is True
    entry = next(item for item in interview.spec["assumptions"] if item["id"] == "asm-adjacent-close")
    assert entry["basis"] == "conservative_default"
    assert entry["verifyOnSite"] is False
    assert interview.spec["provenance"]["/phases/site-excavation/data/adjacentStructuresClose"]["source"] == "default"


def test_schema_invalid_answer_is_reasked_not_written(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["floor"], storey_index=1, at=AT)
    assert interview.current.question.id == "typical-floor-height"
    turn = interview.answer("1.5 m")
    assert turn.decision == "ask_again" and turn.reason == "schema"
    assert interview.current.question.id == "typical-floor-height"
    assert "typicalFloorHeightM" not in interview.spec["building"]["storeys"]

    accepted = interview.answer("3 m")
    assert accepted.decision == "accept"
    assert interview.spec["building"]["storeys"]["typicalFloorHeightM"] == pytest.approx(3.0)


def test_derive_fills_floor_units_from_the_building(book, base_spec) -> None:
    spec = base_spec()
    spec["building"]["unitsPerFloor"] = 2
    interview = Interview(book, spec, flows=["floor"], storey_index=0, at=AT)
    turns = []
    while not interview.done:
        turns.append(interview.skip())
    derive = next(turn for turn in turns if turn.question_id == "units-override")
    assert derive.decision == "fallback" and derive.reason == "fallback:derive"
    data = interview.spec["phases"][2]["data"]
    assert data["unitsPerFloor"] == 2
    entry = interview.spec["provenance"]["/phases/floor-0/data/unitsPerFloor"]
    assert entry["source"] == "engine"
    assert "/building/unitsPerFloor" in entry["detail"]
    assert data["usage"] == "residential"
    assert data["attachedBathPerBedroom"] is True


def test_pricing_yes_is_user_and_no_runs_the_registry_fallback(book, base_spec) -> None:
    yes = drive_to(book, base_spec(), "material-prices", flows=["setup"])
    turn = yes.answer("yes")
    assert turn.decision == "accept"
    assert yes.spec["pricing"] == {"currency": "BDT", "source": "user"}
    assert yes.spec["provenance"]["/pricing/source"]["source"] == "user"

    no = drive_to(book, base_spec(), "material-prices", flows=["setup"])
    turn = no.answer("no")
    assert turn.decision == "fallback" and turn.reason == "fallback:registry"
    assert no.spec["pricing"] == {"currency": "BDT", "source": "fetched"}
    assert no.spec["provenance"]["/pricing/source"]["source"] == "assumption"
    assert "asm-material-prices" in {entry["id"] for entry in no.spec["assumptions"]}


def test_authority_not_sure_goes_pending_not_invalid(book, base_spec) -> None:
    interview = drive_to(book, base_spec(), "authority", flows=["setup"])
    turn = interview.answer("not sure")
    assert turn.decision == "fallback" and turn.reason == "fallback:registry_pending"
    assert "site" in interview.spec
    assert "jurisdiction" not in interview.spec["site"]
    pending = interview.progress()["pending"]
    assert pending and pending[0]["question"] == "authority"
    assert pending[0]["kind"] == "registry"


def test_soil_no_report_uses_area_default_and_records_the_assumption(book, base_spec) -> None:
    interview = drive_to(book, base_spec(), "soil-has-report", flows=["setup"])
    turn = interview.answer("no")
    assert turn.decision == "fallback" and turn.reason == "fallback:area_default"
    assert interview.spec["site"]["soil"]["status"] == "area_default"
    entry = interview.spec["provenance"]["/site/soil/status"]
    assert entry["source"] == "assumption"
    assumption = next(item for item in interview.spec["assumptions"] if item["id"] == "asm-soil-has-report")
    assert "SBC 65 kPa" in assumption["statement"]
    assert interview.done  # the soil chain's conditional questions never ran


# -------------------------------------------------------------- escalation seam


def test_parse_failure_escalates_and_model_value_is_low_confidence(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT)
    interview.answer("Green Villa")
    turn = interview.answer("something odd")
    assert turn.decision == "escalate"
    assert turn.escalation is not None
    assert turn.escalation["questionId"] == "display-units"
    assert turn.escalation["pointer"] == "/project/displayUnits/area"
    assert turn.escalation["answer"] == "something odd"
    assert [option["value"] for option in turn.escalation["options"]] == ["metric", "feet-inch", "bangla-land"]
    assert "JSON" in turn.escalation["instruction"]

    accepted = interview.accept_external("metric")
    assert accepted.decision == "accept"
    entry = interview.spec["provenance"]["/project/displayUnits/area"]
    assert entry["source"] == "user"
    assert entry["confidence"] == "low"
    assert entry["detail"] == "model-parsed (escalation)"


def test_invalid_model_value_is_rejected_without_a_write(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT)
    interview.answer("Green Villa")
    turn = interview.accept_external("not-an-option")
    assert turn.decision == "ask_again" and turn.reason == "model_invalid"
    assert interview.current.question.id == "display-units"
    assert interview.spec["project"]["displayUnits"]["area"] == "sqm"


# -------------------------------------------------------------------- lifecycle


def test_finish_applies_fallbacks_and_lists_open_essentials(book, base_spec) -> None:
    interview = Interview(book, base_spec(), flows=["setup"], at=AT)
    turns = interview.finish()
    assert turns and interview.done
    assert set(interview.progress()["openEssential"]) == {
        "project-name",
        "division",
        "district",
        "plot-area",
        "road-width",
        "storeys-count",
    }
    assert interview.spec["project"]["displayUnits"]["area"] == "sqft"  # default
    assert interview.progress()["fallback"] > 0


def test_skip_answered_resumes_without_reasking(book, base_spec) -> None:
    spec = base_spec()
    spec["project"]["name"] = "Existing Project"
    interview = Interview(book, spec, flows=["setup"], at=AT, skip_answered=True)
    assert interview.current.question.id == "area-name"
    assert interview.coverage()["project-name"]["reason"] == "already_answered"
    assert interview.coverage()["display-units"]["reason"] == "already_answered"

    spec["site"]["plot"]["existingStructure"] = True
    scoped = Interview(book, spec, flows=["site-excavation"], at=AT, skip_answered=True)
    assert scoped.current.question.id == "old-building-action"


def test_invalid_spec_and_unknown_flow_are_refused(book, base_spec) -> None:
    broken = base_spec()
    broken["project"]["name"] = ""
    with pytest.raises(InterviewError):
        Interview(book, broken)
    with pytest.raises(FlowBookError):
        Interview(book, base_spec(), flows=["nope"])
    with pytest.raises(SpecValidationError):
        validate_spec(broken)
