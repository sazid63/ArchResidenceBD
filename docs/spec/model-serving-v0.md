# Model serving v0 (W1.11)

**Status:** v0.1.0 · decision record: **ADR-0012**
**Code:** `archres_core.serving` — `fleet.py` (load/validate/render), `launcher.py` (start, readiness, modes)
**Sources of truth:** `spec/models/registry.json` (fleet manifest, W0.9) + `spec/models/fleet.json` (environment & policy)
**Generated (committed):** `spec/models/llama-swap.yaml` · **Evidence:** `docs/spikes/S2-serve.md`
**Plan:** §4 (fixed fleet, one GPU member resident) · §5.9 (runtime) · §8 (task-complete context, quality law)

## Pipeline

```
spec/models/registry.json ─┐
                           ├─► load_fleet() ── validate ─► render_llama_swap() ─► spec/models/llama-swap.yaml
spec/models/fleet.json ────┘                                        │                    (committed, --check in CI)
                                                                    ▼
                                        FleetLauncher.start() ─► llama-swap (loopback, one process)
                                                                    │
                                        GET /v1/models (readiness) ◄┘
                                        preload("interview"|"design") ─► one minimal request per route
```

- The router process is a **bundled component** (plan §3): the app never uses an external Ollama/LM Studio.
- **One GPU model resident at a time** — `chat` and `repair` share the exclusive `gpu-models` group; `embed` and `rerank` are CPU-pinned and persistent (S2).
- **Offline** — loopback listener/host only; install-relative paths; no dev absolute path in the generated file.

## Configuration

`fleet.json` keys (all required unless noted):

| Key | Meaning |
|---|---|
| `schemaVersion` | `0.1.0` |
| `generated` | sibling file name to render (`llama-swap.yaml`) |
| `installRootEnv` | env var holding the install root (`ARCHRES_ROOT`) |
| `router` | `listen`, `healthCheckTimeout`, `logLevel`, `logTimeFormat`, `sendLoadingState` |
| `macros` | `llama-server` and `models` paths, relative to the install root |
| `defaults` | `host` (loopback), `parallel`, `ttl` |
| `groups` | swap-group policy: `swap`, `exclusive`, `persistent`, optional `purpose` |
| `modes` | `{en,bn}` description, `primary` route, ordered `warmup` routes |
| `notes` | optional text |

Model entries are **not** configurable here: id, artifact, sha256, size, device, GPU layers, context, flags and display name all come from the registry. The renderer adds them and writes the pinned hash as a comment so a diff shows exactly which artifact changed.

Validation refuses (with a named error): unknown keys/versions; duplicate or missing roles; unsafe artifact file names or flag tokens; CPU with GPU layers ≠ 0 or GPU with 0; a swap group used but not declared (or declared but unused); exclusive without swap; persistent with swap; non-loopback listener/host; absolute or escaping macro paths; a mode whose primary/warmup is unknown, duplicated, empty or missing its primary; a mode description missing BN or EN.

## Modes

| Mode | Primary | Warmup | Meaning |
|---|---|---|---|
| `interview` | `chat` | chat, embed | The conversation is active; chat stays resident. The rerank seat is **parked** (ADR-0026): the model route returns all-zero scores, so the production reranker is the lexical one and the fleet does not load it. |
| `design` | `repair` | repair, embed, rerank | CAD script build/repair; repair takes the GPU. |

`preload()` sends one minimal request per route **in order**, so the router performs the real load:
`/v1/chat/completions` (`max_tokens: 1`), `/v1/embeddings` (`["warm"]`), `/v1/rerank` (one query/document).
It returns `{mode, primary, warmed: [{route, seconds}], seconds}`. A custom route list is accepted; an unknown mode/route is refused. Modes only re-order warmups — they cannot introduce a model (fixed roster, plan §4).

## Launcher

```python
launcher = FleetLauncher(fleet, binary, root=install_root, base_url="http://127.0.0.1:8787",
                         timeout=180, log_path=...)
launcher.start()          # spawn + wait for /v1/models; failure → LauncherError with log tail
launcher.models()         # route ids the router reports
launcher.preload("interview")
launcher.status()         # running, pid, baseUrl, modes, log
launcher.stop()           # terminate → bounded wait → kill; idempotent
```

