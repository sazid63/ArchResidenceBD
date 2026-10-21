"""The spec-decoding verdict (W4.8): the fleet cannot carry a draft, and the plan says so.

The plan (v1.5) claimed speculative decoding was "lossless by construction (P1 pilot)". Spike S2
measured it: ~8 % acceptance, 3.5–11× slower, and it **changed greedy outputs** — so it was
neither lossless nor worth it. The verdict is **reject** (ADR-0054).

These tests hold both halves:

1. **the fleet refuses a draft** — a draft role, and the spec-draft flags — with a reason that
   names the evidence, so the error tells whoever hits it why;
2. **the plan says what was measured** — the two claims are amended, so the plan cannot be read
   as permission to add the draft back.
"""

from __future__ import annotations

import json
import pathlib

from archres_core.serving.fleet import FleetError, load_fleet

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLEET = ROOT / "spec" / "models" / "fleet.json"
REGISTRY = ROOT / "spec" / "models" / "registry.json"
PLAN = ROOT / "docs" / "plan" / "ArchResidenceBD-Plan-v1.5.md"


def _registry() -> dict:
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def test_the_committed_fleet_has_no_draft() -> None:
    """The shipped roster is the four roles, and nothing that drafts."""
    fleet = load_fleet(FLEET)
    assert set(fleet.routes) == {"chat", "repair", "embed", "rerank"}
    for route in fleet.routes.values():
        assert not route.flags or all(
            not flag.startswith(("--spec-draft", "--draft-max", "--spec-type"))
            for flag in route.flags
        ), route.id


def test_a_draft_model_is_refused(tmp_path: pathlib.Path) -> None:
    """The verdict cannot be undone by a config edit."""
    registry = _registry()
    registry["models"].append({**registry["models"][0], "role": "draft", "id": "qwen3-0.6b-draft"})
    path = tmp_path / "registry.json"
    path.write_text(json.dumps(registry, ensure_ascii=False), encoding="utf-8")
    try:
        load_fleet(FLEET, registry_path=path)
    except FleetError as exc:
        message = str(exc)
        assert "draft" in message
        assert "S2" in message, "the error must name the evidence"
        return
    raise AssertionError("a draft model was accepted into the fleet")


def test_the_spec_draft_flags_are_refused(tmp_path: pathlib.Path) -> None:
    """A route that turns speculation on is refused too."""
    registry = _registry()
    registry["models"][0]["runtime"]["flags"] = ["--spec-draft-n-max", "16"]
    path = tmp_path / "registry.json"
    path.write_text(json.dumps(registry, ensure_ascii=False), encoding="utf-8")
    try:
        load_fleet(FLEET, registry_path=path)
    except FleetError as exc:
        message = str(exc)
        assert "speculative decoding" in message
        assert "S2" in message, "the error must name the evidence"
        return
    raise AssertionError("the spec-draft flags were accepted into the fleet")


def test_the_plan_records_the_verdict() -> None:
    """The plan must not read as permission to add the draft back.

    The version history *quotes* the old claim while explaining it was wrong, so the check is
    on the claims themselves - the runtime stack and the inference line - and not on the text.
    """
    text = PLAN.read_text(encoding="utf-8")
    lines = text.splitlines()
    runtime = [line for line in lines if line.startswith("**5.9 Runtime stack**")]
    inference = [line for line in lines if line.startswith("- Speculative decoding:")]
    assert runtime and inference, "the plan's two claims are not where they should be"
    for line in runtime + inference:
        assert "lossless by construction" not in line, (
            f"the plan still claims speculative decoding is lossless: {line[:120]}"
        )
        assert "rejected" in line, f"the plan's claim does not record the verdict: {line[:120]}"
    assert "v1.6.2" in text, "the amendment must be in the version history"
