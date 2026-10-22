"""Model client seam v0 (W1.10) — loopback only, no new dependency.

Core never calls a model on its own: the orchestrator owns the call and hands the result
back through ``Interview.accept_external`` (ADR-0010). This module is the transport edge:

- ``ModelClient`` — the protocol the orchestrator needs (one method, messages in, text out).
- ``LlamaSwapClient`` — stdlib ``urllib`` against a llama-swap router on ``127.0.0.1`` only.
  Offline-first is enforced, not assumed: a non-loopback URL is refused at construction.
- ``ScriptedClient`` — deterministic replies for tests and the E2E demo.

``read_json_object`` reads one JSON object out of a reply (a fenced ```json block is
tolerated, because small models emit them) and rejects everything else, and
``parse_model_value`` reads the interview's ``{"value": ..., "unit": ...}`` shape from it -
the interview re-validates the value itself, so an unreadable reply is a visible retry,
never a write.
"""

from __future__ import annotations

import json
import pathlib
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Protocol, Sequence, runtime_checkable

MESSAGE_ROLES = ("system", "user", "assistant")


class ModelError(RuntimeError):
    """The model could not be reached or answered with an unusable response."""


class ModelValueError(ModelError):
    """The reply was not the required JSON value object."""


@runtime_checkable
class ModelClient(Protocol):
    """One text completion. ``messages`` is the OpenAI-style message list."""

    name: str

    def complete(
        self,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int = 256,
        temperature: float = 0.0,
    ) -> str: ...


