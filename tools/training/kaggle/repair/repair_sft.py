"""Archie-Repair SFT round 1 - venue-neutral training kernel (W1.7).

QLoRA on Qwen2.5-Coder-3B-Instruct with the frozen repair split, then greedy repairs for the
four **held-out** mutations. A repair is only right if the repaired macro passes the same CAD
case, so the replies are judged by the real engine on the dev machine
(``tools/training/eval_repair.py``), not by a text diff.

The same run records the **stock baseline** (the untouched base model answering the identical
prompts, greedy, same quantisation) so the fine-tune has an honest floor to be measured
against, exactly like the chat round's ``replies/stock.jsonl``.

Primary venue: Kaggle *script* kernel (ADR-0018) with
  - dataset:  sajidhossain004/archresbd-repair-v1 (train/holdout/manifest)
  - GPU:      T4 x1 (16 GB) - 4-bit QLoRA fits
  - internet: on (base model + huggingface)
  - output:   /kaggle/working (adapter/, replies/stock.jsonl, replies/finetune.jsonl)

Fallback venue: the dev RTX 4050 6 GB in an isolated venv (ADR-0019), same code, with
ARCHRES_SFT_DATA/OUT/MAX_LEN set; the run summary records the venue.

ARCHRES_SFT_SMOKE=1 runs 2 records for 2 steps and skips generation; it proves the environment
before spending GPU quota. ARCHRES_SFT_SKIP_GGUF is accepted and ignored here: the GGUF is
converted on a CPU host only if the candidate passes the engine gate.

Usage (from the repo root, on Kaggle this file is the kernel's code_file):
  uv run --directory core python ../tools/training/kaggle/repair/repair_sft.py
"""

from __future__ import annotations

import gc
import hashlib
import importlib.metadata
import json
import os
import pathlib
import subprocess
import sys
import time

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
# Kaggle's T4 shape can expose two GPUs and may already set CUDA_VISIBLE_DEVICES=0,1. This
# kernel loads the 4-bit model on one device; if Trainer sees a second GPU it wraps the model in
# DataParallel and the replica on GPU 1 fails against parameters on GPU 0. The visible device is
# therefore *forced* before torch is imported - `setdefault` would preserve the host's two-GPU
# value. ARCHRES_SFT_CUDA may name one GPU id.
os.environ["CUDA_VISIBLE_DEVICES"] = os.environ.get("ARCHRES_SFT_CUDA", "0").strip() or "0"

DATA = pathlib.Path(os.environ.get("ARCHRES_SFT_DATA", "/kaggle/input/archresbd-repair-v1"))
OUT = pathlib.Path(os.environ.get("ARCHRES_SFT_OUT", "/kaggle/working"))
BASE = os.environ.get("ARCHRES_SFT_BASE", "Qwen/Qwen2.5-Coder-3B-Instruct")
MAX_LEN = int(os.environ.get("ARCHRES_SFT_MAX_LEN", "5120"))
MAX_NEW_TOKENS = int(os.environ.get("ARCHRES_SFT_MAX_NEW_TOKENS", "3000"))
TRAIN_EPOCHS = float(os.environ.get("ARCHRES_SFT_EPOCHS", "4"))
TRAIN_ACCUM = int(os.environ.get("ARCHRES_SFT_ACCUM", "1"))
SEED = 20261020
SMOKE = os.environ.get("ARCHRES_SFT_SMOKE") == "1"
NO_INSTALL = os.environ.get("ARCHRES_SFT_NO_INSTALL") == "1"

#: Pinned to the 4.x line on purpose: transformers 5.x changed the TrainingArguments API
#: (`warmup_ratio` is gone), and a training kernel that breaks on a PyPI release is a kernel
#: that breaks in the queue. The chat round uses the same bounds.
PIP = [
    "transformers>=4.51,<5",
    "peft>=0.13",
    "bitsandbytes>=0.44",
    "accelerate>=1.0",
    "datasets>=3.0",
    "sentencepiece",
    "protobuf",
]


def log(message: str) -> None:
    print(f"[repair-sft] {message}", flush=True)


