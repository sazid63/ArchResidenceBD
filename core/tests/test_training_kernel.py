"""The training kernel must verify the bytes it mounts, not just their counts (W1.6)."""

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import shutil

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
KERNEL = ROOT / "tools" / "training" / "kaggle" / "chat" / "chat_sft.py"
SFT = ROOT / "data" / "training" / "sft-v0"
SFT1 = ROOT / "data" / "training" / "sft-v1"
CHAT = ROOT / "data" / "training" / "chat-v0"
EVAL = ROOT / "data" / "eval" / "chat-v0"


def _kernel():
    spec = importlib.util.spec_from_file_location("archres_chat_sft_kernel", KERNEL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _inputs(tmp_path: pathlib.Path, base: pathlib.Path = SFT) -> pathlib.Path:
    for name in ("train.jsonl", "holdout.jsonl", "manifest.json"):
        shutil.copyfile(base / name, tmp_path / name)
    if base == SFT:
        shutil.copyfile(CHAT / "dataset.jsonl", tmp_path / "dataset.jsonl")
        shutil.copyfile(EVAL / "cases.jsonl", tmp_path / "cases.jsonl")
    else:
        shutil.copyfile(base / "dataset.jsonl", tmp_path / "dataset.jsonl")
        shutil.copyfile(base / "cases.jsonl", tmp_path / "cases.jsonl")
    return tmp_path


def test_the_kernel_checks_pinned_inputs(tmp_path: pathlib.Path) -> None:
    train, dataset, cases, manifest = _kernel().check_inputs(_inputs(tmp_path))
    assert len(train) == 414
    assert len(dataset) == 661
    assert len(cases) == 655
    assert manifest["counts"]["holdout"] == 247


def test_the_kernel_accepts_the_teacher_augmented_split(tmp_path: pathlib.Path) -> None:
    train, dataset, cases, manifest = _kernel().check_inputs(_inputs(tmp_path, SFT1))
    assert len(train) == 475
    assert len(dataset) == 722
    assert len(cases) == 655
    assert manifest["counts"]["teacherAccepted"] == 61
    assert manifest["tokens"]["declaredShortfall"] is True


def test_the_kernel_refuses_a_tampered_dataset(tmp_path: pathlib.Path) -> None:
    data = _inputs(tmp_path)
    path = data / "dataset.jsonl"
    path.write_bytes(path.read_bytes() + b"\n")  # valid JSONL, wrong bytes
    with pytest.raises(SystemExit, match="does not match the manifest pin"):
        _kernel().check_inputs(data)


def test_the_collator_pads_labels_and_inputs_to_the_same_width() -> None:
    batch = _kernel().pad_batch(
        [
            {"input_ids": [10, 11], "labels": [-100, 11]},
            {"input_ids": [20, 21, 22], "labels": [-100, 21, 22]},
        ],
        pad_token_id=0,
    )
    assert batch == {
        "input_ids": [[10, 11, 0], [20, 21, 22]],
        "labels": [[-100, 11, -100], [-100, 21, 22]],
        "attention_mask": [[1, 1, 0], [1, 1, 1]],
    }


def test_the_collator_refuses_misaligned_labels() -> None:
    with pytest.raises(ValueError, match="different lengths"):
        _kernel().pad_batch(
            [{"input_ids": [10, 11], "labels": [-100]}],
            pad_token_id=0,
        )


def test_the_kernel_refuses_a_model_case_outside_the_holdout(tmp_path: pathlib.Path) -> None:
    data = _inputs(tmp_path)
    train_id = json.loads((data / "train.jsonl").read_text(encoding="utf-8").splitlines()[0])["id"]
    cases = [
        json.loads(line)
        for line in (data / "cases.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    target = next(case for case in cases if case.get("suite") == "model.parse")
    target["source"]["recordId"] = train_id
    (data / "cases.jsonl").write_text(
        "\n".join(json.dumps(case, ensure_ascii=False, sort_keys=True) for case in cases) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    with pytest.raises(SystemExit, match="not in the holdout split"):
        _kernel().check_inputs(data)


def test_the_kernel_forces_one_visible_gpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0,1")
    monkeypatch.delenv("ARCHRES_SFT_CUDA", raising=False)
    _kernel()
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"


def test_the_kernel_honours_an_explicit_single_gpu(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0,1")
    monkeypatch.setenv("ARCHRES_SFT_CUDA", "1")
    _kernel()
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "1"


def test_the_kernel_refuses_more_than_one_visible_gpu() -> None:
    with pytest.raises(SystemExit, match="exactly one visible GPU"):
        _kernel().assert_single_gpu(2)
