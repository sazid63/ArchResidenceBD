"""Fleet launcher (W1.11): readiness is HTTP, preload is one request per route, stop is bounded.

A real loopback HTTP server plays the router; a fake process proves the lifecycle without
starting GGUFs. The actual model swap is verified separately against the bundled binary.
"""

from __future__ import annotations

import contextlib
import http.server
import json
import pathlib
import threading

import pytest

from archres_core.serving import FleetError, FleetLauncher, LauncherError, load_fleet

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLEET_PATH = ROOT / "spec" / "models" / "fleet.json"
MODELS = ["chat", "repair", "embed", "rerank"]


@pytest.fixture()
def fleet():
    return load_fleet(FLEET_PATH)


@contextlib.contextmanager
def router(*, get_status: int = 200, post_status: int = 200):
    seen: list[dict] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib naming
            seen.append({"method": "GET", "path": self.path, "body": None})
            if get_status != 200:
                self._send(get_status, {"error": "not ready"})
                return
            self._send(200, {"data": [{"id": model} for model in MODELS]})

        def do_POST(self) -> None:  # noqa: N802 - stdlib naming
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            seen.append({"method": "POST", "path": self.path, "body": body})
            if post_status != 200:
                self._send(post_status, {"error": "load failed"})
                return
            self._send(200, {"choices": [{"message": {"content": "ok"}}], "data": [], "results": []})

        def _send(self, status: int, payload: dict) -> None:
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args) -> None:
            return

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", seen
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


class FakeProcess:
    def __init__(self, code: int | None = None) -> None:
        self.code = code
        self.pid = 4321
        self.terminated = False
        self.killed = False
        self.waits: list[float | None] = []

    def poll(self):
        return self.code

    def terminate(self) -> None:
        self.terminated = True
        self.code = 0

    def kill(self) -> None:
        self.killed = True
        self.code = -9

    def wait(self, timeout=None):
        self.waits.append(timeout)
        return self.code


class Spawn:
    def __init__(self, process: FakeProcess) -> None:
        self.process = process
        self.calls: list[dict] = []

    def __call__(self, command, **kwargs):
        self.calls.append({"command": command, **kwargs})
        return self.process


def _launcher(fleet, tmp_path, *, process=None, base_url=None, timeout=5.0, log_path=None):
    process = process or FakeProcess()
    spawn = Spawn(process)
    launcher = FleetLauncher(
        fleet,
        tmp_path / "llama-swap.exe",
        root=tmp_path,
        base_url=base_url,
        timeout=timeout,
        spawn=spawn,
        log_path=log_path,
    )
    return launcher, spawn, process


def test_command_points_at_the_generated_config(fleet, tmp_path) -> None:
    launcher, _spawn, _process = _launcher(fleet, tmp_path)
    assert launcher.command() == [
        str(tmp_path / "llama-swap.exe"),
        "-config",
        str(fleet.generated_path),
        "-listen",
        fleet.listen,
    ]
    assert launcher.base_url == f"http://{fleet.listen}"
    assert launcher.status()["running"] is False
    assert launcher.status()["modes"] == ["design", "interview"]


@pytest.mark.parametrize(
    "base_url",
    ["http://example.com:8787", "https://127.0.0.1:8787", "http://127.0.0.1", "http://0.0.0.0:8787"],
)
def test_refuses_non_loopback_or_portless_urls(fleet, tmp_path, base_url: str) -> None:
    with pytest.raises(LauncherError):
        FleetLauncher(fleet, tmp_path / "x.exe", root=tmp_path, base_url=base_url)


def test_start_requires_an_install_root(fleet, tmp_path) -> None:
    launcher, _spawn, _process = _launcher(fleet, tmp_path)
    launcher.root = None
    with pytest.raises(LauncherError, match="install root"):
        launcher.start()


