"""SFT record plumbing (W1.5): build, validate, canonical JSONL, hashing.

Canonical form law (mirrors the spec engine): UTF-8, LF, one JSON object per line with
``sort_keys=True`` and compact separators - the same records always produce byte-identical
files, so a dataset can be pinned by sha256 and diffed meaningfully in review.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from typing import Any, Iterable

import jsonschema

SCHEMA_VERSION = "0.1.0"
TASK_ORDER = ("interview.ask", "interview.parse", "rule.explain", "deviation.override", "repair.fix")


class RecordError(ValueError):
    """A record that cannot be used for training (shape or content contract)."""


def validate_record(record: dict[str, Any], schema: dict[str, Any]) -> None:
    """Validate one record against the packaged SFT-record schema; raises RecordError."""
    try:
        jsonschema.Draft202012Validator(schema).validate(record)
    except jsonschema.ValidationError as exc:
        location = "/".join(str(part) for part in exc.absolute_path) or "<root>"
        raise RecordError(f"record {record.get('id')!r} invalid at {location}: {exc.message}") from exc


def dumps_record(record: dict[str, Any]) -> str:
    """Canonical single-line JSON for one record (no trailing newline)."""
    return json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def record_sort_key(record: dict[str, Any]) -> tuple[int, str]:
    task = record.get("task", "")
    return (TASK_ORDER.index(task) if task in TASK_ORDER else len(TASK_ORDER), record.get("id", ""))


def write_jsonl(records: Iterable[dict[str, Any]], path: str | pathlib.Path) -> dict[str, Any]:
    """Write records (sorted canonically) as JSONL; returns {path, records, bytes, sha256}."""
    ordered = sorted(records, key=record_sort_key)
    text = "".join(f"{dumps_record(record)}\n" for record in ordered)
    payload = text.encode("utf-8")
    file = pathlib.Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_bytes(payload)
    return {
        "path": str(file),
        "records": len(ordered),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def load_jsonl(path: str | pathlib.Path) -> list[dict[str, Any]]:
    """Read a JSONL file back into records (blank lines skipped)."""
    records = []
    for line in pathlib.Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            records.append(json.loads(line))
    return records


def sha256_file(path: str | pathlib.Path) -> str:
    """sha256 of a file's exact bytes (pins flow book, pack, schemas, examples)."""
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def make_id(*parts: str) -> str:
    """Stable record id: lowercase slug parts joined by '-' (schema pattern-safe)."""
    slug = "-".join(str(part).strip().lower() for part in parts if str(part).strip())
    cleaned = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in slug)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-")
