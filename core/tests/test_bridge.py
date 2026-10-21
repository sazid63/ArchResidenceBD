"""The shell's bridge (W5.1): the core, spoken over stdio.

The laws these tests hold:

- **one JSON object per line** — the transport is lines, so a response that carried a
  newline would break the channel;
- **an error is an error, not a dead channel** — a malformed line, an unknown method and a
  missing session all come back as an envelope, and the next request still works;
- **the error codes are the job protocol's** — one vocabulary for the app;
- **the bridge never guesses** — a method it does not know is refused by name.
"""

from __future__ import annotations

import io
import json
import pathlib
import tempfile

from archres_core.bridge import (
    BRIDGE_VERSION,
    PROTOCOL_VERSION,
    Bridge,
    serve,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
JOB_PROTOCOL = ROOT / "spec" / "schemas" / "job-protocol.schema.json"
EXAMPLE_SPEC = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _bridge() -> Bridge:
    return Bridge(root=ROOT)


def test_the_bridge_pings() -> None:
    bridge = _bridge()
    response = bridge.handle({"id": "1", "method": "ping"})
    assert response["id"] == "1"
    result = response["result"]
    assert result["name"] == "archres-core"
    assert result["pid"] > 0
    assert result["version"] == BRIDGE_VERSION
    assert result["protocolVersion"] == PROTOCOL_VERSION


def test_the_bridge_names_its_versions() -> None:
    response = _bridge().handle({"id": "1", "method": "version"})
    result = response["result"]
    assert result["bridgeVersion"] == BRIDGE_VERSION
    assert result["protocolVersion"] == PROTOCOL_VERSION
    assert result["coreVersion"]


def test_an_unknown_method_is_refused_by_name() -> None:
    response = _bridge().handle({"id": "1", "method": "nope"})
    assert response["error"]["code"] == "invalid_params"
    assert "nope" in response["error"]["message"]
    assert "result" not in response


def test_a_missing_session_is_an_error() -> None:
    response = _bridge().handle({"id": "1", "method": "session.state", "params": {}})
    assert response["error"]["code"] == "invalid_params"


def test_a_session_answers_the_interview() -> None:
    """The bridge carries the app's own loop - the agent session the demo drives."""
    spec = json.loads(EXAMPLE_SPEC.read_text(encoding="utf-8"))
    bridge = _bridge()
    with tempfile.TemporaryDirectory() as temp:
        created = bridge.handle(
            {
                "id": "1",
                "method": "session.create",
                "params": {
                    "root": temp,
                    "spec": spec,
                    "sessionId": "s1",
                },
            }
        )
        result = created["result"]
        assert result["sessionId"] == "s1"
        assert result["prompt"]["questionId"]
        assert result["done"] is False

        state = bridge.handle({"id": "2", "method": "session.state", "params": {"sessionId": "s1"}})
        assert state["result"]["prompt"]["questionId"] == result["prompt"]["questionId"]

        answered = bridge.handle(
            {
                "id": "3",
                "method": "session.respond",
                "params": {"sessionId": "s1", "text": "I do not know"},
            }
        )
        turn = answered["result"]["turn"]
        assert turn["turn"]["decision"] in ("accept", "ask_again", "fallback", "escalate")
        # an essential question is never assumed - the answer says so
        assert turn["turn"]["reason"] != "assumed"


def test_a_response_is_one_line() -> None:
    """The transport is lines: a newline inside a response would break the channel."""
    bridge = _bridge()
    text = json.dumps(bridge.handle({"id": "1", "method": "ping"}), ensure_ascii=False)
    assert "\n" not in text


def test_a_malformed_line_is_an_error_and_the_channel_survives() -> None:
    bridge = _bridge()
    stdin = io.StringIO('not json\n{"id": "2", "method": "ping"}\n')
    stdout = io.StringIO()
    serve(bridge, stdin, stdout)
    lines = stdout.getvalue().splitlines()
    assert len(lines) == 2
    first = json.loads(lines[0])
    assert first["error"]["code"] == "invalid_params"
    second = json.loads(lines[1])
    assert second["result"]["name"] == "archres-core"


def test_the_channel_speaks_utf8_in_a_cp1252_locale(tmp_path: pathlib.Path) -> None:
    """A user's machine may be in a cp1252 locale - the channel must not inherit that.

    The shell writes UTF-8 bytes (serde_json writes text ✓) ✓, and the core reads them ✓ -
    but a pipe on Windows is decoded in the *locale code page* ✗, so without the channel
    saying so, a Bangla answer arrives mangled ✗ (or crashes the reader ✗). The locale is
    forced here so the test is the same on every machine ✓.
    """
    import os
    import subprocess
    import sys

    core = ROOT / "core"
    spec = json.loads(EXAMPLE_SPEC.read_text(encoding="utf-8"))
    answer = "আমার বাড়ি"

    process = subprocess.Popen(
        [sys.executable, "-m", "archres_core.bridge", "--root", str(ROOT)],
        cwd=core,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env={
            **os.environ,
            "PYTHONPATH": str(core / "src"),
            "PYTHONIOENCODING": "cp1252",  # a user's machine in the code page
        },
    )

    def ask(request: dict) -> dict:
        assert process.stdin is not None and process.stdout is not None
        process.stdin.write((json.dumps(request, ensure_ascii=False) + "\n").encode("utf-8"))
        process.stdin.flush()
        line = process.stdout.readline()
        if not line:
            raise AssertionError("the bridge closed the channel")
        return json.loads(line)

    try:
        created = ask(
            {
                "id": "1",
                "method": "session.create",
                "params": {"root": str(tmp_path), "spec": spec, "sessionId": "bn"},
            }
        )
        assert created["result"]["prompt"]["questionId"]
        replied = ask(
            {
                "id": "2",
                "method": "session.respond",
                "params": {"sessionId": "bn", "text": answer},
            }
        )
        turn = replied["result"]["turn"]["turn"]
        assert turn["value"] == answer, "the Bangla answer did not survive the channel"
    finally:
        if process.stdin is not None:
            process.stdin.close()
        process.wait(timeout=30)


def test_the_error_codes_are_the_job_protocol_s() -> None:
    """One vocabulary for the app: the codes are the frozen ones."""
    schema = json.loads(JOB_PROTOCOL.read_text(encoding="utf-8"))
    codes = set(schema["$defs"]["JobError"]["properties"]["code"]["enum"])
    bridge = _bridge()
    for method, params in (
        ("nope", {}),
        ("session.state", {}),
        ("session.create", {"root": "/definitely/not/a/directory", "spec": {}}),
    ):
        response = bridge.handle({"id": "1", "method": method, "params": params})
        assert response["error"]["code"] in codes, response
