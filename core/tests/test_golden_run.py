"""The golden full run (W6.1): the app's whole flow, through the channel the app speaks.

The laws these tests hold:

- **the run goes through the bridge** ✓ — the same channel the desktop shell speaks ✓, so
  a green run says something about the product ✓ and not about a side door ✓ ✓;
- **the interview lands on the golden project** ✓ — the facts the interview owns are the
  golden example's ✓ ✓;
- **the money adds up** ✓ — every priced line is quantity × rate ✓, the phases add to the
  total ✓, and the unpriced lines are **named** ✓ (never silently dropped ✓ ✓);
- **the card says what it is** ✓ — the money carries the card's status ✓ ✓;
- **the golden answers cover every question** ✓ — a question with no answer would take its
  default, and a default nobody counted is a default nobody checked ✓ ✓ ✓.
"""

from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile

import pytest

from archres_core.bridge import Bridge
from archres_core.interview import load_book

ROOT = pathlib.Path(__file__).resolve().parents[2]
RUNNER = ROOT / "tools" / "pilot" / "golden_run.py"
ANSWERS = ROOT / "tools" / "pilot" / "golden-answers.json"
BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"


def _runner():
    spec = importlib.util.spec_from_file_location("archres_golden_run", RUNNER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_golden_run_lands_on_the_golden_project(tmp_path: pathlib.Path) -> None:
    """The whole flow, end to end ✓ — and every check green ✓ ✓."""
    module = _runner()
    summary = module.run(tmp_path / "golden", "Mirpur Golden House")

    assert all(summary["checks"].values()), summary["checks"]
    assert summary["interview"]["defaulted"] == 0, "a question took its default"
    assert summary["interview"]["questions"] > 40
    assert summary["project"]["storeys"] == 2
    assert summary["design"]["counts"]["stages"] > 0
    assert summary["boq"]["lines"] > 0
    assert summary["boq"]["totals"]["amountBdt"] > 0
    assert summary["bundle"]["files"] > 0


def test_the_money_names_the_unpriced_lines(tmp_path: pathlib.Path) -> None:
    """An unpriced line is **named** ✓ — never a number that looks like money ✓ ✓."""
    module = _runner()
    answers = module._answers()
    bridge = Bridge(root=ROOT)
    projects = tmp_path / "projects"
    projects.mkdir(parents=True, exist_ok=True)

    created = bridge.handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {
                "name": "Golden House",
                "template": "new-project",
                "projects": str(projects),
            },
        }
    )["result"]
    walked = module._interview(bridge, created["sessionId"], created["prompt"], answers)
    assert walked["asked"] > 40

    result = bridge.handle(
        {
            "id": "2",
            "method": "boq.build",
            "params": {"project": created["path"]},
        }
    )["result"]
    boq = result["boq"]
    unpriced = {line["key"] for line in boq["lines"] if not line.get("priced")}
    assert set(boq["totals"]["unpricedLines"]) == unpriced
    assert result["pricedFrom"]["status"] in {"candidate", "active"}


def test_the_design_run_reports_its_counts_and_its_assumptions(
    tmp_path: pathlib.Path,
) -> None:
    """The design names what it assumed ✓ — an assumed number nobody can see is a number
    nobody can check ✓ ✓."""
    module = _runner()
    bridge = Bridge(root=ROOT)
    projects = tmp_path / "projects"
    projects.mkdir(parents=True, exist_ok=True)
    created = bridge.handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {
                "name": "Golden House",
                "template": "new-project",
                "projects": str(projects),
            },
        }
    )["result"]
    module._interview(
        bridge, created["sessionId"], created["prompt"], module._answers()
    )
    bridge.handle(
        {"id": "2", "method": "session.finish", "params": {"sessionId": created["sessionId"]}}
    )

    result = bridge.handle(
        {"id": "3", "method": "design.run", "params": {"project": created["path"]}}
    )["result"]
    # the interview owns the name ✓ - the question's pointer is `/project/name` ✓, so the
    # golden answer wins over the name the project was created with ✓ ✓
    assert result["projectName"] == "Mirpur Golden House"
    assert result["storeys"] == 2
    assert result["counts"]["typicalFloors"] == 1
    assert result["counts"]["stages"] > 0
    assert result["counts"]["assumptions"] == len(result["assumptions"])
    for assumption in result["assumptions"]:
        assert assumption["statement"]
        assert assumption["verifyOnSite"] is True