- `root` is injected as `ARCHRES_ROOT`; without it (and without a `base_url`) the launcher refuses rather than guess.
- Readiness polls `/v1/models` every 250 ms; a dead process is reported immediately with its exit code and the last log lines.
- Stop is bounded (10 s grace) and safe to call twice; `serve.py --once` is the smoke-test form.
- No shell, no download, no public socket.

## Commands

```powershell
# render / verify (CI uses --check)
uv run --directory core python ../tools/serving/fleet.py
uv run --directory core python ../tools/serving/fleet.py --check
uv run --directory core python ../tools/serving/fleet.py --summary

# dev server against the S2 download layout
$env:ARCHRES_ROOT = "$PWD\data\downloads\s2"
uv run --directory core python ../tools/serving/serve.py --mode interview
uv run --directory core python ../tools/serving/serve.py --mode design --once

# config gate with the bundled binary
data/downloads/s2/bin/llama-swap/llama-swap.exe -config spec/models/llama-swap.yaml -validate
```

## W1.6 chat fine-tune (selected 2026-10-20)

- **Registry:** `archie-chat-v0` (`role: chat`) replaces the stock `archie-chat` entry. The stock artifact `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` remains on disk for rollback but is no longer routed by `llama-swap.yaml`.
- **Artifact:** `data/downloads/s2/models/archie-chat-v0-Q4_K_M.gguf`, **2,497,278,880 bytes**, SHA-256 `bea406a8bafb47c076f4bc2b61ed481cd88c3eff094171af6046a2aad2a54f73`, Q4_K_M. Built locally from the Kaggle adapter by `tools/training/convert_gguf.py`; the Kaggle GGUF step failed only on `torchao` packaging.
- **Candidate:** 43/60 `model.parse` vs stock 32/60; decision 0.867, value 0.706, `accuracy:bn` 0.600, `accuracy:en` 0.833; all recorded floors pass and none moved. Full evidence: `docs/spec/training-data-v0.md`.
- **Fleet gate:** `tools/serving/fleet.py --check` reports 4 routes / 2 modes; `llama-swap -validate` reports 4 models.
- **Live:** BN fine-tune demo 63 writing turns / 61 accept + 2 fallback / 0 open in 2.389 s; EN fine-tune demo 1.991 s. `preload("interview")` warmed in 4.9 s (chat 2.3 s, embed 1.3 s, rerank 1.3 s). A forced fractional-area escalation (`plot-area: সাড়ে ৫ কাঠা`) produced valid JSON `{"value":5.0,"unit":"katha"}` — **5.0 instead of 5.5** — and was accepted only at `confidence: low`; this is a W1.6 teacher-batch quality item, not a serving failure. The parser now escalates fractional quantifiers rather than silently truncating them.

## Verified on the reference machine (real binary, real GGUFs)

| Check | Result |
|---|---|
| `-validate` (v265) | `config is valid: 4 model(s)` |
| Router readiness | 0.57 s to `/v1/models` |
| `preload("interview")` — stock | 9.8 s total (chat 5.2 s, embed 2.3 s, rerank 2.3 s) |
| `preload("interview")` — W1.6 fine-tune | 4.9 s warm (chat 2.3 s, embed 1.3 s, rerank 1.3 s); 8.0 s cold |
| Chat completion through `LlamaSwapClient` — stock | 0.06 s warm, correct reply |
| Chat escalation through the fine-tune | valid JSON returned; fractional 5.5 read as 5.0 at low confidence (see W1.6 note) |
| `preload("design")` | 3.6 s (repair loads; embed stayed warm; the rerank seat is parked since ADR-0026) |
| Shutdown | clean, no orphan processes |

## Deliberately NOT in v0

- **No download/verify** — installer (P5) owns fetching, checksums and progressive packs.
- **No watchdog/restart** — the app shell (P2) owns crash recovery; jobs are stateless (W0.9).
- **No streaming** — one non-streaming completion at a time (matches `LlamaSwapClient`).
- **No VRAM telemetry in-product** — S2 evidence and `nvidia-smi` remain dev tools.
- **No app wiring yet** — W1.12 starts the router and preloads a mode for the chat-loop demo.
