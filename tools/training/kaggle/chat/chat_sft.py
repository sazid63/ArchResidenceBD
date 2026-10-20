"""Archie-Chat SFT v0 - venue-neutral training kernel (W1.6).

QLoRA on Qwen3-4B-Instruct-2507 with the frozen train split, then greedy replies for the 60
`model.parse` holdout cases (the W1.9 gate set) and a merged Q4_K_M GGUF artifact for the fleet.

Primary venue: Kaggle *script* kernel (ADR-0018) with
  - dataset:  sajidhossain004/archresbd-sft-v0 (train/holdout/dataset/cases/manifest)
  - GPU:      T4 x1 (16 GB)  - 4-bit QLoRA fits
  - internet: on (base model + llama.cpp)
  - output:   /kaggle/working (adapter/, replies/finetune.jsonl, archres-chat-v0-Q4_K_M.gguf)

Fallback venue: the dev RTX 4050 6 GB in an isolated venv (ADR-0019), same code, with
ARCHRES_SFT_DATA/OUT/MAX_LEN/NO_INSTALL/SKIP_GGUF set; the run summary records the venue.

Nothing here trains unless W1.9 can measure it: the eval prompts are the *same dataset records*
the stock baseline answered, and the reply set is scored by `tools/eval/run_eval.py` locally.

ARCHRES_SFT_SMOKE=1 runs 8 records for 2 steps and skips merge/GGUF; it proves the environment
before spending GPU quota. ARCHRES_SFT_SKIP_GGUF=1 keeps the adapter/replies and defers GGUF
conversion to a CPU host.
"""

from __future__ import annotations

import gc
import hashlib
import importlib.metadata
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

SMOKE = os.environ.get("ARCHRES_SFT_SMOKE") == "1"
SKIP_GGUF = os.environ.get("ARCHRES_SFT_SKIP_GGUF") == "1"
NO_INSTALL = os.environ.get("ARCHRES_SFT_NO_INSTALL") == "1"
BASE = os.environ.get("ARCHRES_SFT_BASE", "Qwen/Qwen3-4B-Instruct-2507")
DATA = pathlib.Path(os.environ.get("ARCHRES_SFT_DATA", "/kaggle/input/archresbd-sft-v0"))
OUT = pathlib.Path(os.environ.get("ARCHRES_SFT_OUT", "/kaggle/working"))
LLAMA = OUT / "llama.cpp"
MAX_LEN = int(os.environ.get("ARCHRES_SFT_MAX_LEN", "2048"))
MAX_NEW_TOKENS = int(os.environ.get("ARCHRES_SFT_MAX_NEW_TOKENS", "320"))
TRAIN_EPOCHS = 1 if SMOKE else 2
SEED = 20261020

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
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


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


