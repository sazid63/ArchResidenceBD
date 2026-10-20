"""The GGUF converter must not double relative paths when it changes cwd (W1.6)."""

from __future__ import annotations

import importlib.util
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONVERTER = ROOT / "tools" / "training" / "convert_gguf.py"


def _converter():
    spec = importlib.util.spec_from_file_location("archres_convert_gguf", CONVERTER)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_convert_uses_absolute_paths_from_a_relative_checkout(
    tmp_path: pathlib.Path, monkeypatch
) -> None:
    source = tmp_path / "llama.cpp"
    source.mkdir()
    (source / "convert_hf_to_gguf.py").write_text("", encoding="utf-8")
    (tmp_path / "merged").mkdir()
    calls: list[tuple[list[str], str | None]] = []

    def fake_check_call(command: list[str], cwd: str | None = None) -> None:
        calls.append((command, cwd))

    module = _converter()
    monkeypatch.setattr(module.subprocess, "check_call", fake_check_call)
    monkeypatch.chdir(tmp_path)

    module.convert(pathlib.Path("llama.cpp"), pathlib.Path("merged"), pathlib.Path("merged.f16.gguf"))

    assert len(calls) == 1
    command, cwd = calls[0]
    assert pathlib.Path(command[1]) == (tmp_path / "llama.cpp" / "convert_hf_to_gguf.py").resolve()
    assert pathlib.Path(command[1]).is_absolute()
    assert pathlib.Path(command[2]) == (tmp_path / "merged").resolve()
    assert pathlib.Path(command[4]) == (tmp_path / "merged.f16.gguf").resolve()
    assert cwd is not None and pathlib.Path(cwd).is_absolute()
