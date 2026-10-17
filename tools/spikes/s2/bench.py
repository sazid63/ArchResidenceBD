"""S2 spike harness: llama.cpp fleet serving measurements (stdlib only).

Reproduces the numbers in docs/spikes/S2-serve.md on the reference machine
(RTX 4050 Laptop, 6 GB VRAM). Run with the system Python from the repo root:

  python tools/spikes/s2/bench.py direct   # llama-server directly: chat +- draft (spec decoding)
  python tools/spikes/s2/bench.py swap     # through llama-swap: cold loads, group policy, CPU services

Method notes (why the numbers are trustworthy):
  * fixed prompt, temperature 0, fixed seed, cache_prompt off
  * two warmup generations (lets CUDA graphs capture), then 5 measured runs
  * mean + median reported; full llama.cpp `timings` objects stored as raw evidence
  * per-config idle VRAM baseline captured, so "model VRAM" = used - idle is visible
  * output-identity check across f16-KV configs proves spec decoding is lossless
  * b11706 fact: `--spec-type` defaults to `none`; `-md` alone does NOT enable
    speculative decoding, so every draft config sets `--spec-type draft-simple`
  * `/metrics` (enabled with --metrics) is diffed across the measured runs to expose
    draft / accepted token counters when the build provides them

Artifacts it needs (see tools/spikes/s2/README.md):
  data/downloads/s2/bin/llama/llama-server.exe
  data/downloads/s2/bin/llama-swap/llama-swap.exe
  data/downloads/s2/models/*.gguf
Raw evidence is written to data/downloads/s2/results/ (gitignored).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import statistics
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
S2 = Path(os.environ.get("S2_ROOT") or (ROOT / "data" / "downloads" / "s2"))
LLAMA_DIR = S2 / "bin" / "llama"
LLAMA_SWAP_DIR = S2 / "bin" / "llama-swap"
MODELS = S2 / "models"
RESULTS = S2 / "results"

CHAT = MODELS / "Qwen3-4B-Instruct-2507-Q4_K_M.gguf"
DRAFT = MODELS / "Qwen3-0.6B-Q8_0.gguf"
REPAIR = MODELS / "qwen2.5-coder-3b-instruct-q4_k_m.gguf"
EMBED = MODELS / "Qwen3-Embedding-0.6B-Q8_0.gguf"
RERANK = MODELS / "Qwen3-Reranker-0.6B.Q8_0.gguf"

BENCH_PROMPT = (
    "You are Archie, a building assistant for Bangladesh. Explain briefly what a plot's "
    "frontage and road width mean for setbacks and FAR, and why a soil test matters before "
    "choosing a foundation type. Answer in about 150 words."
)
N_PREDICT = 256
SEED = 42
RUNS = 5

LLAMA_BASE = ["-ngl", "99", "-c", "8192", "-np", "1", "--no-webui", "--metrics"]
SPEC = ["--spec-type", "draft-simple", "--spec-draft-n-max", "16"]


def http_json(url: str, payload: dict | None = None, timeout: float = 900.0) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_health(port: int, proc: subprocess.Popen | None = None, timeout: float = 300.0) -> float:
    t0 = time.time()
    url = f"http://127.0.0.1:{port}/health"
    while time.time() - t0 < timeout:
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(f"llama-server exited with code {proc.returncode}")
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status == 200:
                    return time.time() - t0
        except Exception:
            pass
        time.sleep(1.0)
    raise TimeoutError(f"llama-server on port {port} did not become healthy in {timeout}s")


def wait_http_any(url: str, timeout: float = 300.0) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2.0) as resp:
                if resp.status < 500:
                    return
        except Exception:
            pass
        time.sleep(1.0)
    raise TimeoutError(f"{url} did not respond")


def vram_mb() -> int | None:
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=30,
        )
        return int(out.stdout.strip().splitlines()[0])
    except Exception:
        return None


def metrics_snapshot(port: int) -> dict[str, float]:
    """Fetch the Prometheus /metrics endpoint and parse name->value (labels kept in the name)."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/metrics", timeout=10) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return {}
    out: dict[str, float] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, _, value = line.rpartition(" ")
        try:
            out[name] = float(value)
        except ValueError:
            continue
    return out