def write_jsonl(rows: list[dict], path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_inputs(data: pathlib.Path) -> tuple[list[dict], list[dict], list[dict], dict]:
    for name in ("train.jsonl", "holdout.jsonl", "dataset.jsonl", "cases.jsonl", "manifest.json"):
        if not (data / name).is_file():
            raise SystemExit(f"missing dataset file: {data / name}")
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    train = read_jsonl(data / "train.jsonl")
    holdout = read_jsonl(data / "holdout.jsonl")
    dataset = read_jsonl(data / "dataset.jsonl")
    cases = read_jsonl(data / "cases.jsonl")
    counts = manifest.get("counts") or {}
    if counts.get("train") != len(train):
        raise SystemExit(f"train count {len(train)} != manifest {counts.get('train')}")
    if counts.get("holdout") != len(holdout):
        raise SystemExit(f"holdout count {len(holdout)} != manifest {counts.get('holdout')}")
    if counts.get("total") != len(dataset):
        raise SystemExit(f"dataset count {len(dataset)} != manifest {counts.get('total')}")
    for name, rows in (("train", train), ("holdout", holdout)):
        if any(record.get("status") != "verified" for record in rows):
            raise SystemExit(f"the {name} split contains an unverified record")
        if any(record.get("kind") != "chat" for record in rows):
            raise SystemExit(f"the {name} split contains a non-chat record")
    dataset_ids = [record["id"] for record in dataset]
    if len(dataset_ids) != len(set(dataset_ids)):
        raise SystemExit("dataset.jsonl contains duplicate ids")
    train_ids = {record["id"] for record in train}
    holdout_ids = {record["id"] for record in holdout}
    overlap = holdout_ids & train_ids
    if overlap:
        raise SystemExit(f"train/holdout leakage: {sorted(overlap)[:3]}")
    if train_ids | holdout_ids != set(dataset_ids):
        raise SystemExit("train + holdout do not exactly partition dataset.jsonl")
    pins = manifest.get("pins") or {}
    files = manifest.get("files") or {}
    expected = {
        "dataset.jsonl": (pins.get("dataset") or {}).get("sha256"),
        "train.jsonl": (files.get("train.jsonl") or {}).get("sha256"),
        "holdout.jsonl": (files.get("holdout.jsonl") or {}).get("sha256"),
    }
    for name, pinned in expected.items():
        if pinned is None:
            raise SystemExit(f"manifest does not pin {name}")
        actual = _sha256(data / name)
        if actual != pinned:
            raise SystemExit(f"{name} sha256 {actual} does not match the manifest pin {pinned}")
    model_cases = [case for case in cases if case.get("suite") == "model.parse"]
    if len(model_cases) != 60:
        raise SystemExit(f"expected 60 model.parse cases, found {len(model_cases)}")
    leaked = sorted(
        case["id"]
        for case in model_cases
        if (case.get("source") or {}).get("recordId") not in holdout_ids
    )
    if leaked:
        raise SystemExit(f"model cases not in the holdout split: {leaked[:3]}")
    log(f"inputs: {len(train)} train, {len(holdout)} holdout, {len(dataset)} dataset, {len(cases)} eval cases")
    return train, dataset, cases, manifest


def encode_records(train: list[dict], tokenizer) -> tuple[list[dict], dict]:
    records: list[dict] = []
    skipped: list[str] = []
    lengths: list[int] = []
    for index, record in enumerate(train):
        messages = record.get("messages") or []
        if len(messages) < 3 or messages[-1].get("role") != "assistant":
            skipped.append(str(record.get("id")))
            continue
        prefix_text = tokenizer.apply_chat_template(
            messages[:-1], tokenize=False, add_generation_prompt=True
        )
        full_text = tokenizer.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=False
        )
        if not full_text.startswith(prefix_text):
            raise SystemExit(f"{record.get('id')}: chat template is not prefix-stable")
        prefix_ids = tokenizer(prefix_text, add_special_tokens=False)["input_ids"]
        full_ids = tokenizer(full_text, add_special_tokens=False)["input_ids"]
        # Tokenising the answer separately can merge across the prompt/answer boundary, so the
        # label span must come from the tokenisation of the whole template. The prefix has to be
        # a literal token prefix, not just a string prefix; otherwise the loss is trained on a
        # different sequence from the one the model sees. This was a silent hazard in the first
        # version of this kernel (string-prefix check only).
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
        records.append({"input_ids": ids, "labels": labels})
        lengths.append(len(ids))
    stats = {
        "records": len(records),
        "skipped": len(skipped),
        "skippedIds": skipped[:20],
        "maxTokens": max(lengths) if lengths else 0,
        "meanTokens": round(sum(lengths) / len(lengths), 1) if lengths else 0,
    }
    log(f"encoded: {stats['records']} records, {stats['skipped']} skipped, max {stats['maxTokens']} tokens")
    if not records:
        raise SystemExit("no trainable records after tokenisation")
    return records, stats


