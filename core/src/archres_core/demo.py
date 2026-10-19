"""Chat-loop demo v0 (W1.12): a scripted project walked through the real interview.

A scenario is data: a project spec, the flows to run, a language, and answers keyed by
question id (optionally per storey). The runner drives `agent.Session` exactly like the app
will — prompt, answer, fallback, escalation, revision — and writes the artifacts a reviewer
needs: spec, transcript, coverage, summary.

The demo is honest by construction:

- an **essential** question with no scripted answer is a scenario error (the runner will
  not let a required question stall or be silently assumed);
- any other unanswered question uses its **authored fallback** (never an invented value);
- an escalation with no model attached is an error, not a retry loop;
- the report lists open essentials, pending engine work and final revision.

This module is also the seed of the W1.9 eval harness: scenarios are reusable project
fixtures, and the report is a deterministic record of what the brain did with them.
"""

from __future__ import annotations

import datetime
import json
import pathlib
from dataclasses import dataclass, field
from typing import Any

from .agent import Session
from .interview import FlowBook

SCENARIO_KEYS = {"name", "title", "language", "flows", "spec", "answers", "maxTurns", "notes"}
ANSWER_KEYS = {"text", "choice", "skip", "default"}
ANSWER_KINDS = ("text", "choice", "skip", "default")


class DemoError(RuntimeError):
    """The scenario or the conversation cannot proceed as written."""


@dataclass(frozen=True)
class Answer:
    kind: str
    text: str | None = None
    choice: str | None = None


