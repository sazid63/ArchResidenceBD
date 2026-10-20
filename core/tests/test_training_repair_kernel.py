"""The repair kernel must verify the bytes it mounts, and the split must stay frozen (W1.7)."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
KERNEL = ROOT / "tools" / "training" / "kaggle" / "repair" / "repair_sft.py"
SPLIT = ROOT / "data" / "training" / "repair-v1"
CORPUS = ROOT / "data" / "training" / "repair-v0"


def _kernel():
    spec = importlib.util.spec_from_file_location("archres_repair_sft_kernel", KERNEL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _inputs(tmp_path: pathlib.Path) -> pathlib.Path:
    for name in ("train.jsonl", "holdout.jsonl", "manifest.json"):
        shutil.copyfile(SPLIT / name, tmp_path / name)
    return tmp_path


def test_the_split_is_a_frozen_cut_of_the_corpus() -> None:
    manifest = json.loads((SPLIT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["counts"] == {"train": 12, "holdout": 4, "total": 16}
    assert manifest["frozenHoldout"]["mutations"] == [
        "float-arity",
        "volume-divide-zero",
        "column-unit-slip",
        "pads-hard-coded",
    ]
    train = [
        json.loads(line)
        for line in (SPLIT / "train.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    holdout = [
        json.loads(line)
        for line in (SPLIT / "holdout.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    corpus = [
        json.loads(line)
        for line in (CORPUS / "dataset.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(corpus) == 16
    train_mutations = {record["input"]["mutation"]["id"] for record in train}
    holdout_mutations = {record["input"]["mutation"]["id"] for record in holdout}
    assert train_mutations.isdisjoint(holdout_mutations)
    assert train_mutations | holdout_mutations == {
        record["input"]["mutation"]["id"] for record in corpus
    }
    for record in train + holdout:
        assert record["status"] == "verified"
        assert record["kind"] == "repair"


def test_the_kernel_accepts_the_frozen_split(tmp_path: pathlib.Path) -> None:
    train, holdout, manifest = _kernel().check_inputs(_inputs(tmp_path))
    assert len(train) == 12
    assert len(holdout) == 4
    assert manifest["frozenHoldout"]["mutations"]


def test_the_kernel_refuses_a_tampered_split(tmp_path: pathlib.Path) -> None:
    data = _inputs(tmp_path)
    path = data / "train.jsonl"
    path.write_bytes(path.read_bytes() + b"\n")
    with pytest.raises(SystemExit, match="does not match the manifest pin"):
        _kernel().check_inputs(data)


def test_the_kernel_refuses_a_moved_holdout(tmp_path: pathlib.Path) -> None:
    data = _inputs(tmp_path)
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    manifest["frozenHoldout"]["mutations"] = ["call-typo"]
    (data / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    with pytest.raises(SystemExit, match="not the frozen one"):
        _kernel().check_inputs(data)


def test_the_kernel_refuses_a_leaked_mutation(tmp_path: pathlib.Path) -> None:
    data = _inputs(tmp_path)
    train = [
        json.loads(line)
        for line in (data / "train.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    holdout = [
        json.loads(line)
        for line in (data / "holdout.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    train[0]["id"] = holdout[0]["id"]
    (data / "train.jsonl").write_text(
        "\n".join(json.dumps(record, ensure_ascii=False, sort_keys=True) for record in train) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    with pytest.raises(SystemExit, match="leakage"):
        _kernel().check_inputs(data)
