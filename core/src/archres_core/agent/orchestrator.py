"""Orchestrator v0 (W1.10) — one conversation over the interview engine.

The deterministic interview (W1.4) decides *what* is asked and validates every answer;
this session owns the parts around it:

- **the model call** — only for ``decision: escalate`` turns, through the loopback client
  seam; the reply is re-validated by ``Interview.accept_external`` (an unusable reply is a
  visible retry, never a write);
- **revision commits** — every turn that wrote to the spec becomes one ``SpecStore``
  revision, snapshot-recorded so each path keeps the provenance the interview gave it;
- **the transcript** — append-only, JSON-serializable, deterministic (no wall-clock in the
  events; revision timestamps carry the time);
- **the injection watch** — every user/external string is scanned and recorded, and the
  prompt fences it as data (``agent.context`` / ``agent.injection``);
- **the permission layer** — ``check_tool`` answers allow / ask / deny for the tool
  registry (``agent.tools``). Execution itself is not wired in v0.

No network, no model, and no shell is reachable unless the caller supplies a client and a
policy that grants it.
"""

from __future__ import annotations

import pathlib
from dataclasses import dataclass
from typing import Any, Sequence

from ..interview import FlowBook, Interview, Turn
from ..spec import Revision, SpecStore, SpecStoreError, diff_specs
from .client import ModelClient, ModelError, ModelValueError, parse_model_value
from .context import BuiltContext, build_escalation_context
from .injection import Finding, scan
from .tools import Call, Decision, PermissionPolicy

ORCHESTRATOR_ID = "orchestrator@0.1.0"

#: Replies the session itself produces when the model cannot help (localized).
MODEL_FAILED = {
    "en": "I couldn't read that answer — could you say it another way?",
    "bn": "উত্তরটি পড়তে পারিনি — একটু অন্যভাবে বলবেন?",
}


class OrchestratorError(RuntimeError):
    """The session cannot continue (bad configuration or a locked revision)."""


@dataclass
class Result:
    """One conversation step: the engine's turn, what is asked next, and what was committed."""

    turn: Turn
    prompt: dict[str, Any]
    revision: Revision | None = None
    model: str | None = None
    context: BuiltContext | None = None
    findings: tuple[Finding, ...] = ()
    error: str | None = None

    @property
    def decision(self) -> str:
        return self.turn.decision

    def to_dict(self) -> dict[str, Any]:
        return {
            "decision": self.turn.decision,
            "turn": self.turn.to_dict(),
            "prompt": self.prompt,
            "revision": _revision_dict(self.revision),
            "model": self.model,
            "context": self.context.to_dict() if self.context is not None else None,
            "findings": [finding.to_dict() for finding in self.findings],
            "error": self.error,
        }


def _revision_dict(revision: Revision | None) -> dict[str, Any] | None:
    if revision is None:
        return None
    return {
        "number": revision.number,
        "sha256": revision.sha256,
        "note": revision.note,
        "ops": list(revision.ops),
        "parentSha256": revision.parentSha256,
    }