def install() -> None:
    if NO_INSTALL:
        log("dependencies assumed (ARCHRES_SFT_NO_INSTALL=1)")
        return
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "--no-input", *PIP]
    )
    log("dependencies installed")


def read_jsonl(path: pathlib.Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_jsonl(rows: list[dict], path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def locate_data() -> pathlib.Path:
    """Find the mounted dataset even if Kaggle slugged the folder differently."""
    if (DATA / "train.jsonl").is_file():
        return DATA
    parent = pathlib.Path("/kaggle/input")
    if parent.is_dir():
        for candidate in sorted(parent.rglob("train.jsonl")):
            folder = candidate.parent
            if (folder / "manifest.json").is_file() and (folder / "holdout.jsonl").is_file():
                return folder
        names = sorted(str(path.relative_to(parent)) for path in parent.rglob("*") if path.is_file())[:20]
    else:
        names = ["<no /kaggle/input>"]
    raise SystemExit(f"repair dataset is not mounted; /kaggle/input files: {names}")


def _sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_inputs(data: pathlib.Path) -> tuple[list[dict], list[dict], dict]:
    for name in ("train.jsonl", "holdout.jsonl", "manifest.json"):
        if not (data / name).is_file():
            raise SystemExit(f"missing dataset file: {data / name}")
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    train = read_jsonl(data / "train.jsonl")
    holdout = read_jsonl(data / "holdout.jsonl")
    counts = manifest.get("counts") or {}
    if counts.get("train") != len(train):
        raise SystemExit(f"train count {len(train)} != manifest {counts.get('train')}")
    if counts.get("holdout") != len(holdout):
        raise SystemExit(f"holdout count {len(holdout)} != manifest {counts.get('holdout')}")
    for name, rows in (("train", train), ("holdout", holdout)):
        if any(record.get("status") != "verified" for record in rows):
            raise SystemExit(f"the {name} split contains an unverified record")
        if any(record.get("kind") != "repair" for record in rows):
            raise SystemExit(f"the {name} split contains a non-repair record")
    train_ids = {record["id"] for record in train}
    holdout_ids = {record["id"] for record in holdout}
    if train_ids & holdout_ids:
        raise SystemExit("train/holdout leakage")
    frozen = (manifest.get("frozenHoldout") or {}).get("mutations") or []
    actual = [record["input"]["mutation"]["id"] for record in holdout]
    if sorted(frozen) != sorted(actual):
        raise SystemExit(f"the holdout is not the frozen one: {actual} != {frozen}")
    files = manifest.get("files") or {}
    for name in ("train.jsonl", "holdout.jsonl"):
        pinned = (files.get(name) or {}).get("sha256")
        if pinned is None:
            raise SystemExit(f"manifest does not pin {name}")
        actual_sha = _sha256(data / name)
        if actual_sha != pinned:
            raise SystemExit(f"{name} sha256 {actual_sha} does not match the manifest pin {pinned}")
    log(f"inputs: {len(train)} train, {len(holdout)} holdout, frozen holdout {frozen}")
    return train, holdout, manifest


def encode_records(records: list[dict], tokenizer) -> tuple[list[dict], dict]:
    encoded: list[dict] = []
    skipped: list[str] = []
    lengths: list[int] = []
    for record in records:
        messages = record.get("messages") or []
        if len(messages) < 3 or messages[-1].get("role") != "assistant":
            skipped.append(str(record.get("id")))
            continue
        prefix_text = tokenizer.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True
        )
        full_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
        if not full_text.startswith(prefix_text):
            raise SystemExit(f"{record.get('id')}: chat template is not prefix-stable")
        prefix_ids = tokenizer(prefix_text, add_special_tokens=False)["input_ids"]
        full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]
        if full_ids[: len(prefix_ids)] != prefix_ids:
            raise SystemExit(f"{record.get('id')}: prefix tokenisation is not prefix-stable")
        if len(prefix_ids) >= MAX_LEN or len(full_ids) <= len(prefix_ids):
            skipped.append(str(record.get("id")))
            continue
        ids = full_ids[:MAX_LEN]
        labels = ([-100] * len(prefix_ids) + full_ids[len(prefix_ids) :])[:MAX_LEN]
        if all(label == -100 for label in labels):
            skipped.append(str(record.get("id")))
            continue
        encoded.append({"input_ids": ids, "labels": labels})
        lengths.append(len(ids))
    stats = {
        "records": len(encoded),
        "skipped": len(skipped),
        "skippedIds": skipped[:20],
        "maxTokens": max(lengths) if lengths else 0,
        "meanTokens": round(sum(lengths) / len(lengths), 1) if lengths else 0,
    }
    log(f"encoded: {stats['records']} records, {stats['skipped']} skipped, max {stats['maxTokens']} tokens")
    if not encoded:
        raise SystemExit("no trainable records after tokenisation")
    return encoded, stats


