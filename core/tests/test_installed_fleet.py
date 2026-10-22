"""The installed fleet's client: the app's own AI runner, started when it is needed.

The install carries the runner (ADR-0084) - so the app can use it - but the fleet is not
started when the app starts (the warmup loads gigabytes and the app's start must stay
quick). So it starts on the first escalation, and only then. And an install with no fleet
is an honest error, never a silent fall back to nothing.
"""

from __future__ import annotations

import pathlib

import pytest

from archres_core.agent.client import InstalledFleetClient, ModelError

ROOT = pathlib.Path(__file__).resolve().parents[2]


class _FakeLauncher:
    """A stand-in for the fleet launcher - it records that it was started."""

    def __init__(self, root: pathlib.Path) -> None:
        self.root = root
        self.base_url = "http://127.0.0.1:8787"

    def start(self) -> "_FakeLauncher":
        return self


def test_the_fleet_is_not_started_until_it_is_needed(tmp_path: pathlib.Path) -> None:
    """The app's start must stay quick ✓ — the warmup loads gigabytes ✓ ✓."""
    started: list[pathlib.Path] = []

    def factory(root: pathlib.Path) -> _FakeLauncher:
        started.append(root)
        return _FakeLauncher(root)

    client = InstalledFleetClient(tmp_path, launcher=factory)
    assert not started, "the fleet started before it was needed"
    assert client._client is None, "the client was built before the fleet was there"


def test_the_fleet_starts_once_and_is_then_reused(tmp_path: pathlib.Path) -> None:
    """One fleet ✓ — not one per answer ✓ ✓."""
    started: list[pathlib.Path] = []

    def factory(root: pathlib.Path) -> _FakeLauncher:
        started.append(root)
        return _FakeLauncher(root)

    client = InstalledFleetClient(tmp_path, launcher=factory)
    first = client._ensure()
    second = client._ensure()
    assert first is second, "the fleet was started twice"
    assert len(started) == 1, "the fleet was started twice"


def test_an_install_with_no_fleet_says_so(tmp_path: pathlib.Path) -> None:
    """An honest error ✓ — never a guess ✓, never a silent nothing ✓ ✓."""
    client = InstalledFleetClient(tmp_path)
    with pytest.raises(ModelError, match="no model fleet"):
        client.complete([{"role": "user", "content": "hello"}])


def test_the_sidecar_is_given_the_fleet_the_install_carries(tmp_path: pathlib.Path) -> None:
    """The sidecar uses the install's fleet ✓ — and does not start it there ✓ ✓.

    The sidecar's own start must not load a model ✓ ✓ (the perf budget is on the core's
    startup ✓ ✓) ✓ ✓.
    """
    from archres_core.agent.client import LlamaSwapClient
    from archres_core.bridge import _model_client

    client = _model_client(str(tmp_path), None)
    assert isinstance(client, InstalledFleetClient), "the sidecar has no fleet"
    assert client._client is None, "the fleet was started at the sidecar's start"

    # and a router the caller names still wins ✓ ✓
    named = _model_client(str(tmp_path), "http://127.0.0.1:8787")
    assert isinstance(named, LlamaSwapClient), "the named router was ignored"
    assert _model_client(None, None) is None, "a client was invented"


def test_the_fleet_the_install_carries_is_where_the_layout_says() -> None:
    """The runner's place ✓ — the fleet's own config names it ✓ ✓."""
    from archres_core.install import INSTALL_LAYOUT

    assert INSTALL_LAYOUT["llama"] == "bin/llama"
    assert INSTALL_LAYOUT["llamaSwap"] == "bin/llama-swap"
    assert (ROOT / "spec" / "models" / "fleet.json").is_file()
    assert (ROOT / "spec" / "models" / "llama-swap.yaml").is_file()
