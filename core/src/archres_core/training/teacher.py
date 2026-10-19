"""Teacher augmentation (W1.5) - natural-language variety as candidates, not facts.

The deterministic generators own every number, citation and label. The teacher is used
only to rephrase the **interview question** in natural BN/EN; its output can never change
a label or a fact. This is the plan's "scripts first, AI last-mile" rule applied to
training data.

Records produced here are ``status: candidate``. The deterministic verifier still checks
schema, labels and language, but meaning preservation is not machine-provable, so a
human/eval gate (W1.6) must promote them; nothing in this module silently marks a
teacher record verified. The full teacher batch belongs with the SFT round (W1.6); this
harness is the plumbing and the gate.

The client speaks the OpenAI-compatible chat-completions API that llama-server exposes
(stdlib only - no new dependency). Tests inject a fake client; no network is required.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any, Iterable, Protocol

from .records import make_id

TEACHER_PROMPT_VERSION = "teacher-paraphrase-v0"
TEACHER_INSTRUCTION = {
    "en": (
        "Rephrase the question below in natural English. The meaning must stay the same, "
        "but the wording must be new. Keep every number and unit exactly. Ask exactly one "
        "question. Output only the rephrased question, with no quotes, JSON, labels or "
        "preamble."
    ),
    "bn": (
        "নিচের প্রশ্নটি স্বাভাবিক বাংলায় নতুন শব্দে লিখুন। অর্থ একই রাখুন, শব্দ বদলান। "
        "প্রতিটি সংখ্যা ও একক অপরিবর্তিত রাখুন। ঠিক একটি প্রশ্ন করুন। শুধু নতুন প্রশ্নটি "
        "লিখুন — উদ্ধৃতি, JSON, লেবেল বা ভূমিকা নয়।"
    ),
}


class TeacherError(RuntimeError):
    """The teacher endpoint failed or returned an unusable completion."""


class CompletionClient(Protocol):
    model: str

    def complete(self, messages: list[dict[str, str]], *, temperature: float, seed: int) -> str:
        """Return one assistant completion for the messages."""


class ChatCompletionClient:
    """Minimal OpenAI-compatible client (llama-server /v1/chat/completions)."""

    def __init__(
        self,
        endpoint: str = "http://127.0.0.1:8787/v1/chat/completions",
        model: str = "chat",
        timeout: float = 180.0,
    ) -> None:
        self.endpoint = endpoint
        self.model = model
        self.timeout = timeout

    def complete(self, messages: list[dict[str, str]], *, temperature: float, seed: int) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "seed": seed,
            "stream": False,
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except OSError as exc:  # URLError, timeouts, refused connections
            raise TeacherError(f"teacher request failed: {exc}") from exc
        try:
            body = raw.decode("utf-8")
            data = json.loads(body)
            text = data["choices"][0]["message"]["content"].strip()
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            raise TeacherError(f"teacher returned an unexpected payload: {raw[:200]!r}") from exc
        if not text:
            raise TeacherError("teacher returned an empty completion")
        return text


def _teacher_system(lang: str) -> str:
    """A dedicated editor prompt - never the product's JSON-oriented system prompt.

    Reusing ``prompts.SYSTEM`` made the 4B model answer with a JSON object (the product
    prompt says "when a task asks for JSON..."); an editor prompt keeps the task plain.
    """
    return (
        "You are a careful bilingual editor for ArchResidenceBD, a Bangladeshi civil-engineering "
        "app.\n\n"
        f"{TEACHER_INSTRUCTION[lang]}"
    )


def _teacher_user(lang: str, question: str) -> str:
    if lang == "bn":
        return f"প্রশ্ন:\n{question}\n\nএখন এটি নতুন শব্দে লিখুন।"
    return f"Question:\n{question}\n\nRephrase it now."


def build_teacher_records(
    scripted_ask_records: Iterable[dict[str, Any]],
    client: CompletionClient,
    *,
    variants: int = 1,
    temperature: float = 0.7,
    batch: str = "teacher-paraphrase-v0",
) -> list[dict[str, Any]]:
    """Rephrase scripted ``interview.ask`` records; returns candidate records.

    One teacher record is produced per source record per variant. The source's labels,
    task contract, phase and question id are preserved exactly. A client failure raises
    ``TeacherError`` - a partial file is never written by this function.
    """
    if variants < 1:
        raise ValueError("variants must be >= 1")
    records: list[dict[str, Any]] = []
    for source in sorted(scripted_ask_records, key=lambda record: record["id"]):
        if source["task"] != "interview.ask":
            continue
        lang = source["lang"]
        question = source["messages"][-1]["content"]
        for variant in range(1, variants + 1):
            seed = int.from_bytes(
                (source["id"] + f"::teacher::{variant}").encode("utf-8")[:8], "big"
            ) % (2**31 - 1)
            text = ""
            for attempt in range(2):
                text = client.complete(
                    [
                        {"role": "system", "content": _teacher_system(lang)},
                        {"role": "user", "content": _teacher_user(lang, question)},
                    ],
                    temperature=temperature,
                    seed=seed + attempt,
                )
                if text != question:
                    break
            if text == question:
                raise TeacherError(f"teacher did not paraphrase {source['id']!r}")
            records.append(
                {
                    "schemaVersion": "0.1.0",
                    "id": make_id("chat", "ask-teacher", source["labels"]["questionId"], lang, f"v{variant}"),
                    "kind": "chat",
                    "task": "interview.ask",
                    "lang": lang,
                    "messages": [
                        {"role": "system", "content": source["messages"][0]["content"]},
                        {"role": "user", "content": source["messages"][1]["content"]},
                        {"role": "assistant", "content": text},
                    ],
                    "labels": dict(source["labels"]),
                    "input": {
                        "generator": "teacher_paraphrase-0.1.0",
                        "questionId": source["labels"]["questionId"],
                        "phaseId": source["labels"]["phaseId"],
                        "lang": lang,
                        "sourceRecordId": source["id"],
                        "variant": variant,
                    },
                    "source": {
                        "kind": "teacher",
                        "model": client.model,
                        "promptVersion": TEACHER_PROMPT_VERSION,
                        "batch": batch,
                    },
                    "difficulty": "clean",
                    "status": "candidate",
                    "verifyChecks": ["schema", "labels", "language", "teacher.shape"],
                }
            )
    return records
