"""The repair trace must stay portable: a machine path is redacted, not shipped (W1.7).

The ``outdir-mkdir-exists`` mutation raised ``FileExistsError`` whose message carries the
absolute path of the work directory. The law is "machine paths never in the record"; before
this redaction the only honest outcome was to refuse the record, which threw that failure
class away. The message is now redacted at capture time - the type and the sentence survive,
the path does not - and the raw message stays in the workdir as evidence.
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest

from archres_core.training import (
    MUTATIONS,
    apply_mutation,
    normalize_failure,
    verification_failure,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGET = ROOT / "tools" / "cad" / "candidates" / "geometry_build.py"
CORPUS = ROOT / "data" / "training" / "repair-v0"


def _target() -> str:
    return TARGET.read_text(encoding="utf-8")


def test_a_windows_path_in_a_message_is_redacted() -> None:
    failure = normalize_failure(
        {
            "errorType": "FileExistsError",
            "message": (
                "[WinError 183] Cannot create a file when that file already exists: "
                "'C:\\Users\\someone\\AppData\\Local\\Temp\\repair-corpus-1\\out'"
            ),
            "frames": [{"file": "candidate.py", "line": 115, "source": "        x = 1"}],
        },
        "engine_error",
    )
    assert "C:\\Users" not in failure["message"]
    assert "<path>" in failure["message"]
    assert failure["errorType"] == "FileExistsError"
    assert "Cannot create a file" in failure["message"]
    assert "C:\\Users" not in failure["trace"]


def test_a_posix_path_in_a_message_is_redacted() -> None:
    failure = normalize_failure(
        {
            "errorType": "FileNotFoundError",
            "message": "[Errno 2] No such file or directory: '/home/someone/out/summary.json'",
            "frames": [{"file": "candidate.py", "line": 3, "source": "    y = 2"}],
        },
        "engine_error",
    )
    assert "/home/someone" not in failure["message"]
    assert "<path>" in failure["message"]


def test_a_verification_message_is_redacted_too() -> None:
    failure = verification_failure(
        "artifacts[foundation-summary.json]",
        "artifact 'C:\\Users\\someone\\out\\foundation-summary.json' was not produced",
    )
    assert "C:\\Users" not in failure["message"]
    assert "<path>" in failure["message"]


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _strings(item)


def test_the_committed_corpus_carries_no_machine_path() -> None:
    records = [
        json.loads(line)
        for line in (CORPUS / "dataset.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert records
    pattern = re.compile(r"(?:^|[\s\"'(])(?:[A-Za-z]:[\\/]|/(?:home|Users|tmp)/)")
    for record in records:
        for text in _strings(record):
            assert not pattern.search(text), (record["id"], text[:80])


def test_every_mutation_still_applies_to_the_candidate() -> None:
    source = _target()
    for mutation in MUTATIONS:
        assert apply_mutation(source, mutation) != source
