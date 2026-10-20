"""Merge a LoRA adapter and build a quantized GGUF - CPU only (W1.6 / ADR-0019).

Training produces an adapter; the fleet needs a GGUF. Neither step needs a GPU:

1. merge   - load the base in fp16 on CPU, merge the adapter in place (`safe_merge=True`, so the
             peak is one model, not two), save the merged weights;
2. convert - run llama.cpp's `convert_hf_to_gguf.py` (the checkout must match the quantizer build);
3. quantize- run the fleet's `llama-quantize` (the binary and its DLLs must sit together).

The merged directory is removed as soon as the f16 GGUF exists, so the 4B merge, the f16 file
and the quantized output do not all have to fit on a 16 GB dev disk at once. A failed quantize
can be retried with `--skip-convert`; a pre-existing merged dir is left alone with
`--skip-convert`.

Run it with the training venv (torch/transformers/peft/accelerate installed), not the app env:

  data\\tmp\\train-venv\\Scripts\\python.exe tools\\training\\convert_gguf.py ^
    --base Qwen/Qwen3-4B-Instruct-2507 ^
    --adapter data\\downloads\\finetune\\chat-v0\\adapter ^
    --merged  data\\downloads\\finetune\\chat-v0\\merged ^
    --llama-src data\\tmp\\llama.cpp ^
    --quantize data\\downloads\\s2\\bin\\llama\\llama-quantize.exe ^
    --out data\\downloads\\finetune\\chat-v0\\archres-chat-v0-Q4_K_M.gguf

The tool is deliberately not part of the app's dependency graph; it fails with a clear message
when torch/peft are missing instead of silently installing them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import time


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def merge(base: str, adapter: pathlib.Path, merged: pathlib.Path) -> None:
    try:
        import torch
        from peft import PeftModel
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as exc:  # pragma: no cover - exercised by the operator
        raise SystemExit(
            f"merge needs torch/transformers/peft in this interpreter ({sys.executable}): {exc}"
        ) from exc

    if not (adapter / "adapter_config.json").is_file():
        raise SystemExit(f"not a PEFT adapter: {adapter}")
    log(f"loading base {base} in fp16 on CPU")
    model = AutoModelForCausalLM.from_pretrained(
        base,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    log("merging the adapter in place")
    model = PeftModel.from_pretrained(model, adapter).merge_and_unload(safe_merge=True)
    merged.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(merged, safe_serialization=True)
    AutoTokenizer.from_pretrained(base).save_pretrained(merged)
    del model
    log(f"merged weights: {merged}")


def convert(llama_src: pathlib.Path, merged: pathlib.Path, f16: pathlib.Path) -> None:
    script = llama_src / "convert_hf_to_gguf.py"
    if not script.is_file():
        raise SystemExit(f"llama.cpp checkout has no convert_hf_to_gguf.py: {llama_src}")
    log(f"converting {merged} -> {f16.name} (f16)")
    subprocess.check_call(
        [
            sys.executable,
            str(script),
            str(merged),
            "--outfile",
            str(f16),
            "--outtype",
            "f16",
        ],
        cwd=str(llama_src),
    )


def quantize(quantize_exe: pathlib.Path, f16: pathlib.Path, out: pathlib.Path, quant: str) -> None:
    if not quantize_exe.is_file():
        raise SystemExit(f"quantizer not found: {quantize_exe}")
    log(f"quantizing {f16.name} -> {out.name} ({quant})")
    subprocess.check_call(
        [str(quantize_exe), str(f16), str(out), quant],
        cwd=str(quantize_exe.parent),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Merge a LoRA adapter and build a quantized GGUF (CPU).")
    parser.add_argument("--base", help="HF base model id or path (needed unless --skip-merge)")
    parser.add_argument("--adapter", type=pathlib.Path, help="PEFT adapter directory")
    parser.add_argument("--merged", type=pathlib.Path, help="merged fp16 output directory")
    parser.add_argument("--llama-src", type=pathlib.Path, required=True, help="llama.cpp checkout (convert script)")
    parser.add_argument("--quantize", type=pathlib.Path, required=True, help="llama-quantize binary")
    parser.add_argument("--out", type=pathlib.Path, required=True, help="quantized GGUF output file")
    parser.add_argument("--quant", default="Q4_K_M", help="llama.cpp quantization type (default Q4_K_M)")
    parser.add_argument("--skip-merge", action="store_true", help="convert/quantize an existing --merged dir")
    parser.add_argument("--skip-convert", action="store_true", help="quantize an existing f16 GGUF (<merged>.f16.gguf)")
    parser.add_argument("--keep-f16", action="store_true", help="keep the intermediate f16 GGUF")
    args = parser.parse_args()

    merged = args.merged
    if merged is None:
        raise SystemExit("--merged is required (the merged directory, or an existing one with --skip-merge)")
    f16 = merged.with_suffix(".f16.gguf")

    if not args.skip_merge:
        if not args.base or not args.adapter:
            raise SystemExit("--base and --adapter are required unless --skip-merge")
        merge(args.base, args.adapter, merged)
    if not args.skip_convert:
        convert(args.llama_src, merged, f16)
        # The f16 GGUF is now the source of truth; drop the merged weights *before*
        # quantization so the 4B merge + f16 + Q4 do not all have to fit on a 16 GB dev
        # disk at once. A failed quantize can be retried with --skip-convert.
        shutil.rmtree(merged, ignore_errors=True)
    if not f16.is_file():
        raise SystemExit(f"f16 GGUF missing: {f16}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    quantize(args.quantize, f16, args.out, args.quant)
    if not args.keep_f16:
        f16.unlink(missing_ok=True)

    report = {
        "base": args.base,
        "adapter": str(args.adapter) if args.adapter else None,
        "merged": str(merged),
        "quant": args.quant,
        "output": str(args.out),
        "bytes": args.out.stat().st_size,
        "sha256": sha256(args.out),
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