def pad_batch(features: list[dict], pad_token_id: int) -> dict[str, list[list[int]]]:
    """Pad a causal-LM batch, labels included (the stock collator pads ids but not labels)."""
    if not features:
        raise ValueError("empty batch")
    widths: list[int] = []
    for index, feature in enumerate(features):
        input_ids = feature.get("input_ids")
        labels = feature.get("labels")
        if not isinstance(input_ids, list) or not isinstance(labels, list):
            raise ValueError(f"feature {index}: input_ids and labels must be lists")
        if len(input_ids) != len(labels):
            raise ValueError(f"feature {index}: id and label lengths differ")
        if not input_ids:
            raise ValueError(f"feature {index}: empty input_ids")
        widths.append(len(input_ids))
    width = max(widths)
    return {
        "input_ids": [
            feature["input_ids"] + [pad_token_id] * (width - len(feature["input_ids"]))
            for feature in features
        ],
        "labels": [
            feature["labels"] + [-100] * (width - len(feature["labels"])) for feature in features
        ],
        "attention_mask": [
            [1] * len(feature["input_ids"]) + [0] * (width - len(feature["input_ids"]))
            for feature in features
        ],
    }


class CausalLMCollator:
    """Tokenize-free collator: the kernel already produced ids and labels."""

    def __init__(self, pad_token_id: int) -> None:
        self.pad_token_id = pad_token_id

    def __call__(self, features: list[dict]) -> dict:
        import torch

        batch = pad_batch(features, self.pad_token_id)
        return {name: torch.tensor(values, dtype=torch.long) for name, values in batch.items()}


def assert_single_gpu(visible: int) -> None:
    """Refuse to build a Trainer that would wrap the 4-bit model in DataParallel."""
    if visible != 1:
        raise SystemExit(
            f"expected exactly one visible GPU, found {visible}; "
            "set ARCHRES_SFT_CUDA to one device id"
        )