class Session:
    """One interview conversation bound to one project revision store."""

    def __init__(
        self,
        book: FlowBook,
        interview: Interview,
        *,
        store: SpecStore | None = None,
        client: ModelClient | None = None,
        policy: PermissionPolicy | None = None,
        language: str = "en",
        at: str | None = None,
        flows: Sequence[str] | None = None,
        storey_index: int | None = None,
    ) -> None:
        if interview.lang != language:
            raise OrchestratorError(
                f"interview language {interview.lang!r} does not match session {language!r}"
            )
        self.book = book
        self.interview = interview
        self.store = store
        self.client = client
        self.policy = policy
        self.language = language
        self.at = at
        self.flows = list(flows) if flows else None
        self.storey_index = storey_index
        self.transcript: list[dict[str, Any]] = []

    # -- construction -------------------------------------------------------

    @classmethod
    def create(
        cls,
        book: FlowBook,
        root: str | pathlib.Path,
        spec: dict[str, Any],
        *,
        client: ModelClient | None = None,
        policy: PermissionPolicy | None = None,
        language: str = "en",
        flows: Sequence[str] | None = None,
        storey_index: int | None = None,
        at: str | None = None,
    ) -> "Session":
        """Start a project: writes revision 0, then interviews against it."""
        store = SpecStore.create(root, spec, at=at)
        interview = Interview(
            book,
            store.load(store.tip().sha256),
            flows=flows,
            storey_index=storey_index,
            lang=language,
            at=at,
        )
        session = cls(
            book,
            interview,
            store=store,
            client=client,
            policy=policy,
            language=language,
            at=at,
            flows=flows,
            storey_index=storey_index,
        )
        session._event("session", mode="create", revision=store.tip().number)
        return session

    @classmethod
    def resume(
        cls,
        book: FlowBook,
        root: str | pathlib.Path,
        *,
        client: ModelClient | None = None,
        policy: PermissionPolicy | None = None,
        language: str = "en",
        flows: Sequence[str] | None = None,
        storey_index: int | None = None,
        at: str | None = None,
    ) -> "Session":
        """Continue a saved project; already-answered questions are skipped, not re-asked."""
        store = SpecStore(root)
        tip = store.tip()
        if tip.locked:
            raise OrchestratorError("the tip revision is locked for engineer review - reopen it first")
        interview = Interview(
            book,
            store.load(tip.sha256),
            flows=flows,
            storey_index=storey_index,
            lang=language,
            at=at,
            skip_answered=True,
        )
        session = cls(
            book,
            interview,
            store=store,
            client=client,
            policy=policy,
            language=language,
            at=at,
            flows=flows,
            storey_index=storey_index,
        )
        session._event("session", mode="resume", revision=tip.number)
        return session

    # -- reads --------------------------------------------------------------

    @property
    def spec(self) -> dict[str, Any]:
        return self.interview.spec

    @property
    def done(self) -> bool:
        return self.interview.done

    def prompt(self) -> dict[str, Any]:
        return self.interview.prompt(self.language)

    def state(self) -> dict[str, Any]:
        tip = self.store.tip() if self.store is not None else None
        return {
            "orchestrator": ORCHESTRATOR_ID,
            "prompt": self.prompt(),
            "progress": self.interview.progress(),
            "revision": _revision_dict(tip),
            "transcript": len(self.transcript),
            "language": self.language,
        }

    def coverage(self) -> dict[str, dict[str, Any]]:
        return self.interview.coverage()

    def history(self) -> list[dict[str, Any]]:
        return self.interview.history()

    def pending(self) -> list[dict[str, Any]]:
        return self.interview.progress()["pending"]

    # -- conversation -------------------------------------------------------

    def respond(self, text: str = "", *, choice: str | None = None) -> Result:
        """Answer the current question; escalates to the model only when the parser cannot read it.

        ``choice`` answers with a chip id (no text needed); otherwise ``text`` is parsed
        deterministically first.
        """
        findings = tuple(scan(text)) if text else ()
        if findings:
            self._event("injection", findings=[finding.to_dict() for finding in findings])
        turn = self.interview.answer(text, choice=choice, lang=self.language)
        model: str | None = None
        context: BuiltContext | None = None
        error: str | None = None
        if turn.decision == "escalate":
            turn, model, context, error = self._escalate(turn, findings)
        revision = self._commit_turn(turn)
        result = Result(
            turn=turn,
            prompt=self.prompt(),
            revision=revision,
            model=model,
            context=context,
            findings=findings,
            error=error,
        )
        self._event(
            "turn",
            decision=turn.decision,
            questionId=turn.question_id,
            pointer=turn.pointer,
            reason=turn.reason,
            value=turn.value,
            revision=revision.number if revision is not None else None,
            model=model,
            error=error,
        )
        return result

    def use_default(self) -> Result:
        """Explicit \"you decide\" for the current question."""
        turn = self.interview.use_default(self.language)
        revision = self._commit_turn(turn)
        self._event("turn", decision=turn.decision, questionId=turn.question_id, reason=turn.reason)
        return Result(turn=turn, prompt=self.prompt(), revision=revision)

    def skip(self) -> Result:
        """Explicit \"I don't know\" for the current question (essential questions stay open)."""
        turn = self.interview.skip(self.language)
        revision = self._commit_turn(turn)
        self._event("turn", decision=turn.decision, questionId=turn.question_id, reason=turn.reason)
        return Result(turn=turn, prompt=self.prompt(), revision=revision)

    def finish(self) -> list[Turn]:
        """Apply authored fallbacks for everything left, then commit one revision."""
        turns = self.interview.finish(self.language)
        revision = self._commit_draft(note="interview finished")
        self._event(
            "finish",
            turns=len(turns),
            openEssential=self.interview.progress()["openEssential"],
            revision=revision.number if revision is not None else None,
        )
        return turns

    def commit(self, note: str = "session checkpoint") -> Revision | None:
        """Record the current draft if it differs from the tip (``None`` when unchanged)."""
        return self._commit_draft(note=note)

    # -- permissions --------------------------------------------------------

    def check_tool(
        self,
        call: Call,
        *,
        trust: str = "user",
        findings: Sequence[Finding] = (),
    ) -> Decision:
        """Ask the session policy about one tool call; the decision is recorded."""
        if self.policy is None:
            decision = Decision(call.tool, "deny", "no permission policy is attached to this session")
        else:
            decision = self.policy.authorize(call, trust=trust, findings=findings)
        self._event("tool", **decision.to_dict())
        return decision

    # -- internals ----------------------------------------------------------

    def _escalate(
        self,
        turn: Turn,
        findings: Sequence[Finding],
    ) -> tuple[Turn, str | None, BuiltContext | None, str | None]:
        if self.client is None:
            self._event("model_skipped", reason="no client configured")
            return turn, None, None, None
        payload = turn.escalation or {}
        context = build_escalation_context(
            payload, self.interview.spec, language=self.language
        )
        self._event(
            "model_request",
            model=self.client.name,
            estimatedTokens=context.estimatedTokens,
            overBudget=context.overBudget,
            findings=[finding.rule for finding in findings],
        )
        try:
            reply = self.client.complete(context.messages, max_tokens=192, temperature=0.0)
        except ModelError as exc:
            self._event("model_error", model=self.client.name, error=str(exc))
            return turn, self.client.name, context, str(exc)
        self._event("model_reply", model=self.client.name, reply=reply[:600])
        try:
            value, unit = parse_model_value(reply)
        except ModelValueError as exc:
            self._event("model_invalid", model=self.client.name, error=str(exc))
            return turn, self.client.name, context, str(exc)
        accepted = self.interview.accept_external(
            value,
            unit=unit,
            lang=self.language,
            answer_text=str(payload.get("answer") or ""),
        )
        return accepted, self.client.name, context, None

    def _commit_turn(self, turn: Turn) -> Revision | None:
        if turn.ops:
            return self._commit_draft(note=f"interview: {turn.question_id}")
        return None

    def _commit_draft(self, *, note: str) -> Revision | None:
        if self.store is None:
            return None
        tip = self.store.tip()
        changed = [
            row
            for row in diff_specs(self.store.load(tip.sha256), self.interview.spec)
            if row["path"] not in _METADATA_PATHS
        ]
        if not changed:
            return None
        try:
            revision = self.store.commit_snapshot(
                tip.sha256, self.interview.spec, at=self.at, note=note
            )
        except SpecStoreError as exc:
            # The draft never reached the store: rebuild the interview from the tip so the
            # session and the saved project cannot drift apart, then report the blocker.
            self._event("rollback", note=note, error=str(exc))
            self.interview = Interview(
                self.book,
                self.store.load(tip.sha256),
                flows=self.flows,
                storey_index=self.storey_index,
                lang=self.language,
                at=self.at,
                skip_answered=True,
            )
            raise OrchestratorError(
                f"cannot commit the interview draft ({exc}); the draft was rolled back - "
                "reopen the revision, then answer again"
            ) from exc
        self.interview.spec = self.store.load(revision.sha256)
        self._event(
            "commit",
            revision=revision.number,
            sha256=revision.sha256,
            ops=list(revision.ops),
            note=note,
        )
        return revision

    def _event(self, kind: str, **data: Any) -> None:
        self.transcript.append({"seq": len(self.transcript), "type": kind, **data})


#: Revision metadata the store rewrites; it never counts as a content change.
_METADATA_PATHS = frozenset({"/revision", "/locked", "/updatedAt"})
