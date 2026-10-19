"""Fleet launcher v0 (W1.11): start llama-swap, prove readiness, warm a mode.

The router is a bundled component (plan §4): loopback only, one process, no shell. This
launcher owns its lifecycle for the app and for the E2E demo:

1. `start()` spawns the binary with the generated config, redirects logs, and waits for
   `/v1/models` — readiness is an HTTP answer, never a sleep or a banner scraped from stdout.
2. `preload(mode)` sends one minimal request per route in the mode's warmup list, in order.
   That is what "interview mode" / "design mode" means: chat first, or repair first; the
   router handles the swap and the CPU services stay resident (S2 evidence).
3. `stop()` terminates the process tree it started, with a bounded wait then a kill.

No network, no shell, no guessed ports: the listen address is the caller's or the fleet's.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Sequence

from .fleet import Fleet, FleetError, LOOPBACK_HOSTS, Mode

#: Minimal request per route role, proven in spike S2.
WARMUP: dict[str, tuple[str, dict[str, Any]]] = {
    "chat": (
        "/v1/chat/completions",
        {"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1, "temperature": 0.0, "stream": False},
    ),
    "repair": (
        "/v1/chat/completions",
        {"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1, "temperature": 0.0, "stream": False},
    ),
    "embed": ("/v1/embeddings", {"input": ["warm"]}),
    "rerank": ("/v1/rerank", {"query": "warm", "documents": ["warm"], "top_n": 1}),
}

DEFAULT_TIMEOUT = 120.0
POLL_SECONDS = 0.25
STOP_GRACE_SECONDS = 10.0


class LauncherError(RuntimeError):
    """The router could not be started, reached, or warmed."""


def _parse_base_url(value: str) -> tuple[str, int]:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme != "http" or parsed.hostname not in LOOPBACK_HOSTS:
        raise LauncherError(f"router must be loopback http, got {value!r} (offline-first)")
    try:
        port = parsed.port
    except ValueError:
        raise LauncherError(f"invalid router port in {value!r}") from None
    if port is None:
        raise LauncherError(f"router url needs an explicit port, got {value!r}")
    return parsed.hostname, port


class FleetLauncher:
    """One llama-swap process bound to one generated fleet config."""

    def __init__(
        self,
        fleet: Fleet,
        binary: str | pathlib.Path,
        *,
        root: str | pathlib.Path | None = None,
        base_url: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        spawn: Callable[..., subprocess.Popen] | None = None,
        log_path: str | pathlib.Path | None = None,
    ) -> None:
        if timeout <= 0:
            raise LauncherError("timeout must be positive")
        host, port = _parse_base_url(base_url or f"http://{fleet.listen}")
        self.fleet = fleet
        self.binary = pathlib.Path(binary)
        self.root = pathlib.Path(root).resolve() if root is not None else None
        self.base_url = f"http://{host}:{port}"
        self.listen = f"{host}:{port}"
        self.timeout = timeout
        self.log_path = pathlib.Path(log_path) if log_path is not None else None
        self._spawn = spawn if spawn is not None else subprocess.Popen
        self._process: subprocess.Popen | None = None
        self._log_handle = None

    # -- process ------------------------------------------------------------

    def command(self) -> list[str]:
        return [
            str(self.binary),
            "-config",
            str(self.fleet.generated_path),
            "-listen",
            self.listen,
        ]

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    def start(self) -> "FleetLauncher":
        if self.running:
            raise LauncherError("the router is already running")
        if not self.fleet.generated_path.is_file():
            raise LauncherError(
                f"router config missing: {self.fleet.generated_path} "
                "(run: python tools/serving/fleet.py render)"
            )
        if self._spawn is subprocess.Popen and not self.binary.is_file():
            raise LauncherError(f"router binary not found: {self.binary}")
        if self.root is None:
            raise LauncherError(
                f"install root unknown - pass root= or set {self.fleet.install_root_env}"
            )
        env = dict(os.environ)
        env[self.fleet.install_root_env] = str(self.root)
        if self.log_path is not None:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            self._log_handle = self.log_path.open("a", encoding="utf-8", newline="\n")
            stdout = self._log_handle
        else:
            stdout = subprocess.DEVNULL
        try:
            self._process = self._spawn(
                self.command(),
                env=env,
                stdout=stdout,
                stderr=subprocess.STDOUT,
            )
            self.wait_ready()
        except Exception:
            self.stop()
            raise
        return self

    def wait_ready(self, timeout: float | None = None) -> list[str]:
        """Poll `/v1/models` until the router answers; readiness is HTTP, not a sleep."""
        if self._process is None:
            raise LauncherError("the router has not been started")
        deadline = time.monotonic() + (timeout if timeout is not None else self.timeout)
        last: Exception | None = None
        while time.monotonic() < deadline:
            code = self._process.poll()
            if code is not None:
                raise LauncherError(f"router exited with code {code}{self._log_tail()}")
            try:
                return self.models(timeout=min(5.0, max(0.5, deadline - time.monotonic())))
            except (urllib.error.URLError, OSError, LauncherError) as exc:
                last = exc
                time.sleep(POLL_SECONDS)
        raise LauncherError(
            f"router did not become ready within {timeout or self.timeout:.1f}s at {self.base_url}: {last}"
        )

    def stop(self, *, grace: float = STOP_GRACE_SECONDS) -> bool:
        """Terminate the process this launcher started; bounded wait, then kill."""
        process, self._process = self._process, None
        was_running = process is not None and process.poll() is None
        if process is not None:
            if was_running:
                process.terminate()
                try:
                    process.wait(timeout=grace)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=grace)
            else:
                process.wait(timeout=grace)
        if self._log_handle is not None:
            self._log_handle.close()
            self._log_handle = None
        return was_running

    def status(self) -> dict[str, Any]:
        process = self._process
        return {
            "running": self.running,
            "pid": process.pid if process is not None else None,
            "baseUrl": self.base_url,
            "listen": self.listen,
            "modes": sorted(self.fleet.modes),
            "log": str(self.log_path) if self.log_path is not None else None,
        }

    # -- router API ---------------------------------------------------------

    def models(self, *, timeout: float = 5.0) -> list[str]:
        payload = self._request("GET", "/v1/models", timeout=timeout)
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            raise LauncherError("router /v1/models did not return a data array")
        return [str(item.get("id")) for item in data if isinstance(item, dict) and item.get("id")]

    def preload(self, mode: str | Sequence[str]) -> dict[str, Any]:
        """Warm one mode (or an explicit route list) with one minimal request per route."""
        if isinstance(mode, str):
            try:
                selected = self.fleet.mode(mode)
            except FleetError as exc:
                raise LauncherError(str(exc)) from None
            routes = selected.warmup
            name = selected.name
            primary = selected.primary
        else:
            routes = tuple(mode)
            name = "custom"
            primary = routes[0] if routes else ""
            for route in routes:
                if route not in self.fleet.routes:
                    raise LauncherError(f"unknown route {route!r}")
            if not routes:
                raise LauncherError("preload needs at least one route")
        warmed: list[dict[str, Any]] = []
        total = time.monotonic()
        for route in routes:
            role = self.fleet.route(route)
            path, body = WARMUP[route]
            started = time.monotonic()
            try:
                self._request("POST", path, payload={**body, "model": route}, timeout=self.timeout)
            except LauncherError as exc:
                raise LauncherError(f"{name}: could not warm {role.id} ({route}): {exc}") from exc
            warmed.append({"route": route, "seconds": round(time.monotonic() - started, 3)})
        return {
            "mode": name,
            "primary": primary,
            "warmed": warmed,
            "seconds": round(time.monotonic() - total, 3),
        }

    # -- internals ----------------------------------------------------------

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        timeout: float = 5.0,
    ) -> Any:
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise LauncherError(f"{method} {path} returned HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise LauncherError(f"{method} {path} failed at {self.base_url}: {exc}") from exc
        if not raw.strip():
            return {}
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise LauncherError(f"{method} {path} returned non-JSON: {raw[:200]!r}") from exc

    def _log_tail(self, lines: int = 8) -> str:
        if self.log_path is None or not self.log_path.is_file():
            return ""
        try:
            content = self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            return ""
        tail = [line for line in content if line.strip()][-lines:]
        return "" if not tail else "\n" + "\n".join(tail)
