# Owner attention — parked items

Standing order (2026-10-17): the P0 queue runs autonomously; anything that
needs the owner (admin installs, accounts, decisions outside the plan) is
parked here and surfaced when the owner is next active. Nothing here blocks
current progress unless marked.

| # | Item | Why it needs the owner | Blocking? | Added |
|---|---|---|---|---|
| 1 | Install **Visual Studio Build Tools** — "Desktop development with C++" workload (~2–4 GB, needs admin) | Tauri's canonical Windows toolchain (`link.exe`) cannot be installed from an unelevated shell; builds currently use the spike-proven GNU fallback | No — builds work today (GNU) and CI runners ship MSVC; do it when convenient so dev-machine builds match production | 2026-10-17 (S1) |
| 2 | **Hugging Face org** + upload credentials | W0.8 will publish model cards / assets to an HF org — creating it requires the owner's account | Not yet — W0.8 starts with local skeletons; upload steps park here when reached | 2026-10-17 (W0.7 board) |