def acceptance_from_delta(delta: dict[str, float]) -> float | None:
    """accepted / drafted, from the exact llama.cpp counter names (labels not allowed)."""
    drafted = delta.get("llamacpp:spec_decode_num_draft_tokens_total")
    accepted = delta.get("llamacpp:spec_decode_num_accepted_tokens_total")
    if drafted and accepted is not None and drafted > 0:
        return round(accepted / drafted, 4)
    return None


def completion(port: int, prompt: str, n_predict: int) -> dict:
    return http_json(
        f"http://127.0.0.1:{port}/completion",
        {"prompt": prompt, "n_predict": n_predict, "temperature": 0, "seed": SEED, "cache_prompt": False},
    )


def chat_completion(port: int, model: str, prompt: str, max_tokens: int) -> tuple[float, dict]:
    t0 = time.time()
    res = http_json(
        f"http://127.0.0.1:{port}/v1/chat/completions",
        {"model": model, "messages": [{"role": "user", "content": prompt}],
         "max_tokens": max_tokens, "temperature": 0, "seed": SEED},
    )
    return time.time() - t0, res


def _log_tail(log_path: Path, lines: int = 15) -> list[str]:
    if not log_path.exists():
        return []
    return log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]


def _accept_lines(log_path: Path) -> list[str]:
    hits = [line.strip()[:200] for line in _log_tail(log_path, 10_000)
            if re.search(r"accept|draft", line, re.IGNORECASE)]
    return hits[-10:]


def _stop(proc: subprocess.Popen) -> None:
    try:
        proc.terminate()
    except OSError:
        pass
    try:
        proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except OSError:
            pass