def test_start_requires_the_generated_config(tmp_path) -> None:
    models = tmp_path / "models"
    models.mkdir()
    (models / "fleet.json").write_text(FLEET_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    (models / "registry.json").write_text(
        (FLEET_PATH.parent / "registry.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    local = load_fleet(models / "fleet.json")
    launcher, _spawn, _process = _launcher(local, tmp_path)
    with pytest.raises(LauncherError, match="config missing"):
        launcher.start()


def test_start_waits_for_models_and_exports_the_root(fleet, tmp_path) -> None:
    with router() as (url, seen):
        launcher, spawn, process = _launcher(fleet, tmp_path, base_url=url)
        launcher.start()
        assert launcher.running
        assert process.terminated is False
        assert seen[0]["path"] == "/v1/models"
        call = spawn.calls[0]
        assert call["command"][0] == str(tmp_path / "llama-swap.exe")
        assert call["env"]["ARCHRES_ROOT"] == str(tmp_path)
        assert launcher.models() == MODELS
        assert launcher.stop() is True
        assert process.terminated is True
        assert process.waits
        assert launcher.running is False
        assert launcher.stop() is False


def test_router_exit_is_reported_with_the_log_tail(fleet, tmp_path) -> None:
    log = tmp_path / "router.log"
    log.write_text("boot\nmodel load failed\n", encoding="utf-8")
    launcher, _spawn, _process = _launcher(
        fleet, tmp_path, process=FakeProcess(code=3), base_url="http://127.0.0.1:9", log_path=log
    )
    with pytest.raises(LauncherError, match="exited with code 3") as info:
        launcher.start()
    assert "model load failed" in str(info.value)


def test_readiness_timeout_terminates_the_process(fleet, tmp_path) -> None:
    with router(get_status=503) as (url, _seen):
        launcher, _spawn, process = _launcher(
            fleet, tmp_path, base_url=url, timeout=0.7
        )
        with pytest.raises(LauncherError, match="did not become ready"):
            launcher.start()
    assert process.terminated is True
    assert launcher.running is False


def test_preload_interview_warms_chat_then_cpu_services(fleet, tmp_path) -> None:
    with router() as (url, seen):
        launcher, _spawn, _process = _launcher(fleet, tmp_path, base_url=url)
        launcher.start()
        before = len(seen)
        result = launcher.preload("interview")
    posts = [row for row in seen[before:] if row["method"] == "POST"]
    assert [row["path"] for row in posts] == [
        "/v1/chat/completions",
        "/v1/embeddings",
        "/v1/rerank",
    ]
    assert [row["body"]["model"] for row in posts] == ["chat", "embed", "rerank"]
    assert result["mode"] == "interview"
    assert result["primary"] == "chat"
    assert [row["route"] for row in result["warmed"]] == ["chat", "embed", "rerank"]
    assert result["seconds"] >= 0


def test_preload_design_wakes_the_repair_model_first(fleet, tmp_path) -> None:
    with router() as (url, seen):
        launcher, _spawn, _process = _launcher(fleet, tmp_path, base_url=url)
        launcher.start()
        before = len(seen)
        result = launcher.preload("design")
        custom = launcher.preload(["rerank"])
    posts = [row for row in seen[before:] if row["method"] == "POST"]
    assert posts[0]["body"]["model"] == "repair"
    assert result["primary"] == "repair"
    assert custom["mode"] == "custom" and custom["warmed"][0]["route"] == "rerank"


def test_preload_refuses_unknown_modes_and_routes(fleet, tmp_path) -> None:
    launcher, _spawn, _process = _launcher(fleet, tmp_path)
    with pytest.raises(LauncherError, match="unknown mode"):
        launcher.preload("lunch")
    with pytest.raises(LauncherError, match="unknown route"):
        launcher.preload(["chat", "nope"])
    with pytest.raises(LauncherError, match="at least one route"):
        launcher.preload([])


def test_preload_reports_a_warmup_failure(fleet, tmp_path) -> None:
    with router(post_status=500) as (url, _seen):
        launcher, _spawn, _process = _launcher(fleet, tmp_path, base_url=url)
        launcher.start()
        with pytest.raises(LauncherError, match="could not warm"):
            launcher.preload("interview")


def test_fleet_mode_lookup_stays_in_the_fleet(fleet) -> None:
    with pytest.raises(FleetError, match="unknown mode"):
        fleet.mode("nope")
