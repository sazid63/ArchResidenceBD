# S2 — llama.cpp fleet serving + speculative decoding

**Question.** Can the full fleet of plan §5 serve offline from a bundled llama.cpp / llama-swap
runtime on the reference machine (16 GB RAM, 6 GB VRAM) — chat + repair on GPU (one at a time),
embedder + reranker on CPU — and does speculative decoding (Qwen3‑0.6B draft → Qwen3‑4B target)
buy throughput?

**Verdict.** Serving: **yes**. Speculative decoding: **no — rejected with evidence.**
Plain Qwen3‑4B‑Instruct‑2507 Q4_K_M decode serves at **~58 tok/s** using **~4.1 GB VRAM** on the
6 GB floor card. Draft-model speculative decoding measured **~8 % acceptance** — 3.5× slower (draft
on GPU), 11× slower (draft on CPU) — and it changed greedy outputs. The draft model is dropped from
the fleet; the installer shrinks by ~0.6 GB.

**Tested build.** llama.cpp `b11706` (CUDA 12.4 win‑x64 + cudart) · llama-swap `v265` (windows_amd64).
**Machine.** RTX 4050 Laptop (6141 MiB) · driver 581.86 · 15.7 GB RAM · Balanced power plan.

**Method.** Fixed prompt, temperature 0, seed 42, `cache_prompt` off; two warmup generations (lets
CUDA graphs capture) then 5 × 256-token runs per config; median reported. Per-config idle-VRAM
baseline so "model VRAM" is visible (`nvidia-smi`; WDDM accounting is noisy — background surfaces
get evicted under VRAM pressure, so baselines must be taken per run). Acceptance counters captured
two ways: Prometheus `/metrics` deltas and llama-server's own per-request log lines. All traffic on
127.0.0.1 — no external calls during serving.

**Load times.** First-ever load of each GGUF (disk cold, right after download): **37.6 s**.
Every later load (page cache warm): **2.5–3.6 s**.

## 1. Direct llama-server — chat decode configs

| Config | tok/s (median) | range | VRAM (model only) | draft acceptance | greedy output vs baseline |
|---|---|---|---|---|---|
| chat, no spec decoding | **57.98** | 57.79–58.10 | 3708 MB | — | reference `e9c39f81fd4ce19a` |
| draft‑simple, draft **CPU** (`--spec-draft-ngl 0`, n‑max 16) | 5.01 | 4.85–5.16 | 3786 MB | 7.6 % (700/9165), mean len 2.22 | diverged `fde61608…` |
| draft‑simple, draft **GPU** (`--spec-draft-ngl 99`, n‑max 16) | 16.43 | 16.36–16.52 | 5231 MB | 8.3 % (725/8770), mean len 2.32 | diverged `8394ba96…` |
| draft‑simple, draft GPU + `q8_0` KV | 15.76 | 15.68–15.82 | 4717 MB | 7.9 % (710/8990), mean len 2.26 | diverged `2df62749…` |
| `ngram-simple` (no draft model) | 57.45 | 57.39–57.46 | 3709 MB | no spec events | **identical** `e9c39f81…` |

Representative server log line (draft on GPU):
`draft acceptance = 0.08267 ( 145 accepted / 1754 generated), mean len = 2.32`
— i.e. of a 16-token drafting budget, ~2.3 tokens per event survive verification.

**Why spec decoding fails here.** The draft (Qwen3‑0.6B, the pre‑2507 model) is tokenizer-compatible
but *distribution-mismatched* with the 2507 target, and freeform prose is the worst case for draft
acceptance. Even the best draft placement (GPU) costs 3.5× throughput and +1.5 GB VRAM; the CPU
placement (VRAM-free) costs 11× throughput. There is no official 2507-matched 0.6B draft to fix the
mismatch; at 58 tok/s plain decode there is nothing to fix anyway. `ngram-simple` (no draft model,
repetition-based) is measurable, harmless, and a no-op on fresh text — noted for possible reuse on
highly repetitive content (code repair) in P1, not enabled.

**Output identity.** All three draft-enabled configs produced a *different* greedy continuation than
the baseline (divergence mid-sentence after an identical opening; near-tie argmax flips from the
batched verification path are the likely mechanism). The `ngram-simple` config — same harness, zero
spec events — reproduced the baseline **bit-exactly**, proving the harness is deterministic and the
divergence is attributable to the spec machinery. Moot for the product (draft rejected), but
recorded for the quality law: *do not assume bit-identical outputs under any spec-decode scheme.*

## 2. Fleet through llama-swap (final config under test)