def generate_repairs(model, tokenizer, holdout: list[dict], label: str) -> tuple[list[dict], float]:
    import torch

    model.eval()
    torch.manual_seed(SEED)
    started = time.time()
    replies: list[dict] = []
    for number, record in enumerate(holdout, start=1):
        messages = record.get("messages") or []
        text = tokenizer.apply_chat_template(
            messages[:2], tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(text, return_tensors="pt").to("cuda")
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        macro = tokenizer.decode(
            generated[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True
        ).strip()
        replies.append(
            {
                "mutationId": record["input"]["mutation"]["id"],
                "recordId": record["id"],
                "caseId": record["input"]["caseId"],
                "macro": macro,
            }
        )
        log(f"{label} repairs: {number}/{len(holdout)}")
    seconds = round(time.time() - started, 1)
    log(f"{label} repairs: {len(replies)} in {seconds}s")
    return replies, seconds


def train(records: list[dict], tokenizer, model) -> dict:
    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import Trainer, TrainingArguments

    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model = get_peft_model(
        model,
        LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=[
                "q_proj",
                "k_proj",
                "v_proj",
                "o_proj",
                "gate_proj",
                "up_proj",
                "down_proj",
            ],
        ),
    )
    model.print_trainable_parameters()

    subset = records[:2] if SMOKE else records
    bf16 = torch.cuda.is_bf16_supported()
    arguments = TrainingArguments(
        output_dir=str(OUT / "checkpoints"),
        per_device_train_batch_size=1,
        # A 12-record corpus with an effective batch of 8 would be four optimizer steps in
        # total - too few to move anything. One sample per step gives 48 steps for four
        # epochs, which is what a corpus this small needs.
        gradient_accumulation_steps=TRAIN_ACCUM,
        num_train_epochs=TRAIN_EPOCHS,
        max_steps=2 if SMOKE else -1,
        learning_rate=1e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        logging_steps=1,
        save_strategy="no",
        fp16=not bf16,
        bf16=bf16,
        optim="paged_adamw_8bit",
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        report_to="none",
        dataloader_num_workers=2,
        remove_unused_columns=False,
    )
    trainer = Trainer(
        model=model,
        args=arguments,
        train_dataset=Dataset.from_list(subset),
        data_collator=CausalLMCollator(tokenizer.pad_token_id),
    )
    started = time.time()
    result = trainer.train()
    seconds = round(time.time() - started, 1)
    log(f"trained: {result.global_step} steps, loss {result.training_loss:.4f}, {seconds}s")
    adapter = OUT / "adapter"
    model.save_pretrained(adapter)
    tokenizer.save_pretrained(adapter)
    return {
        "trainRecords": len(subset),
        "epochs": TRAIN_EPOCHS,
        "steps": int(result.global_step),
        "loss": float(result.training_loss),
        "seconds": seconds,
        "precision": "bf16" if bf16 else "fp16",
    }


def main() -> int:
    started = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    install()
    data = locate_data()
    train_records, holdout, manifest = check_inputs(data)

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

    if not torch.cuda.is_available():
        raise SystemExit("no GPU: the repair kernel must run with a GPU accelerator")
    assert_single_gpu(torch.cuda.device_count())
    log(f"gpu: {torch.cuda.get_device_name(0)}")
    torch.manual_seed(SEED)

    tokenizer = AutoTokenizer.from_pretrained(BASE)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    encoded, encode_stats = encode_records(train_records, tokenizer)

    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        BASE, quantization_config=quantization, device_map={"": 0}, torch_dtype=torch.float16
    )

    stock_replies: list[dict] = []
    stock_seconds = 0.0
    if not SMOKE:
        stock_replies, stock_seconds = generate_repairs(model, tokenizer, holdout, "stock")
        write_jsonl(stock_replies, OUT / "replies" / "stock.jsonl")

    train_summary = train(encoded, tokenizer, model)

    summary = {
        "base": BASE,
        "gpu": torch.cuda.get_device_name(0),
        "seed": SEED,
        "maxLen": MAX_LEN,
        "maxNewTokens": MAX_NEW_TOKENS,
        "smoke": SMOKE,
        **train_summary,
        "encode": encode_stats,
        "repairs": {
            "holdout": len(holdout),
            "stockSeconds": stock_seconds,
            "finetuneSeconds": 0.0,
            "frozenHoldout": (manifest.get("frozenHoldout") or {}).get("mutations"),
        },
        "manifestPin": manifest.get("pins"),
        "versions": {
            name: importlib.metadata.version(name)
            for name in ("torch", "transformers", "peft", "bitsandbytes", "accelerate", "datasets")
        },
        "elapsedSeconds": round(time.time() - started, 1),
    }
    # The summary is written *before* the fine-tuned generation: if generation fails, the
    # training evidence (steps, loss, versions) and the stock replies are still on disk.
    (OUT / "train-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    finetune_replies, finetune_seconds = generate_repairs(model, tokenizer, holdout, "finetune")
    write_jsonl(finetune_replies, OUT / "replies" / "finetune.jsonl")
    summary["repairs"]["finetuneSeconds"] = finetune_seconds
    summary["elapsedSeconds"] = round(time.time() - started, 1)
    (OUT / "train-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    del model
    gc.collect()
    torch.cuda.empty_cache()
    log(f"done: {summary['elapsedSeconds']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
