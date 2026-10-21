"""The Bangla render guard (W3.9): the guard must fail on the failures it claims to catch."""

from __future__ import annotations

import importlib.util
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
GUARD = ROOT / "tools" / "ci" / "bangla_render_guard.py"


def _guard():
    spec = importlib.util.spec_from_file_location("bangla_render_guard", GUARD)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_committed_bangla_documents_are_clean() -> None:
    guard = _guard()
    problems: list[str] = []
    for path in sorted((ROOT / "data" / "compliance").rglob("*")):
        if path.is_file() and path.suffix.lower() in guard.TEXT_SUFFIXES:
            problems.extend(guard.check_file(path))
    assert problems == []


def test_a_clean_bangla_document_passes(tmp_path: pathlib.Path) -> None:
    guard = _guard()
    clean = tmp_path / "clean.html"
    clean.write_text(
        "<html lang=\"bn\"><style>body{font-family:'Noto Sans Bengali'}</style>"
        "<p>সিমেন্ট</p></html>",
        encoding="utf-8",
    )
    assert guard.check_file(clean) == []


def test_the_guard_catches_the_real_mojibake_sequence(tmp_path: pathlib.Path) -> None:
    guard = _guard()
    broken = tmp_path / "broken.html"
    broken.write_text(
        "<html lang=\"bn\"><style>body{font-family:'Noto Sans Bengali'}</style>"
        "<p>à¦¸à¦®à§¡à¦¨à¦Ÿ</p></html>",
        encoding="utf-8",
    )
    problems = guard.check_file(broken)
    assert any("mojibake" in problem for problem in problems)


def test_the_guard_catches_the_replacement_character(tmp_path: pathlib.Path) -> None:
    guard = _guard()
    broken = tmp_path / "broken.html"
    broken.write_text(
        "<html lang=\"bn\"><style>body{font-family:'Noto Sans Bengali'}</style>"
        "<p>সিমেন�</p></html>",
        encoding="utf-8",
    )
    problems = guard.check_file(broken)
    assert any("replacement character" in problem for problem in problems)


def test_the_guard_catches_a_missing_font_and_language(tmp_path: pathlib.Path) -> None:
    guard = _guard()
    broken = tmp_path / "broken.html"
    broken.write_text("<html><body><p>সিমেন্ট</p></body></html>", encoding="utf-8")
    problems = guard.check_file(broken)
    assert any("font stack" in problem for problem in problems)
    assert any('lang="bn"' in problem for problem in problems)


def test_the_guard_catches_a_file_that_is_not_utf8(tmp_path: pathlib.Path) -> None:
    guard = _guard()
    broken = tmp_path / "broken.html"
    broken.write_bytes(b"<html><p>\xff\xfe</p></html>")
    problems = guard.check_file(broken)
    assert any("not valid UTF-8" in problem for problem in problems)


def test_a_latin_only_document_is_not_the_guards_business() -> None:
    guard = _guard()
    plain = ROOT / "README.md"
    assert guard.check_file(plain) == []