@dataclass
class ScriptedClient:
    """Replays programmed replies; records every call (tests, demos, transcript fixtures)."""

    replies: list[str] = field(default_factory=list)
    name: str = "scripted"
    calls: list[dict[str, Any]] = field(default_factory=list)

    def complete(
        self,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int = 256,
        temperature: float = 0.0,
    ) -> str:
        self.calls.append(
            {
                "messages": [dict(message) for message in messages],
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        )
        if not self.replies:
            raise ModelError("the scripted client has no reply left")
        return self.replies.pop(0)


LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


class LlamaSwapClient:
    """Minimal llama-swap / llama.cpp chat-completions client on loopback.

    The router (W1.11) owns fleet lifecycle and modes; this client only names a model
    route and posts one non-streaming completion with a bounded timeout.
    """

    def __init__(
        self,
        *,
        base_url: str = "http://127.0.0.1:8787",
        model: str = "chat",
        timeout: float = 60.0,
        name: str | None = None,
    ) -> None:
        parsed = urllib.parse.urlparse(base_url)
        if parsed.scheme != "http" or parsed.hostname not in LOOPBACK_HOSTS:
            raise ModelError(
                f"model serving must be loopback http, got {base_url!r} (offline-first)"
            )
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.name = name or f"llama-swap:{model}"

    def complete(
        self,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int = 256,
        temperature: float = 0.0,
    ) -> str:
        for message in messages:
            if not isinstance(message, dict) or message.get("role") not in MESSAGE_ROLES:
                raise ModelError(f"invalid message role in {message!r}")
            if not isinstance(message.get("content"), str):
                raise ModelError("every message needs string content")
        body = json.dumps(
            {
                "model": self.model,
                "messages": list(messages),
                "max_tokens": max_tokens,
                "temperature": temperature,
                "stream": False,
                "cache_prompt": True,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise ModelError(f"model server returned HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ModelError(f"model server unreachable at {self.base_url}: {exc}") from exc
        try:
            payload = json.loads(raw)
            content = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise ModelError(f"unexpected model response: {raw[:200]!r}") from exc
        if not isinstance(content, str):
            raise ModelError("model response content is not text")
        return content


_FENCED = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def read_json_object(text: str) -> dict[str, Any]:
    """Read one JSON object out of a model's reply; raise if there is not one.

    A fenced ```json block is tolerated, because small models emit them, and the text
    between the first ``{`` and the last ``}`` is tried too - a model that says "here you
    go: {...}" is understood, but a model that says two things is not.
    """
    candidates = [match.group(1).strip() for match in _FENCED.finditer(text)]
    candidates.append(text.strip())
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        candidates.append(text[start : end + 1])
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except ValueError:
            continue
        if isinstance(parsed, dict):
            return parsed
    raise ModelValueError("the model reply is not a JSON object")


def parse_model_value(reply: str) -> tuple[Any, str | None]:
    """Read ``{"value": ..., "unit": ...}`` from a reply; raise if it cannot be used."""
    if not isinstance(reply, str) or not reply.strip():
        raise ModelValueError("the model reply is empty")
    payload = read_json_object(reply)
    if "value" not in payload:
        raise ModelValueError('the model reply has no "value" field')
    value = payload["value"]
    if value is None:
        raise ModelValueError("the model could not read the answer")
    unit = payload.get("unit")
    if unit is not None and not isinstance(unit, str):
        raise ModelValueError('the "unit" field must be text or null')
    if isinstance(value, bool) and payload.get("unit") is not None:
        raise ModelValueError("a yes/no value cannot carry a unit")
    return value, unit


class InstalledFleetClient:
    """The fleet the **install** carries ✓ — started on the first call ✓ ✓.

    The app's own AI runners travel with the app ✓ ✓ (the plan's §0: the app contains
    its own AI runners ✓ ✓) — so the app must be able to **use** them ✓ ✓ — and the
    fleet is not started when the app starts ✓ ✓ (the warmup loads gigabytes ✓ and
    the app's start must stay quick ✓ ✓) — so it starts on the **first
    escalation** ✓ ✓, and only then ✓ ✓.

    An install with no fleet is an **honest error** ✓ ✓ — never a silent fall back to
    nothing ✓ ✓ (the law: an unverified thing is a candidate ✓ ✓) ✓.
    """

    name = "chat"

    def __init__(
        self,
        root: str | pathlib.Path,
        *,
        model: str = "chat",
        timeout: float = 180.0,
        launcher: Any | None = None,
    ) -> None:
        self.root = pathlib.Path(root)
        self.model = model
        self.timeout = timeout
        self._launcher_factory = launcher
        self._launcher: Any | None = None
        self._client: "LlamaSwapClient" | None = None

    # -- the client's seam ---------------------------------------------------

    def complete(
        self,
        messages: Sequence[dict[str, str]],
        *,
        max_tokens: int = 256,
        temperature: float = 0.0,
    ) -> str:
        """One completion — from the fleet the install carries ✓ ✓."""
        client = self._ensure()
        return client.complete(
            messages, max_tokens=max_tokens, temperature=temperature
        )

    # -- the fleet -----------------------------------------------------------

    def _ensure(self) -> "LlamaSwapClient":
        """The fleet — started once ✓ ✓ — or an honest error ✓ ✓."""
        if self._client is not None:
            return self._client
        launcher = self._start()
        self._launcher = launcher
        self._client = LlamaSwapClient(
            base_url=launcher.base_url, model=self.model, timeout=self.timeout
        )
        return self._client

    def _start(self) -> Any:
        """Start the fleet the install carries — or say why it cannot ✓ ✓."""
        if self._launcher_factory is not None:
            return self._launcher_factory(self.root)

        from ..install import INSTALL_LAYOUT

        config = self.root / INSTALL_LAYOUT["models"] / "fleet.json"
        binary = self.root / INSTALL_LAYOUT["llamaSwap"] / "llama-swap.exe"
        if not config.is_file() or not binary.is_file():
            raise ModelError(
                "this install carries no model fleet "
                f"({config.name} and the router are needed) - the answer is not guessed"
            )
        from ..serving import FleetLauncher, load_fleet

        fleet = load_fleet(config)
        launcher = FleetLauncher(fleet, binary, root=self.root)
        launcher.start()
        return launcher

    def stop(self) -> None:
        """Stop the fleet — if this client started one ✓ ✓."""
        if self._launcher is not None:
            stop = getattr(self._launcher, "stop", None)
            if callable(stop):
                stop()
