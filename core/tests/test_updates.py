"""The updates (W5.4): pinned to exact versions, and the three refusals.

The laws these tests hold:

- **the money law** — a price card that is a candidate stays a candidate across an update;
  activating one is a human act, not an update's;
- **the law does not move backwards** — a rule pack downgrade is refused;
- **the roster is fixed** — an update that adds or removes a model is refused;
- **everything is pinned** — the plan names the exact version each channel moves to.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.updates import (
    CHANNELS,
    UpdateError,
    Version,
    check_updates,
    parse_version,
    plan_update,
    update_document,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_a_newer_version_is_an_update() -> None:
    plan = plan_update([Version(channel="rules", current="0.1.0", offered="0.2.0")])
    assert plan.applicable[0].channel == "rules"
    assert plan.pinned == {"rules": "0.2.0"}
    assert plan.refused == ()


def test_the_same_version_is_no_change() -> None:
    plan = plan_update([Version(channel="rules", current="0.1.0", offered="0.1.0")])
    assert plan.applicable == ()
    assert plan.channels[0].action == "none"


def test_a_candidate_card_is_never_activated_by_an_update() -> None:
    """The money law: activation is a human act (OWNER-ATTENTION #8)."""
    plan = plan_update(
        [
            Version(
                channel="prices",
                current="0.1.0",
                offered="0.2.0",
                current_status="candidate",
                offered_status="active",
            )
        ]
    )
    assert plan.applicable == ()
    refused = plan.refused[0]
    assert refused.action == "refused"
    assert "candidate" in refused.reason
    assert "human act" in refused.reason
    assert refused.status_after == "candidate", "the card stays a candidate"


def test_a_candidate_card_may_be_replaced_by_another_candidate() -> None:
    """A newer candidate is fine - it is still a candidate."""
    plan = plan_update(
        [
            Version(
                channel="prices",
                current="0.1.0",
                offered="0.2.0",
                current_status="candidate",
                offered_status="candidate",
            )
        ]
    )
    assert plan.applicable[0].channel == "prices"
    assert plan.applicable[0].status_after == "candidate"


def test_the_law_does_not_move_backwards() -> None:
    plan = plan_update([Version(channel="rules", current="0.2.0", offered="0.1.0")])
    assert plan.applicable == ()
    assert "older" in plan.refused[0].reason
    assert "does not move backwards" in plan.refused[0].reason


def test_a_pre_release_is_older_than_the_release() -> None:
    assert parse_version("1.0.0-rc1")[0] == (1, 0, 0)
    plan = plan_update([Version(channel="app", current="1.0.0", offered="1.0.0-rc1")])
    assert plan.applicable == ()
    assert "older" in plan.refused[0].reason


def test_the_roster_is_fixed() -> None:
    """The plan's decision: no new model members without the owner's sign-off."""
    plan = plan_update(
        [Version(channel="models", current="0.1.0", offered="0.2.0")],
        rosters={
            "models:current": ("chat", "repair", "embed", "rerank"),
            "models:offered": ("chat", "repair", "embed", "rerank", "teacher"),
        },
    )
    assert plan.applicable == ()
    assert "roster would change" in plan.refused[0].reason
    assert "owner's sign-off" in plan.refused[0].reason


def test_the_same_roster_is_fine() -> None:
    plan = plan_update(
        [Version(channel="models", current="0.1.0", offered="0.2.0")],
        rosters={
            "models:current": ("chat", "repair"),
            "models:offered": ("chat", "repair"),
        },
    )
    assert plan.applicable[0].channel == "models"


def test_the_same_version_with_the_same_roster_is_no_change() -> None:
    """A channel that is already at the offered version does not "update" to itself."""
    plan = plan_update(
        [Version(channel="models", current="0.1.0", offered="0.1.0")],
        rosters={
            "models:current": ("chat", "repair"),
            "models:offered": ("chat", "repair"),
        },
    )
    assert plan.applicable == ()
    assert plan.channels[0].action == "none"


def test_a_roster_change_is_refused_even_at_the_same_version() -> None:
    plan = plan_update(
        [Version(channel="models", current="0.1.0", offered="0.1.0")],
        rosters={
            "models:current": ("chat", "repair"),
            "models:offered": ("chat", "repair", "teacher"),
        },
    )
    assert plan.applicable == ()
    assert "roster would change" in plan.refused[0].reason


def test_an_unknown_channel_is_refused() -> None:
    with pytest.raises(UpdateError, match="unknown channel"):
        plan_update([Version(channel="weather", current="1", offered="2")])


def test_a_version_that_is_not_a_version_is_refused() -> None:
    with pytest.raises(UpdateError, match="not a version"):
        parse_version("latest")


def test_the_installation_is_read_and_compared() -> None:
    """What this repo has, against what is offered."""
    plan = check_updates(
        ROOT,
        offered={
            "rules": {"version": "0.2.0", "status": "candidate"},
            "prices": {"version": "0.2.0", "status": "active"},
        },
    )
    by_channel = {item.channel: item for item in plan.channels}
    assert set(by_channel) == {"rules", "prices"}
    assert by_channel["rules"].action == "update"
    # the prices channel: the installed card is a candidate, so it cannot be activated
    assert by_channel["prices"].action == "refused"
    assert by_channel["prices"].status_after == "candidate"


def test_the_plan_is_a_document() -> None:
    document = update_document(
        plan_update([Version(channel="app", current="0.1.0", offered="0.2.0")])
    )
    assert document["schemaVersion"] == "0.1.0"
    assert document["counts"]["applicable"] == 1
    assert document["pinned"] == {"app": "0.2.0"}
    assert document["channels"][0]["offered"] == "0.2.0"
