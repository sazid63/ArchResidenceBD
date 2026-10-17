# Spike S2 — llama.cpp fleet serving + speculative decoding

**Question:** can the full three-row model fleet of plan §5 serve offline from the bundled
llama.cpp/llama-swap runtime on the reference machine (16 GB RAM, 6 GB VRAM), with one GPU
model resident at a time and the embedder/reranker on CPU?

**Verdict (2026-10-17):** the fleet serves — chat ~58 tok/s at ~4.1 GB VRAM on the 6 GB floor;
speculative decoding **rejected** (~8 % acceptance, 3.5–11× slower, changed greedy outputs).
Full evidence: `docs/spikes/S2-serve.md`.

## Pinned artifacts

| Piece | Version | Source (public) |
|---|---|---|
| llama.cpp | `b11706` (CUDA 12.4 win-x64 build + cudart) | github.com/ggml-org/llama.cpp releases |
| llama-swap | `v265` (windows_amd64) | github.com/mostlygeek/llama-swap releases |
| Chat / Archie-Chat base | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | `unsloth/Qwen3-4B-Instruct-2507-GGUF` |
| Draft (spec decoding) | `Qwen3-0.6B-Q8_0.gguf` | `Qwen/Qwen3-0.6B-GGUF` |
| Repair base (P1 placeholder) | `qwen2.5-coder-3b-instruct-q4_k_m.gguf` | `Qwen/Qwen2.5-Coder-3B-Instruct-GGUF` |
| Embedder | `Qwen3-Embedding-0.6B-Q8_0.gguf` | `Qwen/Qwen3-Embedding-0.6B-GGUF` |
| Reranker | `Qwen3-Reranker-0.6B.Q8_0.gguf` | `QuantFactory/Qwen3-Reranker-0.6B-GGUF` |

Everything lands in `data/downloads/s2/` (gitignored — binaries and models never enter git).

## Fetch (from the repo root)

```powershell
$s2 = "data\downloads\s2"
New-Item -ItemType Directory -Force -Path "$s2\bin\llama", "$s2\bin\llama-swap", "$s2\models" | Out-Null

# llama.cpp b11706 (Windows CUDA 12.4): main binaries + CUDA runtime DLLs, same folder
$base = "https://github.com/ggml-org/llama.cpp/releases/download/b11706"
curl.exe -sS -L --fail -o "$s2\llama-bin.zip"    "$base/llama-b11706-bin-win-cuda-12.4-x64.zip"
curl.exe -sS -L --fail -o "$s2\llama-cudart.zip" "$base/cudart-llama-bin-win-cuda-12.4-x64.zip"
Expand-Archive -Force "$s2\llama-bin.zip" "$s2\bin\llama"
Expand-Archive -Force "$s2\llama-cudart.zip" "$s2\bin\llama"

# llama-swap v265
curl.exe -sS -L --fail -o "$s2\llama-swap.zip" "https://github.com/mostlygeek/llama-swap/releases/download/v265/llama-swap_265_windows_amd64.zip"
Expand-Archive -Force "$s2\llama-swap.zip" "$s2\bin\llama-swap"

# Models (single files; ~6 GB total)
$m = "$s2\models"
hf download unsloth/Qwen3-4B-Instruct-2507-GGUF --include "Qwen3-4B-Instruct-2507-Q4_K_M.gguf" --local-dir $m
hf download Qwen/Qwen3-0.6B-GGUF --include "Qwen3-0.6B-Q8_0.gguf" --local-dir $m
hf download Qwen/Qwen2.5-Coder-3B-Instruct-GGUF --include "qwen2.5-coder-3b-instruct-q4_k_m.gguf" --local-dir $m
hf download Qwen/Qwen3-Embedding-0.6B-GGUF --include "Qwen3-Embedding-0.6B-Q8_0.gguf" --local-dir $m
hf download QuantFactory/Qwen3-Reranker-0.6B-GGUF --include "Qwen3-Reranker-0.6B.Q8_0.gguf" --local-dir $m
```

## Run

```powershell
python tools/spikes/s2/bench.py direct   # llama-server: chat ± draft spec-decode sweep + output-identity check
python tools/spikes/s2/bench.py swap     # through llama-swap: cold loads, group policy, CPU services
```

Build notes (learned the hard way in b11706):

- draft configs need `--spec-type draft-simple` — the default is `none`, so `-md` alone loads a
  draft model and never uses it; `--draft-max` is now `--spec-draft-n-max`
- CPU-side services need an explicit `-ngl 0` or llama.cpp auto-fit will put them into VRAM
- `--metrics` exposes draft/acceptance counters (diff `/metrics` around the measured runs)

Raw evidence (logs + JSON) goes to `data/downloads/s2/results/`.
The fleet config under test is `tools/spikes/s2/llama-swap.yaml`
(GPU group swaps chat/repair; CPU-services group is persistent so embed/rerank never unload).
Measured result: `docs/spikes/S2-serve.md` — spec decoding rejected, so the draft model is not
part of the fleet.