def bench_direct() -> int:
    RESULTS.mkdir(parents=True, exist_ok=True)
    port = 14701
    configs = {
        "chat-no-draft": ["-m", str(CHAT), *LLAMA_BASE],
        "chat-draft-cpu": ["-m", str(CHAT), "-md", str(DRAFT), *SPEC, "--spec-draft-ngl", "0", *LLAMA_BASE],
        "chat-draft-gpu": ["-m", str(CHAT), "-md", str(DRAFT), *SPEC, "--spec-draft-ngl", "99", *LLAMA_BASE],
        "chat-draft-gpu-kv8": ["-m", str(CHAT), "-md", str(DRAFT), *SPEC, "--spec-draft-ngl", "99",
                               "-ctk", "q8_0", "-ctv", "q8_0", *LLAMA_BASE],
        "chat-ngram-simple": ["-m", str(CHAT), "--spec-type", "ngram-simple", *LLAMA_BASE],
    }
    summary: dict = {"n_predict": N_PREDICT, "runs": RUNS, "seed": SEED}
    for name, args in configs.items():
        time.sleep(3)  # let the previous server release VRAM + background apps settle
        idle_before = vram_mb()
        log_path = RESULTS / f"direct-{name}.log"
        print(f"[direct] starting {name} ...")
        with open(log_path, "w", encoding="utf-8") as log:
            proc = subprocess.Popen(
                [str(LLAMA_DIR / "llama-server.exe"), "--host", "127.0.0.1", "--port", str(port), *args],
                stdout=log, stderr=subprocess.STDOUT,
            )
        try:
            load_s = wait_health(port, proc=proc)
            completion(port, "Hello!", 16)
            completion(port, "List three building materials.", 96)  # graph-capture warmup
            time.sleep(2)
            vram = vram_mb()
            metrics_before = metrics_snapshot(port)
            timings_all, first_text = [], None
            for i in range(RUNS):
                res = completion(port, BENCH_PROMPT, N_PREDICT)
                timings = res.get("timings", {})
                timings_all.append(timings)
                if first_text is None:
                    first_text = res.get("content")
                print(f"[direct] {name} run {i + 1}: {round(timings.get('predicted_per_second', 0.0), 2)} tok/s")
            metrics_after = metrics_snapshot(port)
            delta = {k: round(metrics_after.get(k, 0.0) - metrics_before.get(k, 0.0), 3)
                     for k in sorted(set(metrics_before) | set(metrics_after))
                     if re.search(r"spec|draft|accept", k, re.IGNORECASE)}
            delta = {k: v for k, v in delta.items() if v}
            speeds = [t.get("predicted_per_second", 0.0) for t in timings_all]
            entry: dict = {
                "cmd_args": args,
                "load_s": round(load_s, 1),
                "vram_idle_before_mb": idle_before,
                "vram_used_mb": vram,
                "vram_model_only_mb": (vram - idle_before) if (vram and idle_before) else None,
                "predicted_per_second_runs": [round(s, 2) for s in speeds],
                "predicted_per_second_mean": round(sum(speeds) / len(speeds), 2),
                "predicted_per_second_median": round(statistics.median(speeds), 2),
                "content_sha256_16": hashlib.sha256((first_text or "").encode("utf-8")).hexdigest()[:16],
                "content_preview": (first_text or "")[:200],
                "timings_keys": sorted(timings_all[-1].keys()),
                "timings_runs": timings_all,
                "spec_metrics_delta": delta,
                "acceptance_rate_metrics": acceptance_from_delta(delta),
                "accept_log_lines": _accept_lines(log_path),
            }
            drafted_t = sum(int(t.get("draft_n") or 0) for t in timings_all)
            if drafted_t:
                accepted_t = sum(int(t.get("draft_n_accepted") or 0) for t in timings_all)
                entry["draft_n_total_timings"] = drafted_t
                entry["draft_n_accepted_total_timings"] = accepted_t
                entry["acceptance_rate_timings"] = round(accepted_t / drafted_t, 3)
            summary[name] = entry
            print(f"[direct] {name}: median {entry['predicted_per_second_median']} tok/s, "
                  f"spec delta {delta if delta else '{}'}")
        except (TimeoutError, RuntimeError) as exc:
            summary[name] = {"load_error": str(exc), "cmd_args": args,
                             "vram_idle_before_mb": idle_before, "log_tail": _log_tail(log_path)}
            print(f"[direct] {name} failed to load: {exc}")
        finally:
            _stop(proc)
            time.sleep(3)

    f16_names = ["chat-no-draft", "chat-draft-cpu", "chat-draft-gpu", "chat-ngram-simple"]
    f16_shas = {n: summary[n]["content_sha256_16"] for n in f16_names
                if isinstance(summary.get(n), dict) and "content_sha256_16" in summary[n]}
    summary["f16_kv_content_sha_map"] = f16_shas
    summary["identical_outputs_temp0_seed42"] = len(f16_shas) >= 2 and len(set(f16_shas.values())) == 1
    if "chat-draft-gpu-kv8" in summary and "content_sha256_16" in summary["chat-draft-gpu-kv8"]:
        summary["kv8_output_matches_f16"] = (
            summary["chat-draft-gpu-kv8"]["content_sha256_16"] == summary.get("chat-no-draft", {}).get("content_sha256_16")
        )
    out = RESULTS / "bench_direct.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    for key, value in summary.items():
        if isinstance(value, dict):
            print(f"[direct] {key}: median={value.get('predicted_per_second_median')} "
                  f"vram_model={value.get('vram_model_only_mb')} MB "
                  f"accept={value.get('acceptance_rate_metrics') or value.get('acceptance_rate_timings')} "
                  f"err={value.get('load_error')}")
    print(f"[direct] identical outputs (f16 KV): {summary['identical_outputs_temp0_seed42']}")
    print(f"[direct] raw evidence: {out}")
    return 0