def test_the_design_run_needs_a_project() -> None:
    """A missing project is an error ✓ — not a guess ✓ ✓."""
    response = Bridge(root=ROOT).handle(
        {"id": "1", "method": "design.run", "params": {}}
    )
    assert response["error"]["code"] == "invalid_params"
    assert "project" in response["error"]["message"]


def test_the_design_run_refuses_a_project_that_is_not_there() -> None:
    """A folder with no project in it is an error ✓ ✓."""
    with tempfile.TemporaryDirectory() as temp:
        response = Bridge(root=ROOT).handle(
            {"id": "1", "method": "design.run", "params": {"project": temp}}
        )
    assert response["error"]["code"] == "invalid_params"


def test_the_finished_interview_returns_its_turns() -> None:
    """The interview's close returns the turns it applied ✓ — a list ✓, not one turn ✓ ✓.

    (The golden run found this: the bridge asked a list for its ``to_dict`` ✓.)
    """
    bridge = Bridge(root=ROOT)
    with tempfile.TemporaryDirectory() as temp:
        created = bridge.handle(
            {
                "id": "1",
                "method": "project.create",
                "params": {
                    "name": "Golden House",
                    "template": "new-project",
                    "projects": str(pathlib.Path(temp) / "projects"),
                },
            }
        )["result"]
        result = bridge.handle(
            {
                "id": "2",
                "method": "session.finish",
                "params": {"sessionId": created["sessionId"]},
            }
        )
    assert "error" not in result, result.get("error")
    assert isinstance(result["result"]["turns"], list)
    assert result["result"]["turnCount"] == len(result["result"]["turns"])


def test_the_golden_answers_cover_every_essential_question() -> None:
    """Every **essential** question has a golden answer ✓ ✓.

    An essential question with no answer would stop the run ✓ (the engine refuses to
    guess ✓) — so this is a guard on the answers, not on the run ✓ ✓. The questions that
    are *not* essential may take their authored default ✓, and the run counts them ✓
    (the run's own check: **0 defaulted** ✓ ✓).
    """
    book = load_book(BOOK)
    answers = json.loads(ANSWERS.read_text(encoding="utf-8"))
    answers = {key: value for key, value in answers.items() if not key.startswith("$")}

    missing: list[str] = []
    for flow in book.flows:
        for question in flow.questions:
            if question.essential and question.id not in answers:
                missing.append(f"{flow.id}/{question.id}")
    assert not missing, f"the golden answers miss an essential question: {missing}"


def test_the_golden_answers_are_the_questions_the_book_asks() -> None:
    """An answer for a question the book does not ask is a mistake ✓ — it would never be
    read ✓, and it would hide a missing answer ✓ ✓."""
    book = load_book(BOOK)
    answers = json.loads(ANSWERS.read_text(encoding="utf-8"))
    answers = {key: value for key, value in answers.items() if not key.startswith("$")}

    known = {question.id for flow in book.flows for question in flow.questions}
    unknown = sorted(set(answers) - known)
    assert not unknown, f"the golden answers have unknown question(s): {unknown}"


def test_the_run_can_be_called_from_the_command_line(tmp_path: pathlib.Path) -> None:
    """The tool runs ✓ — and writes its record ✓ ✓."""
    module = _runner()
    record = tmp_path / "record.json"
    exit_code = module.main(
        [
            "--root",
            str(tmp_path / "golden"),
            "--name",
            "Golden House",
            "--record",
            str(record),
        ]
    )
    assert exit_code == 0
    summary = json.loads(record.read_text(encoding="utf-8"))
    assert all(summary["checks"].values())
    # the interview owns the name ✓ - the golden answer ✓ (the created name is only the
    # starting one ✓ ✓)
    assert summary["project"]["name"] == "Mirpur Golden House"
