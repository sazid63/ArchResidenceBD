# Owner attention — parked items

Standing order (2026-10-17): the P0 queue runs autonomously; anything that
needs the owner (admin installs, accounts, decisions outside the plan) is
parked here and surfaced when the owner is next active. Nothing here blocks
current progress unless marked.

| # | Item | Why it needs the owner | Blocking? | Added |
|---|---|---|---|---|
| 1 | Install **Visual Studio Build Tools** — "Desktop development with C++" workload (~2–4 GB, needs admin) | Tauri's canonical Windows toolchain (`link.exe`) cannot be installed from an unelevated shell; builds currently use the spike-proven GNU fallback | No — builds work today (GNU) and CI runners ship MSVC; do it when convenient so dev-machine builds match production | 2026-10-17 (S1) |
| 2 | **Hugging Face org** + upload credentials | Publishing needs an org under the owner's account. Concrete ask: create a free org (proposed name **`archresbd`** — renameable) + one fine-grained **write token** for uploads; then `hf auth login` on the build machine | No — W0.8 local part done (4 card skeletons + publish recipe `spec/models/publishing.md`); the first real upload is **W4.4** | 2026-10-17 (W0.7 board) · ask sharpened 2026-10-18 (W0.8) |
| 3 | ~~Kaggle API token~~ — **resolved 2026-10-20** | The CLI is authenticated via **OAuth** as `sajidhossain004` (`kaggle config view`: `auth_method: OAUTH`, no legacy `kaggle.json` needed); kernels and datasets API calls succeed. | **No longer blocking** — W1.6/W1.7 training runs can use the free Kaggle GPU | 2026-10-20 (W1.6 prep) · closed 2026-10-20 |
| 4 | **Kaggle GPU slot is occupied** | The account's batch GPU sessions are fully used (2/2) by `sajidhossain004/qwen3-5-27b-server` (running since 2026-10-20 01:37, not part of this repository's queue). It was still `RUNNING` at 09:14, 7 h 37 min after launch, so the 7 h self-cap did not free the slots. W1.6 therefore ran on the ADR-0019 local fallback (RTX 4050 6 GB). No other session was stopped. | **Blocks the Kaggle venue and the W1.7 training run only** — W1.6 no longer waits on it. The local fallback is the active path; if the 27B kernel is yours and it is finished/idle, stop it to free the Kaggle venue. | 2026-10-20 (W1.6 run) · updated 09:14 |
