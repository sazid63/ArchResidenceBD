# Owner attention — parked items

Standing order (2026-10-17): the P0 queue runs autonomously; anything that
needs the owner (admin installs, accounts, decisions outside the plan) is
parked here and surfaced when the owner is next active. Nothing here blocks
current progress unless marked.

| # | Item | Why it needs the owner | Blocking? | Added |
|---|---|---|---|---|
| 1 | Install **Visual Studio Build Tools** — "Desktop development with C++" workload (~2–4 GB, needs admin) | Tauri's canonical Windows toolchain (`link.exe`) cannot be installed from an unelevated shell; builds currently use the spike-proven GNU fallback | No — builds work today (GNU) and CI runners ship MSVC; do it when convenient so dev-machine builds match production | 2026-10-17 (S1) |
| 2 | **Hugging Face org** + upload credentials | Publishing needs an org under the owner's account. Concrete ask: create a free org (proposed name **`archresbd`** — renameable) + one fine-grained **write token** for uploads; then `hf auth login` on the build machine | No — W0.8 local part done (4 card skeletons + publish recipe `spec/models/publishing.md`); the first real upload is **W4.4** | 2026-10-17 (W0.7 board) · ask sharpened 2026-10-18 (W0.8) |
| 3 | **Kaggle API token** | W1.6's QLoRA run needs the free Kaggle GPU (the dev GPU is 6 GB). The `kaggle` CLI is installed but unauthenticated: no `~/.kaggle/kaggle.json`, no `KAGGLE_USERNAME`/`KAGGLE_KEY`. Owner action: Kaggle → Account → *Create New Token*, save the file to `%USERPROFILE%\.kaggle\kaggle.json` (no admin needed) | **Blocks W1.6 only** — the SFT split, teacher batch and W1.7 are local. Tell the agent when the file is in place | 2026-10-20 (W1.6 prep) |
