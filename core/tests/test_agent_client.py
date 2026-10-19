"""Model client seam (W1.10): strict reply parsing, loopback-only transport.

The transport test runs a real local HTTP server on 127.0.0.1 — the same path the app
uses against llama-swap — so the JSON contract and error mapping are exercised, not mocked.
"""

from __future__ import annotations

import contextlib
import http.server
import json
import socket
import threading

import pytest

from archres_core.agent.client import (
    LlamaSwapClient,
    ModelError,
    ModelValueError,
    ScriptedClient,
    parse_model_value,
)

MESSAGES = [{"role": "system", "content": "be brief"}, {"role": "user", "content": "parse this"}]


@contextlib.contextmanager
def loopback(*, status: int = 200, content: str = '{"value": 5}', raw: dict | None = None):
    seen: list[dict] = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802 - stdlib naming
            length = int(self.headers.get("Content-Length", "0"))
            seen.append({"path": self.path, "body": json.loads(self.rfile.read(length) or b"{}")})
            payload = raw if raw is not None else {
                "choices": [{"message": {"content": content}}]
            }
            data = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args) -> None:  # silence the test server
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


# -- reply parsing ---------------------------------------------------------


def test_parses_a_plain_value_object() -> None:
    assert parse_model_value('{"value": "metric", "unit": null}') == ("metric", None)
    assert parse_model_value('{"value": 5, "unit": "katha"}') == (5, "katha")


def test_parses_fenced_json_and_surrounding_prose() -> None:
    reply = 'Sure.\n```json\n{"value": 12.5, "unit": "ft"}\n```\nDone.'
    assert parse_model_value(reply) == (12.5, "ft")
    assert parse_model_value('Here you go: {"value": true} hope this helps') == (True, None)


@pytest.mark.parametrize(
    "reply",
    [
        "",
        "   ",
        "no json here",
        "[1, 2, 3]",
        '{"unit": "m"}',
        '{"value": null}',
        '{"value": 5, "unit": 3}',
        '{"value": true, "unit": "m"}',
    ],
)
def test_rejects_unusable_replies(reply: str) -> None:
    with pytest.raises(ModelValueError):
        parse_model_value(reply)


def test_parse_rejects_non_text() -> None:
    with pytest.raises(ModelValueError):
        parse_model_value(None)  # type: ignore[arg-type]


# -- scripted client -------------------------------------------------------


def test_scripted_client_replays_and_records() -> None:
    client = ScriptedClient(replies=['{"value": 1}', '{"value": 2}'])
    assert client.complete(MESSAGES) == '{"value": 1}'
    assert client.complete(MESSAGES, max_tokens=32) == '{"value": 2}'
    assert len(client.calls) == 2
    assert client.calls[0]["messages"] == MESSAGES
    assert client.calls[1]["max_tokens"] == 32
    with pytest.raises(ModelError):
        client.complete(MESSAGES)


# -- transport -------------------------------------------------------------


def test_refuses_non_loopback_serving() -> None:
    with pytest.raises(ModelError, match="loopback"):
        LlamaSwapClient(base_url="http://example.com")
    with pytest.raises(ModelError, match="loopback"):
        LlamaSwapClient(base_url="https://127.0.0.1:8787")
    with pytest.raises(ValueError):
        LlamaSwapClient(timeout=0)


def test_rejects_bad_messages_before_any_call() -> None:
    client = LlamaSwapClient()
    with pytest.raises(ModelError):
        client.complete([{"role": "wizard", "content": "hi"}])
    with pytest.raises(ModelError):
        client.complete([{"role": "user", "content": 5}])  # type: ignore[dict-item]


def test_posts_one_completion_to_the_router() -> None:
    with loopback(content='{"value": "metric", "unit": null}') as (url, seen):
        client = LlamaSwapClient(base_url=url, model="chat", name="test-chat")
        reply = client.complete(MESSAGES, max_tokens=64, temperature=0.0)
    assert reply == '{"value": "metric", "unit": null}'
    assert client.name == "test-chat"
    assert len(seen) == 1
    assert seen[0]["path"] == "/v1/chat/completions"
    body = seen[0]["body"]
    assert body["model"] == "chat"
    assert body["messages"] == MESSAGES
    assert body["max_tokens"] == 64
    assert body["temperature"] == 0.0
    assert body["stream"] is False


def test_http_error_is_a_model_error() -> None:
    with loopback(status=500, raw={"error": "boom"}) as (url, _seen):
        with pytest.raises(ModelError, match="HTTP 500"):
            LlamaSwapClient(base_url=url).complete(MESSAGES)


def test_malformed_response_is_a_model_error() -> None:
    with loopback(raw={"nope": True}) as (url, _seen):
        with pytest.raises(ModelError, match="unexpected model response"):
            LlamaSwapClient(base_url=url).complete(MESSAGES)


def test_unreachable_server_is_a_model_error() -> None:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with pytest.raises(ModelError, match="unreachable"):
        LlamaSwapClient(base_url=f"http://127.0.0.1:{port}", timeout=2).complete(MESSAGES)