Sequence: chat → repair (chat must be evicted) → chat again → embedder/reranker while chat stays
resident. llama-swap auto-assigned worker ports 5800–5803 and gated every request on health checks
(`swap-llama-swap.log`).

| Step | Latency (page-cache warm) | VRAM after |
|---|---|---|
| chat cold through swap | **2.3 s** | 4080 MB (idle 368 MB) |
| repair cold (chat evicted) | 2.8 s | **2676 MB** — exclusivity proven (VRAM fell, not doubled) |
| chat reload | 2.7 s | 4072 MB |
| chat warm through swap (3 runs) | **58.93 tok/s** mean (58.64–59.19) | — router overhead ≈ 0 |
| embedder cold (incl. load) | 1.36 s | 4250 MB (+178 MB context) |
| embedder resident | 0.06 s | — persistent CPU service stays loaded |
| reranker cold (incl. load) | 1.38 s | 4370 MB total after all four services |

Embedding output dimension verified: **1024** (matches the spec expectations). Reranker endpoint
works; scores for the smoke query were ordered (relevant doc first) but very small in magnitude
(`[0.0095, 0.0, 0.0]`) — consistent with Qwen3‑Reranker needing its own instruct template for
calibrated scores; carry to P1 retrieval evaluation (ranking order is what the app consumes).

**VRAM headroom on the floor card.** With the desktop largely evicted, the whole fleet peaks at
**4370 of 6141 MiB**; with a full browser/compositor (~1.5–2 GB) the same fleet lands around
5.6–5.9 GB — it fits, but this is exactly why the CPU-side services must be pinned to CPU.

## 3. Findings that shaped the config (each one cost us a re-run to find)

1. **`--spec-type` defaults to `none` in b11706.** Giving `-md` alone *loads* a draft model but never
   engages it — the first measurement round looked "identical speed with and without draft" until
   the counters showed zero spec events. `--spec-type draft-simple` is required; `--draft-max` was
   renamed to `--spec-draft-n-max`.
2. **"CPU-side" services are not CPU by default.** Without an explicit `-ngl 0`, the new llama.cpp
   auto-fit logic offloaded embed/rerank into VRAM (+1.6 GB, total 5.7/6.1 GB). Pinned with
   `-ngl 0` → +~0.3 GB context overhead only.
3. **Acceptance telemetry exists and is worth capturing**: `--metrics` counters
   (`llamacpp:spec_decode_num_draft_tokens_total` / `…_accepted_tokens_total` / per-position
   histograms), per-request log lines, and `timings.draft_n{,_accepted}` in `/completion`.
4. **WDDM VRAM accounting drifts across a session** (background surfaces evicted under pressure) —
   per-config idle baselines are mandatory in any future bench.
5. **One anomalous early session** measured ~20 tok/s for the same config (three later sessions:
   57–59 tok/s, five runs each). Not reproduced, cause not isolated (suspected laptop GPU power
   state); steady-state numbers are used, and the anomaly is flagged rather than hidden.

## 4. Decisions taken

- **Fleet v1 = `tools/spikes/s2/llama-swap.yaml` as committed**: chat + repair in a swap/exclusive
  GPU group; embed + rerank persistent with `-ngl 0`. llama-swap `-validate` passes (4 models).
- **No speculative decoding; no draft model bundled** → −0.6 GB installer, no extra VRAM.
- **Chat serving config**: Qwen3‑4B‑Instruct‑2507 Q4_K_M, `-ngl 99 -c 8192 -np 1` → ~58 tok/s,
  ~4.1 GB total VRAM with light desktop load on the 6 GB floor.
- **First-run UX note**: the installer/first launch must tolerate a one-time ~38 s cold model load
  (disk-cold); steady-state loads are 2–3 s.

## 5. Carry-forward (P1)

- Reranker quality: use the model's instruct template and prove ranking on the retrieval eval set
  before trusting scores in Prod paths.
- Embed/rerank CPU throughput under batch indexing (real document volumes) — measure in P1.
- Optional, only if latency ever hurts: revisit draft-based spec decoding with a better-matched
  draft (or self-draft from the fine-tuned repair model) for repetitive content; not needed at
  58 tok/s.

## Reproduce

```powershell
# one-time fetch + honest checks (see tools/spikes/s2/README.md), then:
python tools/spikes/s2/bench.py direct   # 5-config spec-decode sweep, ~6 min
python tools/spikes/s2/bench.py swap     # fleet integration through llama-swap, ~2 min
```

Raw evidence (gitignored): `data/downloads/s2/results/` —
`bench_direct.json` (per-run timings, spec counters, content hashes), `direct-*.log` (server logs),
`bench_swap.json`, `swap-llama-swap.log`.
