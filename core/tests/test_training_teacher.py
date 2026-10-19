"""Teacher augmentation (W1.5) - candidates stay candidates; no silent verification."""

from __future__ import annotations

import http.server
import json
import pathlib
import threading

import pytest

from archres_core.training import (
    ChatCompletionClient,
    TeacherError,
    VerifyContext,
    build_teacher_records,
    verify_record,
)
from archres_core.training.generators import build_ask_records, load_flow_book, question_dict

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLOW_BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
SCHEMA = json.loads((ROOT / "spec" / "schemas" / "sft-record.schema.json").read_text(encoding="utf-8"))


def _has_bangla(text: str) -> bool:
    return any("\u0980" <= char <= "\u09FF" for char in text)


class FakeClient:
    model = "fake-teacher"

    def __init__(self, *, echo: bool = False, bad_bangla: bool = False) -> None:
        self.echo = echo
        self.bad_bangla = bad_bangla
        self.calls: list[dict] = []

    def complete(self, messages: list[dict[str, str]], *, temperature: float, seed: int) -> str:
        question = messages[-1]["content"]
        self.calls.append({"messages": messages, "temperature": temperature, "seed": seed})
        if self.echo:
            # The harness wraps the source question in an editor instruction; echo the
            # question itself, which is what a lazy teacher would copy.
            for prefix in ("Question:\n", "প্রশ্ন:\n"):
                if prefix in question:
                    return question.split(prefix, 1)[1].rsplit("\n\n", 1)[0]
            return question
        if _has_bangla(question) and not self.bad_bangla:
            return "এই প্রকল্পের নামটি কী হবে, বলুন?"
        return "What would you like to call this project?"


def _sources() -> list[dict]:
    questions = load_flow_book(FLOW_BOOK)
    return build_ask_records(questions[:1])


def _context() -> VerifyContext:
    return VerifyContext(
        questions={question.id: question_dict(question) for question in load_flow_book(FLOW_BOOK)}
    )


def test_teacher_records_keep_labels_and_stay_candidates() -> None:
    sources = _sources()
    candidates = build_teacher_records(sources, FakeClient(), variants=1)
    assert len(candidates) == len(sources)
    assert all(record["status"] == "candidate" for record in candidates)
    assert all(record["source"]["kind"] == "teacher" for record in candidates)
    assert all(record["source"]["model"] == "fake-teacher" for record in candidates)
    assert [record["labels"] for record in candidates] == [record["labels"] for record in sources]
    assert len({record["id"] for record in candidates}) == len(candidates)


def test_teacher_records_pass_deterministic_checks_when_the_paraphrase_is_valid() -> None:
    candidates = build_teacher_records(_sources(), FakeClient())
    for record in candidates:
        ok, checks, failures = verify_record(record, SCHEMA, _context())
        assert ok, failures
        assert "ask.text" not in checks


def test_a_wrong_language_paraphrase_fails_the_gate() -> None:
    # Make the fake return English even for the Bangla source; verification must catch it.
    candidates = build_teacher_records(_sources(), FakeClient(bad_bangla=True))
    bangla = next(record for record in candidates if record["lang"] == "bn")
    ok, _checks, failures = verify_record(bangla, SCHEMA, _context())
    assert not ok
    assert any(failure.startswith("language:") for failure in failures)


def test_teacher_shape_gate_rejects_json_and_multiple_questions() -> None:
    candidates = build_teacher_records(_sources(), FakeClient())
    record = next(candidate for candidate in candidates if candidate["lang"] == "en")
    for bad in (
        '{"question": "What should we call this project?"}',
        "What is the name? And the address?",
        "Question:\nWhat should we call this project?",
    ):
        candidate = dict(record)
        candidate["messages"] = [dict(message) for message in record["messages"]]
        candidate["messages"][-1]["content"] = bad
        ok, _checks, failures = verify_record(candidate, SCHEMA, _context())
        assert not ok
        assert any(failure.startswith("teacher.shape:") for failure in failures)


def test_teacher_must_actually_change_the_text() -> None:
    with pytest.raises(TeacherError, match="did not paraphrase"):
        build_teacher_records(_sources(), FakeClient(echo=True))


def test_variants_must_be_positive() -> None:
    with pytest.raises(ValueError):
        build_teacher_records(_sources(), FakeClient(), variants=0)


# --- OpenAI-compatible client ----------------------------------------------


class _Handler(http.server.BaseHTTPRequestHandler):
    reply = json.dumps(
        {"choices": [{"message": {"role": "assistant", "content": "  Rewritten question?  "}}]}
    ).encode("utf-8")

    def do_POST(self) -> None:  # noqa: N802 - http.server API
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.reply)))
        self.end_headers()
        self.wfile.write(self.reply)

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture()
def endpoint() -> str:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/v1/chat/completions"
    server.shutdown()
    thread.join(timeout=5)


def test_chat_client_parses_a_completion_and_strips(endpoint: str) -> None:
    client = ChatCompletionClient(endpoint=endpoint, model="chat", timeout=5)
    assert client.complete([{"role": "user", "content": "hi"}], temperature=0.7, seed=1) == (
        "Rewritten question?"
    )


def test_chat_client_reports_a_bad_payload() -> None:
    class BadHandler(http.server.BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            self.rfile.read(int(self.headers.get("Content-Length", "0")))
            body = b'{"unexpected": true}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: object) -> None:
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), BadHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        client = ChatCompletionClient(
            endpoint=f"http://127.0.0.1:{server.server_address[1]}/v1/chat/completions",
            timeout=5,
        )
        with pytest.raises(TeacherError, match="unexpected payload"):
            client.complete([{"role": "user", "content": "hi"}], temperature=0.7, seed=1)
    finally:
        server.shutdown()
        thread.join(timeout=5)