def pad_batch(features: list[dict], pad_token_id: int) -> dict[str, list[list[int]]]:
    """Pad a causal-LM batch, labels included.

    The stock `DataCollatorForLanguageModeling` delegates padding to the tokenizer, which does
    not pad `labels`; a batch with two different sequence lengths then fails while the tensor is
    built.  Padding is explicit here so every feature is the same width and label padding is -100
    (ignored by the loss).  Per-feature input/label alignment is checked before padding: a
    mismatch is a tokenisation bug, not something to hide with padding.
    """
    if not features:
        raise ValueError("empty batch")
    widths: list[int] = []
    for index, feature in enumerate(features):
        input_ids = feature.get("input_ids")
        labels = feature.get("labels")
        if not isinstance(input_ids, list) or not isinstance(labels, list):
            raise ValueError(f"feature {index}: input_ids and labels must be lists")
        if len(input_ids) != len(labels):
            raise ValueError(
                f"feature {index}: input_ids length {len(input_ids)} and labels length "
                f"{len(labels)} are different lengths"
            )
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
            feature["labels"] + [-100] * (width - len(feature["labels"]))
            for feature in features
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


def train(records: list[dict], tokenizer) -> tuple[object, dict]:
    import torch
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import (
        AutoModelForCausalLM,
        BitsAndBytesConfig,
        Trainer,
        TrainingArguments,
    )

    if not torch.cuda.is_available():
        raise SystemExit("no GPU: Kaggle kernel must run with a GPU accelerator")
    log(f"gpu: {torch.cuda.get_device_name(0)}")
    torch.manual_seed(SEED)

    quantization = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        BASE,
        quantization_config=quantization,
        device_map={"": 0},
        torch_dtype=torch.float16,
    )
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

    subset = records[:8] if SMOKE else records
    bf16 = torch.cuda.is_bf16_supported()
    arguments = TrainingArguments(
        output_dir=str(OUT / "checkpoints"),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=8,
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
    log(
        f"batch: per_device={arguments.per_device_train_batch_size}, "
        f"accum={arguments.gradient_accumulation_steps}, effective={arguments.train_batch_size}"
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
    summary = {
        "base": BASE,
        "trainRecords": len(subset),
        "epochs": TRAIN_EPOCHS,
        "steps": int(result.global_step),
        "loss": float(result.training_loss),
        "seconds": seconds,
        "gpu": torch.cuda.get_device_name(0),
        "smoke": SMOKE,
        "seed": SEED,
        "precision": "bf16" if bf16 else "fp16",
        "maxLen": MAX_LEN,
    }
    return model, summary


def generate_replies(model, tokenizer, dataset: list[dict], cases: list[dict]) -> dict:
    import torch

    model_cases = [case for case in cases if case.get("suite") == "model.parse"]
    if SMOKE:
        model_cases = model_cases[:4]
    if not model_cases:
        raise SystemExit("no model.parse cases in the eval set")
    by_id = {record["id"]: record for record in dataset}
    prompts: dict[str, list[dict]] = {}
    missing: list[str] = []
    for case in model_cases:
        record_id = (case.get("source") or {}).get("recordId")
        record = by_id.get(record_id)
        if record is None:
            missing.append(str(record_id))
            continue
        messages = record.get("messages") or []
        if len(messages) < 2:
            missing.append(str(record_id))
            continue
        prompts[case["id"]] = messages[:2]
    if missing:
        raise SystemExit(f"eval prompts missing for {len(missing)} cases: {missing[:5]}")

    model.eval()
    torch.manual_seed(SEED)
    replies: list[dict] = []
    started = time.time()
    for number, case in enumerate(sorted(model_cases, key=lambda item: item["id"]), start=1):
        text = tokenizer.apply_chat_template(
            prompts[case["id"]], tokenize=False, add_generation_prompt=True
        )
        inputs = tokenizer(text, return_tensors="pt").to("cuda")
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id,
            )
        reply = tokenizer.decode(
            generated[0][inputs["input_ids"].shape[1] :], skip_special_tokens=True
        ).strip()
        replies.append({"caseId": case["id"], "reply": reply})
        if number % 10 == 0:
            log(f"replies: {number}/{len(model_cases)}")
    log(f"replies: {len(replies)} in {round(time.time() - started, 1)}s")
    return {
        "replies": replies,
        "seconds": round(time.time() - started, 1),
        "cases": len(model_cases),
    }


def build_gguf() -> dict:
    import torch  # noqa: F401 - ensure the env is still healthy before the CPU merge
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if SMOKE:
        return {"skipped": "smoke run"}
    if SKIP_GGUF:
        return {"skipped": "ARCHRES_SFT_SKIP_GGUF=1 (convert on a CPU host)"}
    result: dict = {}
    merged_dir = OUT / "merged"
    log("merging the adapter into fp16 weights (CPU)")
    base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.float16, device_map={"": "cpu"})
    merged = PeftModel.from_pretrained(base, OUT / "adapter").merge_and_unload()
    merged.save_pretrained(merged_dir, safe_serialization=True)
    AutoTokenizer.from_pretrained(BASE).save_pretrained(merged_dir)
    del base, merged
    gc.collect()
    log("merged weights saved")

    if LLAMA.exists():
        shutil.rmtree(LLAMA)
    subprocess.check_call(
        ["git", "clone", "--depth", "1", "https://github.com/ggml-org/llama.cpp", str(LLAMA)]
    )
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "-q", "--no-input", "-r", str(LLAMA / "requirements.txt")]
    )
    f16 = OUT / "archres-chat-v0-f16.gguf"
    subprocess.check_call(
        [
            sys.executable,
            str(LLAMA / "convert_hf_to_gguf.py"),
            str(merged_dir),
            "--outfile",
            str(f16),
            "--outtype",
            "f16",
        ],
        cwd=str(LLAMA),
    )
    shutil.rmtree(merged_dir)
    result["f16Bytes"] = f16.stat().st_size
    log(f"gguf f16: {round(result['f16Bytes'] / 1e9, 2)} GB")

    build = LLAMA / "build"
    subprocess.check_call(
        [
            "cmake",
            "-S",
            str(LLAMA),
            "-B",
            str(build),
            "-DCMAKE_BUILD_TYPE=Release",
            "-DLLAMA_CURL=OFF",
            "-DGGML_NATIVE=OFF",
        ]
    )
    subprocess.check_call(
        ["cmake", "--build", str(build), "--config", "Release", "-j", "4", "--target", "llama-quantize"]
    )
    quantized = OUT / "archres-chat-v0-Q4_K_M.gguf"
    subprocess.check_call(
        [str(build / "bin" / "llama-quantize"), str(f16), str(quantized), "Q4_K_M"]
    )
    f16.unlink(missing_ok=True)
    result["q4Bytes"] = quantized.stat().st_size
    result["quantized"] = quantized.name
    log(f"gguf Q4_K_M: {round(result['q4Bytes'] / 1e9, 2)} GB")
    shutil.rmtree(LLAMA, ignore_errors=True)
    shutil.rmtree(OUT / "checkpoints", ignore_errors=True)
    return result