def bench_swap() -> int:
    RESULTS.mkdir(parents=True, exist_ok=True)
    port = 8787
    log_path = RESULTS / "swap-llama-swap.log"
    env = dict(os.environ, S2_ROOT=str(S2))
    print("[swap] starting llama-swap ...")
    log = open(log_path, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [str(LLAMA_SWAP_DIR / "llama-swap.exe"),
         "-config", str(ROOT / "tools" / "spikes" / "s2" / "llama-swap.yaml"),
         "-listen", f"127.0.0.1:{port}"],
        env=env, stdout=log, stderr=subprocess.STDOUT,
    )
    summary: dict = {"idle_vram_mb": vram_mb()}
    try:
        wait_http_any(f"http://127.0.0.1:{port}/v1/models", timeout=60)
        print("[swap] llama-swap is up; measuring cold loads and group policy")

        dt, _ = chat_completion(port, "chat", "Say OK.", 1)
        summary["chat_cold_load_s"] = round(dt, 1)
        summary["vram_after_chat_mb"] = vram_mb()
        print(f"[swap] chat cold: {dt:.1f}s, VRAM {summary['vram_after_chat_mb']} MB")

        dt, _ = chat_completion(port, "repair", "Say OK.", 1)
        summary["repair_cold_load_s"] = round(dt, 1)
        summary["vram_after_repair_mb"] = vram_mb()
        print(f"[swap] repair cold (chat must be evicted): {dt:.1f}s, VRAM {summary['vram_after_repair_mb']} MB")

        dt, _ = chat_completion(port, "chat", "Say OK.", 1)
        summary["chat_reload_s"] = round(dt, 1)
        summary["vram_after_chat_reload_mb"] = vram_mb()
        print(f"[swap] chat reload: {dt:.1f}s, VRAM {summary['vram_after_chat_reload_mb']} MB")

        speeds = []
        for i in range(3):
            _, res = chat_completion(port, "chat", BENCH_PROMPT, N_PREDICT)
            speed = res.get("timings", {}).get("predicted_per_second", 0.0)
            speeds.append(speed)
            print(f"[swap] chat warm through swap run {i + 1}: {round(speed, 2)} tok/s")
        summary["chat_warm_through_swap_tok_s_runs"] = [round(s, 2) for s in speeds]
        summary["chat_warm_through_swap_tok_s_mean"] = round(sum(speeds) / len(speeds), 2)

        t0 = time.time()
        emb = http_json(f"http://127.0.0.1:{port}/v1/embeddings",
                        {"model": "embed", "input": ["soil test report summary", "boundary wall height"]})
        summary["embed_cold_latency_s"] = round(time.time() - t0, 2)
        summary["embed_dim"] = len(emb["data"][0]["embedding"])
        summary["vram_after_embed_mb"] = vram_mb()
        print(f"[swap] embed cold: {summary['embed_cold_latency_s']}s, dim {summary['embed_dim']}, "
              f"VRAM {summary['vram_after_embed_mb']} MB (chat must still be resident)")

        t0 = time.time()
        http_json(f"http://127.0.0.1:{port}/v1/embeddings",
                  {"model": "embed", "input": ["second call: CPU service must stay resident"]})
        summary["embed_resident_latency_s"] = round(time.time() - t0, 2)
        print(f"[swap] embed resident: {summary['embed_resident_latency_s']}s")

        try:
            t0 = time.time()
            rr = http_json(f"http://127.0.0.1:{port}/v1/rerank",
                           {"model": "rerank", "query": "soil bearing capacity",
                            "documents": ["SBC is 65 kPa per the area default.",
                                          "Parapet height is 1.07 m.",
                                          "Piles are driven or bored."]})
            summary["rerank_latency_s"] = round(time.time() - t0, 2)
            summary["rerank_scores"] = [round(r.get("relevance_score", 0.0), 4)
                                        for r in rr.get("results", rr.get("data", []))]
            print(f"[swap] rerank: {summary['rerank_latency_s']}s, scores {summary['rerank_scores']}")
        except Exception as exc:  # keep the spike honest: record the failure
            summary["rerank_error"] = f"{type(exc).__name__}: {exc}"
            print(f"[swap] rerank failed: {summary['rerank_error']}")
        summary["vram_after_rerank_mb"] = vram_mb()
    finally:
        _stop(proc)
        log.close()
        subprocess.run(["taskkill", "/F", "/IM", "llama-server.exe"], capture_output=True)

    summary["llamaswap_log_tail"] = _log_tail(log_path, 20)
    summary["vram_idle_after_mb"] = vram_mb()
    out = RESULTS / "bench_swap.json"
    out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    print(f"[swap] raw evidence: {out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="S2 spike measurements")
    parser.add_argument("mode", choices=["direct", "swap"])
    args = parser.parse_args()
    for path in (LLAMA_DIR / "llama-server.exe", LLAMA_SWAP_DIR / "llama-swap.exe"):
        if not path.exists():
            print(f"missing: {path} - run the fetch steps in tools/spikes/s2/README.md first")
            return 2
    return bench_direct() if args.mode == "direct" else bench_swap()


if __name__ == "__main__":
    raise SystemExit(main())
