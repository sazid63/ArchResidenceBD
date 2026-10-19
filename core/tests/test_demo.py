"""Chat-loop demo (W1.12): scenarios are data, the runner is honest, the CLI is the interface.

The committed BN/EN scenarios must cover every essential question; a missing one is a
scenario error, not a stalled conversation. The CLI test runs the real interface the user
will type (with `--no-model`, so it is deterministic and offline).
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.agent import ScriptedClient, Session
from archres_core.demo import (
    Answer,
    DemoError,
    DemoRunner,
    Scenario,
    load_scenario,
    write_report,
)
from archres_core.interview import load_book

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "tools" / "demo" / "scenarios"
DEMO_SPEC = ROOT / "tools" / "demo" / "scenarios" / "demo-project.json"
CLI = ROOT / "tools" / "demo" / "chat_loop.py"


def _scenario(base_spec, tmp_path, answers: dict, *, flows=("setup",), language="en") -> Scenario:
    spec_path = tmp_path / "spec.json"
    spec_path.write_text(json.dumps(base_spec(), ensure_ascii=False), encoding="utf-8")
    return Scenario(
        path=tmp_path / "scenario.json",
        name="test",
        title={"en": "Test", "bn": "পরীক্ষা"},
        language=language,
        flows=tuple(flows),
        spec_path=spec_path,
        answers={key: value if isinstance(value, Answer) else Answer("text", text=value) for key, value in answers.items()},
        max_turns=100,
    )


SETUP_ANSWERS = {
    "project-name": Answer("text", text="Demo House"),
    "display-units": Answer("choice", choice="metric"),
    "division": Answer("choice", choice="dhaka"),
    "district": Answer("text", text="Dhaka"),
    "plot-area": Answer("text", text="5 katha"),
    "road-width": Answer("text", text="20 ft"),
    "storeys-count": Answer("text", text="2"),
}


def test_committed_scenarios_cover_every_essential() -> None:
    book = load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml")
    essential = {question.id for question in book.questions if question.essential}
    for name in ("dhaka-house-bn.json", "dhaka-house-en.json"):
        scenario = load_scenario(SCENARIOS / name, book)
        assert scenario.language in ("bn", "en")
        assert len(scenario.flows) == 6
        assert essential <= set(scenario.answers), f"{name} misses {essential - set(scenario.answers)}"
        assert scenario.spec()["building"]["storeys"]["count"] == 2
        assert scenario.spec_path == DEMO_SPEC


@pytest.mark.parametrize(
    ("mutate", "match"),
    [
        (lambda data: data.__setitem__("language", "fr"), "language"),
        (lambda data: data["flows"].append("nope"), "unknown flow"),
        (lambda data: data["flows"].append("setup"), "duplicate flow"),
        (lambda data: data["answers"].__setitem__("nope", "x"), "unknown question"),
        (lambda data: data["answers"].__setitem__("plot-area", {"text": "", "choice": "x"}), "exactly one"),
        (lambda data: data["answers"].__setitem__("plot-area", {"skip": False}), "must be true"),
        (lambda data: data.__setitem__("surprise", 1), "unknown key"),
        (lambda data: data.__setitem__("maxTurns", 0), "maxTurns"),
        (lambda data: data.__setitem__("title", {"en": "x"}), "title"),
    ],
)
def test_scenario_refusals(tmp_path, mutate, match: str) -> None:
    raw = json.loads((SCENARIOS / "dhaka-house-bn.json").read_text(encoding="utf-8"))
    raw["spec"] = str(DEMO_SPEC)
    mutate(raw)
    path = tmp_path / "scenario.json"
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    with pytest.raises(DemoError, match=match):
        load_scenario(path, load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml"))


def test_storey_specific_answers_win(tmp_path) -> None:
    scenario = Scenario(
        path=tmp_path / "s.json",
        name="s",
        title={"en": "S", "bn": "এস"},
        language="en",
        flows=("floor",),
        spec_path=DEMO_SPEC,
        answers={"ground-floor-height": Answer("text", text="3 m"), "ground-floor-height@1": Answer("text", text="3.5 m")},
        max_turns=10,
    )
    assert scenario.answer("ground-floor-height", 0).text == "3 m"
    assert scenario.answer("ground-floor-height", 1).text == "3.5 m"
    assert scenario.answer("ground-floor-height") is not None


def test_runner_completes_setup_and_writes_artifacts(tmp_path, base_spec) -> None:
    scenario = _scenario(base_spec, tmp_path, SETUP_ANSWERS)
    session_book = load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml")
    session = Session.create(
        session_book,
        tmp_path / "store",
        scenario.spec(),
        language="en",
        flows=["setup"],
    )
    report = DemoRunner(session, scenario).run()
    assert report.ok
    assert not report.open_essential
    assert len(report.coverage) == len(session_book.flow("setup").questions)
    assert report.steps == 19
    assert report.decisions.get("accept", 0) == 7
    assert report.decisions.get("fallback", 0) == 12
    assert report.revision and report.revision["number"] > 0
    out = write_report(report, tmp_path / "out")
    files = {path.name for path in out.iterdir()}
    assert files == {"spec.json", "transcript.json", "coverage.json", "summary.json"}
    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    assert summary["scenario"] == "test"
    assert summary["steps"] == 19
    assert json.loads((out / "spec.json").read_text(encoding="utf-8"))["project"]["name"] == "Demo House"


def test_runner_uses_the_model_for_an_escalation(tmp_path, base_spec) -> None:
    answers = dict(SETUP_ANSWERS)
    answers["display-units"] = Answer("text", text="measurements like back home")
    scenario = _scenario(base_spec, tmp_path, answers)
    client = ScriptedClient(replies=['{"value": "metric", "unit": null}'])
    session = Session.create(
        load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml"),
        tmp_path / "store",
        scenario.spec(),
        client=client,
        language="en",
        flows=["setup"],
    )
    report = DemoRunner(session, scenario).run()
    assert report.ok
    assert report.model_calls == 1
    assert report.decisions.get("accept", 0) == 7
    assert session.spec["project"]["displayUnits"]["area"] == "sqm"


def test_runner_refuses_a_missing_essential(tmp_path, base_spec) -> None:
    answers = dict(SETUP_ANSWERS)
    answers.pop("storeys-count")
    scenario = _scenario(base_spec, tmp_path, answers)
    session = Session.create(
        load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml"),
        tmp_path / "store",
        scenario.spec(),
        language="en",
        flows=["setup"],
    )
    with pytest.raises(DemoError, match="essential question 'storeys-count'"):
        DemoRunner(session, scenario).run()


def test_runner_refuses_an_escalation_without_a_model(tmp_path, base_spec) -> None:
    answers = dict(SETUP_ANSWERS)
    answers["display-units"] = Answer("text", text="measurements like back home")
    scenario = _scenario(base_spec, tmp_path, answers)
    session = Session.create(
        load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml"),
        tmp_path / "store",
        scenario.spec(),
        language="en",
        flows=["setup"],
    )
    with pytest.raises(DemoError, match="no model is attached"):
        DemoRunner(session, scenario).run()


def test_runner_stops_a_rejected_answer_instead_of_looping(tmp_path, base_spec) -> None:
    answers = dict(SETUP_ANSWERS)
    answers["display-units"] = Answer("choice", choice="nope")
    scenario = _scenario(base_spec, tmp_path, answers)
    session = Session.create(
        load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml"),
        tmp_path / "store",
        scenario.spec(),
        language="en",
        flows=["setup"],
    )
    with pytest.raises(DemoError, match="rejected twice"):
        DemoRunner(session, scenario).run()


def test_scenario_needs_a_real_spec(tmp_path, base_spec) -> None:
    scenario = _scenario(base_spec, tmp_path, SETUP_ANSWERS)
    scenario.spec_path.unlink()
    with pytest.raises(DemoError, match="spec not found"):
        scenario.spec()


def _run_cli(
    *args: str, out: pathlib.Path, extra_env: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    """Run the demo CLI the way a shell, a CI runner or the desktop sidecar would capture it."""
    env = dict(os.environ)
    env.pop("ARCHRES_ROOT", None)  # the tests own every path
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [sys.executable, str(CLI), *args, "--out", str(out)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        timeout=120,
    )


def test_cli_runs_the_bengali_demo_offline(tmp_path) -> None:
    out = tmp_path / "demo"
    result = _run_cli(
        "--scenario",
        str(SCENARIOS / "dhaka-house-bn.json"),
        "--no-model",
        "--quiet",
        out=out,
    )
    assert result.returncode == 0, result.stderr
    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    assert summary["scenario"] == "dhaka-house-bn"
    assert summary["openEssential"] == []
    assert summary["steps"] == 63
    assert len(list((out / "store" / "revisions").glob("*.json"))) == 64


def test_the_cli_survives_a_cp1252_console(tmp_path) -> None:
    """Windows pipes are cp1252, and the narration is Bangla - this used to crash.

    `--quiet` is deliberately off: the per-question Bangla text is what raised
    ``UnicodeEncodeError`` the moment the shell captured stdout.
    """
    result = _run_cli(
        "--scenario",
        str(SCENARIOS / "dhaka-house-bn.json"),
        "--no-model",
        out=tmp_path / "demo",
        extra_env={"PYTHONIOENCODING": "cp1252", "PYTHONUTF8": "0"},
    )
    assert result.returncode == 0, result.stderr
    assert "UnicodeEncodeError" not in result.stderr
    assert "মন্ডি" in result.stdout  # the Bangla title really did come out as UTF-8


def test_the_cli_resolves_a_relative_install_root_against_the_repo(tmp_path) -> None:
    """`uv run --directory core` runs from core/, so a bare relative root must not follow it."""
    missing = "data/downloads/no-such-install-root"
    result = _run_cli(
        "--scenario",
        str(SCENARIOS / "dhaka-house-en.json"),
        "--root",
        missing,
        out=tmp_path / "demo",
    )
    assert result.returncode == 1
    found = result.stderr.replace("\\", "/")
    assert (ROOT / missing).as_posix() in found
    assert (ROOT / "core" / missing).as_posix() not in found