def main() -> int:
    started = time.time()
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    OUT.mkdir(parents=True, exist_ok=True)
    install()
    data = locate_data()
    train_records, dataset, cases, manifest = check_inputs(data)

    import torch
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(BASE)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    encoded, encode_stats = encode_records(train_records, tokenizer)
    model, train_summary = train(encoded, tokenizer)
    reply_result = generate_replies(model, tokenizer, dataset, cases)
    write_jsonl(reply_result["replies"], OUT / "replies" / "finetune.jsonl")

    summary = {
        **train_summary,
        "encode": encode_stats,
        "replies": {
            "records": len(reply_result["replies"]),
            "seconds": reply_result["seconds"],
            "suite": "model.parse",
        },
        "manifestPin": manifest.get("pins"),
        "versions": {
            name: importlib.metadata.version(name)
            for name in ("torch", "transformers", "peft", "bitsandbytes", "accelerate", "datasets")
        },
        "elapsedSeconds": round(time.time() - started, 1),
    }
    (OUT / "train-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    del model
    gc.collect()
    torch.cuda.empty_cache()
    try:
        summary["gguf"] = build_gguf()
    except Exception as exc:  # noqa: BLE001 - keep the adapter and replies even if GGUF fails
        summary["gguf"] = {"error": f"{type(exc).__name__}: {exc}"}
        log(f"gguf step failed: {exc}")
    summary["elapsedSeconds"] = round(time.time() - started, 1)
    (OUT / "train-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    log(f"done: {summary['elapsedSeconds']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
