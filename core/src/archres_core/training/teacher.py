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
import time
import urllib.request
from typing import Any, Iterable, Protocol

from .records import make_id

TEACHER_PROMPT_VERSION = "teacher-paraphrase-v0.3"
TEACHER_INSTRUCTION = {
    "en": (
        "Rewrite the question below with the same meaning but a completely different "
        "sentence structure. Do not copy any full phrase from the original; change at "
        "least three words. Ask exactly one question. Output only the new question. Keep "
        "every number and unit exactly. No preamble, quotes, JSON or labels."
    ),
    "bn": (
        "নিচের প্রশ্নটির অর্থ ঠিক রেখে সম্পূর্ণ ভিন্ন বাক্যগঠনে লিখুন। মূল বাক্যের কোনো পূর্ণ "
        "বাক্যাংশ কপি করবেন না। অন্তত তিনটি শব্দ বদলান। একটির বেশি প্রশ্ন নয়। শুধু নতুন "
        "প্রশ্নটি লিখুন। প্রতিটি সংখ্যা ও একক অপরিবর্তিত রাখুন। কোনো ভূমিকা, উদ্ধৃতি, JSON "
        "বা লেবেল নয়।"
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
        max_tokens: int = 96,
        no_think: bool = True,
        attempts: int = 3,
        retry_delay: float = 1.0,
    ) -> None:
        if attempts < 1:
            raise ValueError("attempts must be positive")
        self.endpoint = endpoint
        self.model = model
        self.timeout = timeout
        self.max_tokens = max_tokens
        self.no_think = no_think
        self.attempts = attempts
        self.retry_delay = retry_delay

    def complete(self, messages: list[dict[str, str]], *, temperature: float, seed: int) -> str:
        # The plan's local teacher is a hybrid Qwen3-8B. Without an explicit switch it
        # spends the completion budget on a thinking block and can exceed the one-line
        # question contract. The Qwen3 chat template understands the /no_think soft
        # switch; the cap is a second guard for teachers that ignore it.
        request_messages = [dict(message) for message in messages]
        if self.no_think and request_messages and request_messages[-1].get("role") == "user":
            request_messages[-1]["content"] = (
                f"{request_messages[-1].get('content', '')}\n/no_think"
            )
        payload = {
            "model": self.model,
            "messages": request_messages,
            "temperature": temperature,
            "seed": seed,
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        last_error: OSError | None = None
        raw = b""
        for attempt in range(self.attempts):
            try:
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    raw = response.read()
                last_error = None
                break
            except OSError as exc:  # URLError, timeouts, refused/reset connections
                last_error = exc
                if attempt + 1 >= self.attempts:
                    break
                time.sleep(self.retry_delay * (attempt + 1))
        if last_error is not None:
            raise TeacherError(
                f"teacher request failed after {self.attempts} attempts: {last_error}"
            ) from last_error
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

    The instruction alone is the editor prompt. An extra "careful editor" persona prefix
    made the 8B model copy short questions verbatim (measured on ground-floor-height-bn),
    so it is deliberately omitted.
    """
    return TEACHER_INSTRUCTION[lang]


def _teacher_user(lang: str, question: str) -> str:
    if lang == "bn":
        return f"প্রশ্ন:\n{question}\n\nএখন এটি নতুন শব্দে লিখুন।"
    return f"Question:\n{question}\n\nRephrase it now."


def train_ask_records(
    ask_records: Iterable[dict[str, Any]], train_ids: Iterable[str]
) -> list[dict[str, Any]]:
    """Keep only ask records whose source id is on the frozen train side.

    The eval split is frozen by source question id before any paraphrase exists
    (ADR-0015). A teacher batch that included a holdout question would leak that
    question's paraphrases into training even though the original record stayed on the
    holdout side. The CLI uses this filter for every batch, including smoke runs.
    """
    allowed = set(train_ids)
    return [
        record
        for record in ask_records
        if record.get("task") == "interview.ask" and record.get("id") in allowed
    ]


def dedupe_teacher_records(candidates: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop repeated paraphrases of the same source question.

    The teacher is stochastic; the same source can return the same assistant text for
    two variants. The records have different ids, so a duplicate would otherwise inflate
    the token target without adding variety.
    """
    seen: set[tuple[str, str]] = set()
    kept: list[dict[str, Any]] = []
    for record in candidates:
        source_id = str(record.get("input", {}).get("sourceRecordId", ""))
        messages = record.get("messages") or []
        text = str(messages[-1].get("content", "")) if messages else ""
        key = (source_id, text)
        if key in seen:
            continue
        seen.add(key)
        kept.append(record)
    return kept


def build_teacher_records(
    scripted_ask_records: Iterable[dict[str, Any]],
    client: CompletionClient,
    *,
    variants: int = 1,
    temperature: float = 0.7,
    batch: str = "teacher-paraphrase-v0",
    skipped: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Rephrase scripted ``interview.ask`` records; returns candidate records.

    One teacher record is produced per source record per variant. The source's labels,
    task contract, phase and question id are preserved exactly. A client failure raises
    ``TeacherError`` - a partial file is never written by this function.

    A source that still repeats its question after four temperature-escalated attempts
    is appended to ``skipped`` as ``source_id#vN`` and that variant is omitted when the
    caller supplies the list; without it the function raises ``TeacherError``. The caller
    records ``skipped`` in the manifest, so a missing variant is a declared coverage gap,
    not a silent one.
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
            for attempt in range(4):
                text = client.complete(
                    [
                        {"role": "system", "content": _teacher_system(lang)},
                        {"role": "user", "content": _teacher_user(lang, question)},
                    ],
                    temperature=min(1.2, temperature + 0.1 * attempt),
                    seed=seed + attempt,
                )
                if text != question:
                    break
            if text == question:
                if skipped is None:
                    raise TeacherError(f"teacher did not paraphrase {source['id']!r}")
                skipped.append(f"{source['id']}#v{variant}")
                continue
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