@dataclass(frozen=True)
class Scenario:
    path: pathlib.Path
    name: str
    title: dict[str, str]
    language: str
    flows: tuple[str, ...]
    spec_path: pathlib.Path
    answers: dict[str, Answer]
    max_turns: int
    notes: str = ""

    def answer(self, question_id: str, storey_index: int | None = None) -> Answer | None:
        if storey_index is not None:
            specific = self.answers.get(f"{question_id}@{storey_index}")
            if specific is not None:
                return specific
        return self.answers.get(question_id)

    def spec(self) -> dict[str, Any]:
        try:
            return json.loads(self.spec_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise DemoError(f"scenario spec not found: {self.spec_path}") from None
        except ValueError as exc:
            raise DemoError(f"scenario spec is not valid JSON: {exc}") from exc


def _text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise DemoError(f"{where}: expected non-empty text")
    return value.strip()


def _answer(value: Any, where: str) -> Answer:
    if isinstance(value, str):
        return Answer("text", text=value)
    if not isinstance(value, dict):
        raise DemoError(f"{where}: an answer must be text or an object")
    unknown = sorted(set(value) - ANSWER_KEYS)
    if unknown:
        raise DemoError(f"{where}: unknown answer key(s) {unknown}")
    if len(value) != 1:
        raise DemoError(f"{where}: an answer needs exactly one of {ANSWER_KINDS}")
    kind = next(iter(value))
    if kind == "text":
        return Answer("text", text=_text(value[kind], where))
    if kind == "choice":
        return Answer("choice", choice=_text(value[kind], where))
    if value[kind] is not True:
        raise DemoError(f"{where}: {kind} must be true")
    return Answer(kind)


def load_scenario(path: str | pathlib.Path, book: FlowBook) -> Scenario:
    """Load and validate a scenario against the flow book (unknown ids are errors)."""
    scenario_path = pathlib.Path(path)
    try:
        data = json.loads(scenario_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise DemoError(f"scenario not found: {scenario_path}") from None
    except ValueError as exc:
        raise DemoError(f"scenario is not valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise DemoError("scenario must be an object")
    unknown = sorted(set(data) - SCENARIO_KEYS)
    if unknown:
        raise DemoError(f"scenario: unknown key(s) {unknown}")
    for key in ("name", "title", "language", "flows", "spec", "answers"):
        if key not in data:
            raise DemoError(f"scenario: missing key {key!r}")

    name = _text(data["name"], "scenario.name")
    title = data["title"]
    if not isinstance(title, dict) or set(title) != {"en", "bn"}:
        raise DemoError("scenario.title must be {en, bn}")
    title = {lang: _text(title[lang], f"scenario.title.{lang}") for lang in ("en", "bn")}
    language = _text(data["language"], "scenario.language")
    if language not in ("en", "bn"):
        raise DemoError(f"scenario.language must be en or bn, got {language!r}")

    flows = data["flows"]
    if not isinstance(flows, list) or not flows:
        raise DemoError("scenario.flows must be a non-empty array")
    seen: list[str] = []
    for flow in flows:
        if not isinstance(flow, str) or not flow:
            raise DemoError("scenario.flows: entries must be flow ids")
        if flow not in {item.id for item in book.flows}:
            raise DemoError(f"scenario.flows: unknown flow {flow!r}")
        if flow in seen:
            raise DemoError(f"scenario.flows: duplicate flow {flow!r}")
        seen.append(flow)

    spec_path = (scenario_path.parent / _text(data["spec"], "scenario.spec")).resolve()
    if not spec_path.is_file():
        raise DemoError(f"scenario.spec: file not found: {spec_path}")

    raw_answers = data["answers"]
    if not isinstance(raw_answers, dict) or not raw_answers:
        raise DemoError("scenario.answers must be a non-empty object")
    by_id = book.by_id
    answers: dict[str, Answer] = {}
    for key, value in raw_answers.items():
        if not isinstance(key, str) or not key:
            raise DemoError("scenario.answers: keys must be question ids")
        if "@" in key:
            base, _, raw_storey = key.partition("@")
            try:
                storey = int(raw_storey)
            except ValueError:
                raise DemoError(f"scenario.answers: invalid storey suffix in {key!r}") from None
            if storey < 0:
                raise DemoError(f"scenario.answers: negative storey in {key!r}")
        else:
            base = key
        if base not in by_id:
            raise DemoError(f"scenario.answers: unknown question id {key!r}")
        answers[key] = _answer(value, f"scenario.answers[{key!r}]")

    max_turns = data.get("maxTurns", 200)
    if not isinstance(max_turns, int) or isinstance(max_turns, bool) or max_turns < 1:
        raise DemoError("scenario.maxTurns must be a positive integer")
    notes = data.get("notes", "")
    if not isinstance(notes, str):
        raise DemoError("scenario.notes must be text")

    return Scenario(
        path=scenario_path,
        name=name,
        title=title,
        language=language,
        flows=tuple(seen),
        spec_path=spec_path,
        answers=answers,
        max_turns=max_turns,
        notes=notes,
    )


@dataclass
class DemoReport:
    scenario: str
    language: str
    steps: int
    decisions: dict[str, int]
    open_essential: list[str]
    pending: list[dict[str, Any]]
    model_calls: int
    revision: dict[str, Any] | None
    coverage: dict[str, dict[str, Any]]
    transcript: list[dict[str, Any]]
    spec: dict[str, Any]
    startedAt: str
    elapsedSeconds: float
    notes: str = field(default="")

    def summary(self) -> dict[str, Any]:
        return {
            "scenario": self.scenario,
            "language": self.language,
            "startedAt": self.startedAt,
            "elapsedSeconds": self.elapsedSeconds,
            "steps": self.steps,
            "decisions": dict(sorted(self.decisions.items())),
            "openEssential": list(self.open_essential),
            "pending": list(self.pending),
            "modelCalls": self.model_calls,
            "revision": self.revision,
            "coverage": {"steps": len(self.coverage)},
            "notes": self.notes,
        }

    @property
    def ok(self) -> bool:
        return not self.open_essential and self.revision is not None


class DemoRunner:
    """Drive one scenario through a live `Session`, narrating as it goes."""

    def __init__(self, session: Session, scenario: Scenario, *, say=None) -> None:
        self.session = session
        self.scenario = scenario
        self.say = say or (lambda _text: None)
        self.decisions: dict[str, int] = {}

    def run(self) -> DemoReport:
        started = datetime.datetime.now(datetime.timezone.utc)
        steps = 0
        stuck_key: tuple[str, Any] | None = None
        while not self.session.done:
            if steps >= self.scenario.max_turns:
                raise DemoError(f"scenario exceeded maxTurns ({self.scenario.max_turns}) - is a question stuck?")
            prompt = self.session.prompt()
            question_id = prompt["questionId"]
            step = self.session.interview.current
            if step is None:  # pragma: no cover - prompt() already proved this
                break
            answer = self.scenario.answer(question_id, prompt["storeyIndex"])
            self._narrate(prompt)
            if answer is None:
                if step.question.essential:
                    raise DemoError(
                        f"scenario has no answer for essential question {question_id!r} "
                        f"(storey {prompt['storeyIndex']})"
                    )
                result = self.session.use_default()
            elif answer.kind == "skip":
                result = self.session.skip()
            elif answer.kind == "default":
                result = self.session.use_default()
            elif answer.kind == "choice":
                result = self.session.respond(choice=answer.choice)
            else:
                result = self.session.respond(answer.text or "")
            key = (question_id, prompt["storeyIndex"])
            if result.decision == "ask_again" and key == stuck_key:
                raise DemoError(
                    f"scenario answer for {question_id!r} was rejected twice "
                    f"({result.turn.reason}); fix the scenario, not the runner"
                )
            stuck_key = key if result.decision == "ask_again" else None
            steps += 1
            self.decisions[result.decision] = self.decisions.get(result.decision, 0) + 1
            self.say(f"  -> {_reply_text(result.turn.reply, self.scenario.language) or result.decision}")
            if result.decision == "ask_again" and result.model is not None:
                raise DemoError(
                    f"the model's value for {question_id!r} was rejected by the engine "
                    f"({result.turn.reason}); the demo will not guess"
                )
            if result.decision == "escalate":
                if self.session.client is None:
                    raise DemoError(
                        f"no model is attached to read {question_id!r}; "
                        "start the fleet (--root) or pass --base-url"
                    )
                raise DemoError(
                    f"the model could not read {question_id!r}: {result.error or result.turn.reason}"
                )
        turns = self.session.finish()
        if turns:
            self.say(f"  -> finish applied {len(turns)} fallback/open outcome(s)")
        progress = self.session.interview.progress()
        tip = self.session.store.tip() if self.session.store is not None else None
        elapsed = (datetime.datetime.now(datetime.timezone.utc) - started).total_seconds()
        report = DemoReport(
            scenario=self.scenario.name,
            language=self.scenario.language,
            steps=steps,
            decisions=dict(self.decisions),
            open_essential=list(progress["openEssential"]),
            pending=[dict(item) for item in progress["pending"]],
            model_calls=sum(1 for event in self.session.transcript if event["type"] == "model_request"),
            revision={
                "number": tip.number,
                "sha256": tip.sha256,
                "ops": list(tip.ops),
            }
            if tip is not None
            else None,
            coverage=self.session.coverage(),
            transcript=list(self.session.transcript),
            spec=self.session.spec,
            startedAt=started.isoformat(timespec="seconds"),
            elapsedSeconds=round(elapsed, 3),
            notes=self.scenario.notes,
        )
        return report

    def _narrate(self, prompt: dict[str, Any]) -> None:
        language = self.scenario.language
        ask = prompt.get("ask", {}).get(language) if isinstance(prompt.get("ask"), dict) else prompt.get("ask")
        chips = prompt.get("chips") or []
        labels = " · ".join(
            chip.get("label", {}).get(language, str(chip.get("id"))) if isinstance(chip.get("label"), dict) else str(chip.get("id"))
            for chip in chips[:5]
        )
        self.say(f"[{prompt['questionId']}] {ask}" + (f"\n    {labels}" if labels else ""))


def _reply_text(reply: Any, language: str) -> str:
    if isinstance(reply, dict):
        return str(reply.get(language) or reply.get("en") or "")
    return str(reply or "")


def write_report(report: DemoReport, out_dir: str | pathlib.Path) -> pathlib.Path:
    """Write spec, transcript, coverage and summary; return the directory."""
    path = pathlib.Path(out_dir)
    path.mkdir(parents=True, exist_ok=True)
    payloads = {
        "spec.json": report.spec,
        "transcript.json": report.transcript,
        "coverage.json": report.coverage,
        "summary.json": report.summary(),
    }
    for name, payload in payloads.items():
        (path / name).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
        )
    return path
