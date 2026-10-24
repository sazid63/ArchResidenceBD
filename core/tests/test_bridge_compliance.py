"""W4.7 in the app: the project's compliance, and the user's override recorded.

The plan's §2: the user overrides → the app explains what rule is left behind → the risk
tier → the user confirms → the app proceeds → the entry is recorded in the Deviation
Register. The core held all of it; none of it was reachable from the app.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.bridge import Bridge
from archres_core.spec import SpecStore

ROOT = pathlib.Path(__file__).resolve().parents[2]

#: The design data the rule engine measures ✓ - the same set the compliance report's own
#: demo carries ✓ ✓ (the report's docstring says why: an example project without the
#: design data would come back "not evaluated" for every rule ✓ ✓).
DESIGN_DATA = [
    {"op": "add", "path": "/phases/site-excavation/data/setbackFrontM", "value": 1.2},
    {"op": "add", "path": "/phases/site-excavation/data/setbackRearM", "value": 2.0},
    {"op": "add", "path": "/phases/site-excavation/data/setbackSideLeftM", "value": 1.25},
    {"op": "add", "path": "/phases/site-excavation/data/setbackSideRightM", "value": 1.25},
    {"op": "add", "path": "/phases/site-excavation/data/plannedTotalFloorAreaSqm", "value": 1400},
    {"op": "add", "path": "/phases/site-excavation/data/parkingSpaces", "value": 1},
    {"op": "add", "path": "/building/typicalUnitAreaSqm", "value": 150},
]


def _project(tmp_path: pathlib.Path, *, designed: bool = True) -> str:
    """A project folder ✓ ✓ - with the design data ✓ when the test wants a judged project ✓."""
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {
                "name": "Compliance Probe",
                "projects": str(tmp_path / "projects"),
                "template": "new-project",
            },
        }
    )
    assert not reply.get("error"), reply
    project = reply["result"]["path"]
    if designed:
        store = SpecStore(project)
        store.commit(
            store.tip().sha256,
            DESIGN_DATA,
            provenance={"source": "engine", "detail": "the design's own measurements"},
            note="the design's measurements",
        )
    return project


def test_the_project_can_be_judged(tmp_path: pathlib.Path) -> None:
    """The evaluation carries the rule ✓, the summary in both languages ✓ and the limit ✓."""
    project = _project(tmp_path)
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {"id": "1", "method": "compliance.evaluate", "params": {"project": project}}
    )
    assert not reply.get("error"), reply
    result = reply["result"]
    assert result["verdicts"], "the project was judged as nothing at all"
    verdict = result["verdicts"][0]
    assert verdict["ruleRef"], "a verdict without its rule"
    assert verdict["summary"]["en"], "a verdict without an explanation"
    assert verdict["summary"]["bn"], "a verdict without its Bangla explanation"
    assert verdict["measured"], "a verdict without what it measured"
    assert verdict["limit"], "a verdict without the limit it measured against"
    assert result["pack"]["id"], "the evaluation does not name the pack it judged against"


def test_the_register_carries_the_risk_tier(tmp_path: pathlib.Path) -> None:
    """A deviation says how much attention it deserves ✓ ✓ - the tier is the law ✓ ✓."""
    project = _project(tmp_path)
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {"id": "1", "method": "compliance.evaluate", "params": {"project": project}}
    )
    assert not reply.get("error"), reply
    register = reply["result"]["register"]
    assert register, "the register is empty - the project has no deviation to record"
    entry = register[0]
    assert entry["riskTier"], "a deviation without its risk tier"
    assert entry["ruleRef"], "a deviation without its rule"
    assert entry["expected"] and entry["actual"], "a deviation without what it measured"


def test_the_users_override_is_recorded(tmp_path: pathlib.Path) -> None:
    """The plan's §2: the user overrides ✓ - and the entry is **recorded** ✓ ✓."""
    project = _project(tmp_path)
    bridge = Bridge(root=ROOT)

    reply = bridge.handle(
        {"id": "1", "method": "compliance.evaluate", "params": {"project": project}}
    )
    deviation = next(
        entry
        for entry in reply["result"]["register"]
        if not entry["acknowledged"]
    )

    reply = bridge.handle(
        {
            "id": "2",
            "method": "compliance.acknowledge",
            "params": {
                "project": project,
                "deviationId": deviation["id"],
                "rationale": "the owner's own decision - the wall stays",
            },
        }
    )
    assert not reply.get("error"), reply
    assert reply["result"]["acknowledged"] is True

    # and the register now says so ✓ ✓ - and the project has a new revision ✓ ✓
    reply = bridge.handle(
        {"id": "3", "method": "compliance.evaluate", "params": {"project": project}}
    )
    entry = next(
        item for item in reply["result"]["register"] if item["id"] == deviation["id"]
    )
    assert entry["acknowledged"] is True
    assert "the wall stays" in entry["rationale"]

    store = SpecStore(project)
    assert store.tip().number >= 1, "the override left no revision"


def test_an_override_without_a_reason_is_refused(tmp_path: pathlib.Path) -> None:
    """The register carries **why** ✓ ✓ - so an override without a reason is refused ✓ ✓."""
    project = _project(tmp_path)
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {"id": "1", "method": "compliance.evaluate", "params": {"project": project}}
    )
    deviation = reply["result"]["register"][0]

    reply = bridge.handle(
        {
            "id": "2",
            "method": "compliance.acknowledge",
            "params": {"project": project, "deviationId": deviation["id"]},
        }
    )
    assert reply.get("error"), "an override with no reason was accepted"
    assert "reason" in reply["error"]["message"]


def test_an_unknown_deviation_is_refused(tmp_path: pathlib.Path) -> None:
    """A deviation that is not there cannot be acknowledged ✓ ✓."""
    project = _project(tmp_path)
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {
            "id": "1",
            "method": "compliance.acknowledge",
            "params": {
                "project": project,
                "deviationId": "dev-nope",
                "rationale": "a reason",
            },
        }
    )
    assert reply.get("error"), "an unknown deviation was acknowledged"
    assert "dev-nope" in reply["error"]["message"]


def test_a_project_without_the_design_data_says_what_it_cannot_judge(
    tmp_path: pathlib.Path,
) -> None:
    """The plan's §9: a coverage gap is an **explicit** state ✓ ✓ - never a silent one ✓ ✓.

    The design pipeline does not yet record the measurements the rule engine reads ✓ ✓
    (a declared gap ✓ ✓) - so a project without them comes back with nothing judged ✓ ✓
    and **says** what is missing ✓ ✓ ✓.
    """
    project = _project(tmp_path, designed=False)
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {"id": "1", "method": "compliance.evaluate", "params": {"project": project}}
    )
    assert not reply.get("error"), reply
    result = reply["result"]
    assert result["verdicts"] == [], "a project with no design data was judged"
    assert result["unevaluated"], "the coverage gap is silent - the plan's §9 forbids it"
    reasons = {str(item.get("reason") or "") for item in result["unevaluated"]}
    assert "missing_input" in reasons, "the gap does not say what is missing"
