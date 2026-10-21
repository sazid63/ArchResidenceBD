"""The downloader (W5.2): resumable, checksummed, and never a silent success.

The laws these tests hold:

- **the core pack first** — the app is useful before the models arrive;
- **resumable** — a dropped connection keeps the bytes it has;
- **checksummed** — a piece that is not the promised one is *not installed*, and the
  reason is said;
- **nothing is fetched implicitly** — only http/https, and only when asked.

The tests use a **local** HTTP server (stdlib only) — nothing here touches the network.
"""

from __future__ import annotations

import hashlib
import http.server
import pathlib
import threading

import pytest

from archres_core.downloads import (
    CORE_FIRST,
    DownloadError,
    download_plan,
    fetch_piece,
    hash_file,
    verify_piece,
)
from archres_core.install import ManifestPart, the_manifest


class _Handler(http.server.BaseHTTPRequestHandler):
    """Serves two payloads, and honours a Range request (so a resume can be tested)."""

    payloads: dict[str, bytes] = {}
    hits: list[str] = []

    def do_GET(self) -> None:  # noqa: N802 - the stdlib's name
        _Handler.hits.append(self.path)
        body = _Handler.payloads.get(self.path)
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        start = 0
        range_header = self.headers.get("Range")
        if range_header and range_header.startswith("bytes="):
            start = int(range_header.split("=", 1)[1].split("-", 1)[0])
            body = body[start:]
            self.send_response(206)
        else:
            self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args) -> None:  # the test's server is quiet
        return


@pytest.fixture()
def server():
    """A local HTTP server (stdlib only) — the tests never reach the network."""
    _Handler.payloads = {}
    _Handler.hits = []
    httpd = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield httpd
    finally:
        httpd.shutdown()
        httpd.server_close()


def _url(server, path: str) -> str:
    host, port = server.server_address[:2]
    return f"http://{host}:{port}{path}"


def _part(part_id: str, sha256: str | None, size: int | None = None) -> ManifestPart:
    return ManifestPart(
        id=part_id,
        role="A piece",
        licence="MIT",
        tier="cpu",
        path=f"models/{part_id}.gguf",
        size_bytes=size,
        sha256=sha256,
    )


def test_the_core_pack_comes_first() -> None:
    """The app is useful before the models arrive."""
    manifest = the_manifest()
    urls = {
        "model-chat": "http://127.0.0.1/chat.gguf",
        "engine": "http://127.0.0.1/engine.zip",
        "runtime": "http://127.0.0.1/python.zip",
    }
    plan = download_plan(manifest, urls)
    assert plan.ids[0] == "engine"
    assert plan.ids[1] == "runtime"
    assert plan.ids[-1] == "model-chat"
    assert list(plan.ids).index("model-chat") > max(
        list(plan.ids).index(name) for name in CORE_FIRST if name in plan.ids
    )


def test_a_piece_with_no_url_is_not_in_the_plan() -> None:
    """The plan is what will be fetched — a piece with no URL is not in it."""
    plan = download_plan(the_manifest(), {"model-chat": "http://127.0.0.1/chat.gguf"})
    assert plan.ids == ("model-chat",)


def test_a_non_http_url_is_refused() -> None:
    with pytest.raises(DownloadError, match="non-http"):
        download_plan(the_manifest(), {"model-chat": "file:///etc/passwd"})
    with pytest.raises(DownloadError, match="non-http"):
        fetch_piece(_part("x", None), "ftp://127.0.0.1/x", pathlib.Path("data/tmp/x"))


def test_a_piece_is_fetched_and_verified(server, tmp_path) -> None:
    payload = b"the model bytes" * 100
    _Handler.payloads["/chat.gguf"] = payload
    digest = hashlib.sha256(payload).hexdigest()
    part = _part("model-chat", digest, len(payload))

    target = tmp_path / "models" / "chat.gguf"
    result = fetch_piece(part, _url(server, "/chat.gguf"), target)

    assert result.verified is True
    assert result.sha256 == digest
    assert result.size_bytes == len(payload)
    assert target.is_file(), "a verified piece is installed"
    assert not target.with_name(target.name + ".part").exists(), "the partial is gone"
    assert hash_file(target) == digest


def test_a_piece_that_is_not_the_promised_one_is_not_installed(server, tmp_path) -> None:
    """The hash is known before the fetch — so a wrong piece is refused."""
    _Handler.payloads["/chat.gguf"] = b"the wrong bytes"
    part = _part("model-chat", "a" * 64)

    target = tmp_path / "models" / "chat.gguf"
    result = fetch_piece(part, _url(server, "/chat.gguf"), target)

    assert result.verified is False
    assert "the manifest promises" in result.reason
    assert not target.exists(), "an unverified piece is not installed"
    assert target.with_name(target.name + ".part").exists(), "the bytes are kept, not thrown away"


def test_a_piece_with_no_promised_hash_is_not_verified(server, tmp_path) -> None:
    """Nobody measured it — so the install says so rather than claiming a fact."""
    _Handler.payloads["/chat.gguf"] = b"some bytes"
    part = _part("model-chat", None)
    target = tmp_path / "models" / "chat.gguf"
    result = fetch_piece(part, _url(server, "/chat.gguf"), target)
    assert result.verified is False
    assert "promises no hash" in result.reason


def test_a_dropped_connection_resumes(server, tmp_path) -> None:
    """A dropped connection is normal — the bytes already fetched are kept."""
    payload = b"x" * 4096
    _Handler.payloads["/chat.gguf"] = payload
    digest = hashlib.sha256(payload).hexdigest()
    part = _part("model-chat", digest, len(payload))

    target = tmp_path / "models" / "chat.gguf"
    partial = target.with_name(target.name + ".part")
    partial.parent.mkdir(parents=True, exist_ok=True)
    partial.write_bytes(payload[:1000])  # a previous attempt got this far

    result = fetch_piece(part, _url(server, "/chat.gguf"), target)
    assert result.verified is True
    assert target.is_file()
    # the server was asked for the rest, not the whole thing again
    assert len(_Handler.hits) == 1


def test_verifying_a_piece_on_disk(server, tmp_path) -> None:
    payload = b"the model bytes"
    _Handler.payloads["/chat.gguf"] = payload
    digest = hashlib.sha256(payload).hexdigest()
    part = _part("model-chat", digest, len(payload))
    target = tmp_path / "chat.gguf"
    target.write_bytes(payload)

    ok, reason = verify_piece(part, target)
    assert ok is True
    assert "matches" in reason

    ok, reason = verify_piece(_part("model-chat", "b" * 64), target)
    assert ok is False
    assert "the manifest promises" in reason

    ok, reason = verify_piece(part, tmp_path / "nothing.gguf")
    assert ok is False
    assert "not there" in reason
