"""Kaggle preflight (CPU) for the chat-SFT kernel - data mount, split integrity, prompt joins.

No GPU, no model weights: it proves that the private dataset mounts where the training kernel
expects, that the train split is verified/leak-free, that the chat template masks the assistant
span as intended, and that every one of the 60 `model.parse` holdout cases has a prompt record.

Output: /kaggle/working/preflight.json (download with `kaggle kernels output`).
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import time

DATA = pathlib.Path("/kaggle/input/archresbd-sft-v0")
OUT = pathlib.Path("/kaggle/working")
BASE = "Qwen/Qwen3-4B-Instruct-2507"


def locate_data() -> pathlib.Path:
    """Find the mounted dataset even if Kaggle slugged the folder differently."""
    if (DATA / "train.jsonl").is_file():
        return DATA
    parent = pathlib.Path("/kaggle/input")
    if parent.is_dir():
        for candidate in sorted(parent.rglob("train.jsonl")):
            folder = candidate.parent
            if (folder / "manifest.json").is_file():
                return folder
        names = sorted(str(path.relative_to(parent)) for path in parent.rglob("*") if path.is_file())[:20]
    else:
        names = ["<no /kaggle/input>"]
    raise SystemExit(f"SFT dataset is not mounted; /kaggle/input files: {names}")


def read_jsonl(path: pathlib.Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def fail(message: str) -> None:
    print(f"FAIL {message}", flush=True)
    raise SystemExit(1)


def main() -> int:
    started = time.time()
    data = locate_data()
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "--no-input", "transformers>=4.51,<5", "tokenizers"]
    )
    from transformers import AutoTokenizer

    files = sorted(path.name for path in data.glob("*"))
    print(f"mounted at {data}: {files}", flush=True)
    for name in ("train.jsonl", "holdout.jsonl", "dataset.jsonl", "cases.jsonl", "manifest.json"):
        if not (data / name).is_file():
            fail(f"missing {name}")

    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    train = read_jsonl(data / "train.jsonl")
    holdout = read_jsonl(data / "holdout.jsonl")
    dataset = read_jsonl(data / "dataset.jsonl")
    cases = read_jsonl(data / "cases.jsonl")
    if manifest["counts"]["train"] != len(train) or manifest["counts"]["holdout"] != len(holdout):
        fail("manifest counts do not match the mounted files")
    if {record["id"] for record in train} & {record["id"] for record in holdout}:
        fail("train/holdout id overlap")
    if any(record.get("status") != "verified" for record in train):
        fail("an unverified record is in train")

    tokenizer = AutoTokenizer.from_pretrained(BASE)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    encoded = 0
    masked = 0
    for record in train[:2]:
        messages = record["messages"]
        prefix_text = tokenizer.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True
        )
        full_text = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False
        )
        if not full_text.startswith(prefix_text):
            fail(f"{record['id']}: chat template is not prefix-stable")
        answer_text = full_text[len(prefix_text) :]
        prefix_ids = tokenizer(prefix_text, add_special_tokens=False)["input_ids"]
        answer_ids = tokenizer(answer_text, add_special_tokens=False)["input_ids"]
        labels = [-100] * len(prefix_ids) + answer_ids
        if not answer_ids or all(label == -100 for label in labels):
            fail(f"{record['id']}: assistant answer would be fully masked")
        encoded += 1
        masked += sum(1 for label in labels if label == -100)

    model_cases = [case for case in cases if case.get("suite") == "model.parse"]
    by_id = {record["id"]: record for record in dataset}
    missing = [
        case["id"]
        for case in model_cases
        if (case.get("source") or {}).get("recordId") not in by_id
    ]
    if len(model_cases) != 60:
        fail(f"expected 60 model.parse holdout cases, found {len(model_cases)}")
    if missing:
        fail(f"{len(missing)} eval cases have no prompt record: {missing[:3]}")

    report = {
        "ok": True,
        "dataDir": data.as_posix(),
        "seconds": round(time.time() - started, 1),
        "files": files,
        "counts": {"train": len(train), "holdout": len(holdout), "dataset": len(dataset), "cases": len(cases)},
        "modelParseCases": len(model_cases),
        "promptRecords": len(model_cases),
        "encodedSample": {"records": encoded, "maskedTokens": masked},
        "template": "prefix-stable",
        "versions": {"transformers": __import__("transformers").__version__},
    }
    (OUT / "preflight.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(json.dumps({key: report[key] for key in ("ok", "counts", "modelParseCases", "seconds")}), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
