# ADR-0012 — Model serving v0: registry-driven fleet, generated router config, modes as warmup

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.11 defined by plan Appendix C)

## Context

W1.11 had to turn spike S2's throwaway `llama-swap.yaml` into the product's model-serving layer. S2 proved the runtime and measured it; it did not produce a maintainable config. Four points needed a decision:

1. **Two sources of truth.** `spec/models/registry.json` already pins the fleet (ids, artifacts, hashes, runtime flags, per-model device/GPU layers, swap group). A hand-written router YAML would duplicate filenames, quantisation and flags, and drift silently on the next model update.
2. **Modes.** The plan wants "mode-based preloading (interview keeps Chat resident; design mode preloads Repair)". llama-swap has groups and `ttl`, but no product concept of an interview or design mode. Something has to define what a mode means and prove the member is actually resident.
3. **Readiness.** A router banner is not readiness; S2's scripts polled `/v1/models`. The app needs the same law: an HTTP answer, a bounded wait, and a clean failure with the router's own log tail.
4. **Offline and layout.** The shipped app has its own folder (`ARCHRES_ROOT`), the dev repo has another (`data/downloads/s2`). The config must contain no dev absolute path, no public listener, and no way for a path or flag to escape the install root.

## Decision

1. **The registry is the model manifest; `spec/models/fleet.json` adds only environment and policy.** Fleet config holds: install-root env name, router settings, install-relative macros, host/parallel/ttl defaults, swap-group policy (swap/exclusive/persistent + a human purpose), and modes. It never repeats an artifact name, hash, quantisation, device or flag.
2. **The llama-swap YAML is generated and committed.** `render_llama_swap()` emits `spec/models/llama-swap.yaml` deterministically: one model block per registry role, `displayName.en` as the router-visible name (ADR-0004), artifact + `-ngl`/`-c`/flags from the registry, pinned sha256 in a comment, group membership from `swapGroup`. CI checks freshness; the file is never hand-edited.
3. **Validation enforces the S2 invariants before rendering.** Exactly four roles; one entry per role; safe artifact file names and flag tokens; CPU services pinned `gpuLayers: 0`, GPU models `>= 1`; every registry group declared exactly once and used; exclusive requires swap, persistent forbids swap; loopback listener and host; install-relative macros with no `..`; modes name real routes, warm a non-empty unique list, and include their primary. A config that would break the fleet is refused with a named error, not rendered.
4. **A mode is a warmup order, not a new model.** `interview` warms `chat, embed, rerank`; `design` warms `repair, embed, rerank`. Preloading sends one minimal request per route, in order — chat completion (1 token), embeddings, rerank — so the router really loads the member and the CPU services stay resident. Modes cannot add models; the roster stays fixed (plan §4).
5. **The launcher owns the lifecycle; readiness is HTTP.** `FleetLauncher` spawns the bundled binary with the generated config and the install root in the environment, polls `/v1/models` with a bounded timeout, reports a non-zero exit with the log tail, stops with terminate → bounded wait → kill, and is idempotent. It refuses non-loopback URLs and a missing install root/config.
6. **No model download or hash verification here.** The installer/downloader (P1/P5) owns fetching and verifying artifacts; this layer serves what is present. `-validate` on the real binary is the config's final gate, and the fleet tests pin the rendered file.

## Consequences

- A new model or fine-tune is: new registry entry → regenerate the YAML → review the diff (it shows the hash, file and flags) → tests. No second place to edit.
- Dev verification used the real v265 binary and the S2 GGUFs: config validates (4 models), router ready in 0.57 s, interview mode warm in 9.8 s (chat 5.2 s load, embed 2.3 s, rerank 2.3 s), a chat completion answered in 0.06 s, design mode loaded repair in 3.6 s with the CPU services still warm, clean shutdown and no orphan processes.
- The generated file intentionally carries internal configuration (runtime names, artifact file names) — it is not a user-facing surface.
- Costs accepted: no streaming, no VRAM telemetry in-product, no automatic restart/watchdog (the app shell owns that), and mode warmup is serial by design (one GPU resident).
