"""Tools + permissions (W1.10): deny by default, sandbox paths, fleet isolation.

Every decision is asserted on the returned status *and* the audit log, because the UI
shows the log — a decision that is not recorded did not happen.
"""

from __future__ import annotations

import pytest

from archres_core.agent.injection import Finding
from archres_core.agent.tools import (
    TOOLS,
    Call,
    PermissionError,
    PermissionPolicy,
)

HIGH = Finding("instruction_override", "high", 0, 10, "ignore all")
MEDIUM = Finding("role_marker", "medium", 0, 10, "system: x")


@pytest.fixture()
def policy(tmp_path):
    return PermissionPolicy(sandbox=tmp_path, granted={"fs.read"})


def test_unknown_tool_is_denied_and_logged(policy: PermissionPolicy) -> None:
    decision = policy.authorize(Call("fs.delete", {"path": "a"}))
    assert decision.status == "deny"
    assert "not a known tool" in decision.reason
    assert policy.log[-1]["status"] == "deny"


def test_granted_read_inside_sandbox_is_allowed(policy: PermissionPolicy, tmp_path) -> None:
    (tmp_path / "notes.txt").write_text("hi", encoding="utf-8")
    decision = policy.authorize(Call("fs.read", {"path": "notes.txt"}))
    assert decision.status == "allow"
    assert decision.allowed
    assert not decision.needs_approval


def test_ungranted_read_asks(policy: PermissionPolicy) -> None:
    decision = policy.authorize(Call("fs.list", {"path": "."}))
    assert decision.status == "ask"
    assert "not granted" in decision.reason


@pytest.mark.parametrize("path", ["../secret.txt", "C:/Windows/win.ini", "/etc/passwd"])
def test_paths_outside_the_sandbox_are_denied(policy: PermissionPolicy, path: str) -> None:
    decision = policy.authorize(Call("fs.read", {"path": path}))
    assert decision.status == "deny"
    assert "outside the project sandbox" in decision.reason


def test_missing_path_is_denied(policy: PermissionPolicy) -> None:
    decision = policy.authorize(Call("fs.read", {}))
    assert decision.status == "deny"
    assert "path is required" in decision.reason


def test_external_content_cannot_call_write_net_or_exec(tmp_path) -> None:
    policy = PermissionPolicy(
        sandbox=tmp_path, granted={"spec.write", "fetch.get", "shell.run"}, allow_net=True, allow_exec=True
    )
    for call in (
        Call("spec.write", {"pointer": "/x"}),
        Call("fetch.get", {"url": "https://example.com"}),
        Call("shell.run", {"command": "dir"}),
    ):
        decision = policy.authorize(call, trust="external")
        assert decision.status == "deny"
        assert "fleet isolation" in decision.reason


def test_external_read_asks(tmp_path) -> None:
    policy = PermissionPolicy(sandbox=tmp_path, granted={"fs.read"})
    decision = policy.authorize(Call("fs.read", {"path": "a.txt"}), trust="external")
    assert decision.status == "ask"
    assert "needs approval" in decision.reason


def test_high_finding_denies_every_tool(policy: PermissionPolicy) -> None:
    decision = policy.authorize(Call("fs.read", {"path": "a.txt"}), findings=[HIGH])
    assert decision.status == "deny"
    assert "injection alert" in decision.reason


def test_medium_finding_does_not_deny(policy: PermissionPolicy) -> None:
    decision = policy.authorize(Call("fs.read", {"path": "a.txt"}), findings=[MEDIUM])
    assert decision.status == "allow"


def test_network_is_offline_by_default(tmp_path) -> None:
    policy = PermissionPolicy(sandbox=tmp_path, granted={"fetch.get"})
    decision = policy.authorize(Call("fetch.get", {"url": "https://example.com"}))
    assert decision.status == "deny"
    assert "offline-first" in decision.reason


def test_shell_is_off_by_default(tmp_path) -> None:
    policy = PermissionPolicy(sandbox=tmp_path, granted={"shell.run"})
    decision = policy.authorize(Call("shell.run", {"command": "dir"}))
    assert decision.status == "deny"
    assert "shell tools are off" in decision.reason


def test_granted_tools_need_explicit_opt_in(tmp_path) -> None:
    policy = PermissionPolicy(sandbox=tmp_path, allow_net=True, allow_exec=True)
    assert policy.authorize(Call("web.search", {"q": "cement price"})).status == "ask"
    policy.grant("web.search")
    assert policy.authorize(Call("web.search", {"q": "cement price"})).status == "allow"
    policy.revoke("web.search")
    assert policy.authorize(Call("web.search", {"q": "cement price"})).status == "ask"


def test_shell_workdir_must_stay_inside(tmp_path) -> None:
    policy = PermissionPolicy(sandbox=tmp_path, granted={"shell.run"}, allow_exec=True)
    decision = policy.authorize(Call("shell.run", {"command": "dir", "cwd": "../.."}))
    assert decision.status == "deny"


def test_grant_unknown_tool_raises(tmp_path) -> None:
    policy = PermissionPolicy(sandbox=tmp_path)
    with pytest.raises(PermissionError):
        policy.grant("rm.rf")


def test_unknown_trust_level_raises(policy: PermissionPolicy) -> None:
    with pytest.raises(PermissionError):
        policy.authorize(Call("fs.read", {"path": "a"}), trust="god")


def test_catalogue_reports_grant_state(policy: PermissionPolicy) -> None:
    rows = {row["id"]: row for row in policy.tools()}
    assert set(rows) == set(TOOLS)
    assert rows["fs.read"]["granted"] is True
    assert rows["shell.run"]["granted"] is False


def test_log_grows_by_one_per_decision(policy: PermissionPolicy) -> None:
    start = len(policy.log)
    policy.authorize(Call("fs.read", {"path": "a.txt"}))
    policy.authorize(Call("nope"))
    assert len(policy.log) == start + 2
    assert [row["tool"] for row in policy.log[-2:]] == ["fs.read", "nope"]
    assert all({"tool", "status", "reason", "trust"} <= set(row) for row in policy.log)
