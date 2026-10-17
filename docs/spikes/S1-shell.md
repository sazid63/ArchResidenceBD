# S1 — Desktop shell: Tauri vs Electron (measured)

**Status:** done 2026-10-17 · **Verdict: Tauri** — 18× smaller payload, ~2.8× faster warm start, WebView2 already present on supported Windows; RAM effectively at parity (Tauri slightly higher at this stage); decision recorded in ADR-0005.

**Question.** Plan v1.5 §3 fixes the shell as "Tauri + React (spike vs Electron in P0)". On the reference machine: how do the two shells compare on install size, time-to-window and idle RAM for a hello-window app?

## Method

- Minimal hello-window app in both shells (static page, no framework): Tauri 2 with a static `frontendDist`; Electron 44.9.0 (`main` + `BrowserWindow`).
- `tools/spikes/s1/measure.ps1` per run: start exe → poll every 40 ms until any process in the tree owns a top-level window (*time-to-window*) → wait 4 s settle → sum the working set of the **whole process tree** (*idle RAM*) → kill tree. Runs alternated between shells; each measured ≥4×.
- Sizes = uncompressed on disk (installer compression comes later with the real app).

## Results

| metric | Tauri (WebView2) | Electron 44.9.0 |
|---|---|---|
| payload, uncompressed | **20.71 MB** single exe | **368.5 MB** dist dir (electron.exe alone 235.7 MB) |
| processes with window open | 7 | 4 |
| time-to-window — first-ever launch | 1352 ms (WebView2 cold init) | 538 ms |
| time-to-window — warm (3 runs) | **253 / 132 / 126 ms** | 378 / 355 / 359 ms |
| idle RAM — warm (tree sum) | 308.1 / 306.0 / 309.0 MB | 285.3 / 284.6 / 284.9 MB |

Machine: Windows 10 Pro 25H2, WebView2 runtime present (Edge). Tauri build: Rust GNU toolchain (see below), default release profile — **not size-tuned** (a tuned hello is typically 5–10 MB; P1 does the size profile).

## Findings

- **Size is decisive**: 20.7 MB vs 368.5 MB uncompressed. One installer, offline-first, and later a bundled model story — Electron's floor is 18× the Tauri binary before any app content.
- **Warm start ~2.8× faster** (median 132 ms vs 359 ms). The one Tauri outlier is hardware/runtime cold init, not a steady state — and the product will ship a branded splash anyway.
- **RAM is NOT a Tauri win at hello stage**: 306–309 MB vs 285–292 MB. WebView2 runs as more processes (7 vs 4) and Microsoft's runtime dominates the baseline. Both are ~0.3 GB — irrelevant against the 16 GB floor; revisit with the real UI before drawing conclusions.
- **Electron's install is friction-free** (just `node_modules`), while Tauri needs a Rust + native toolchain: the first genuine cost of the smaller/rustier path.
- Electron does not otherwise win any measured axis here, and the plan already chose Tauri; the spike exists to falsify, not to re-litigate.

## Toolchain friction (found while measuring)

- Tauri on Windows needs the MSVC toolchain (`link.exe`): **absent on this machine** (not elevated; no Build Tools), so first builds failed at link time.
- Workaround proven end-to-end: rustup GNU target + portable MinGW-w64 (winlibs GCC 16.2.0) in `data/spikes/` — userspace, no admin, $0 → `s1-hello.exe` 20.71 MB builds and runs. Spike-only; production/CI use MSVC (GitHub runners ship it).
- Owner item filed to install VS Build Tools (`docs/work/OWNER-ATTENTION.md`).
- `tauri-build` requires `src-tauri/icons/icon.ico`; a minimal generator is committed (`tools/spikes/s1/make_icon.py`).

## Carry-forward to P1 (skeleton)

- Installer: Tauri bundler → NSIS; decide WebView2 mode (system runtime vs `embedBootstrapper`/`offlineInstaller`) when the offline-first story is finalised.
- Size profile: `strip`, `lto`, `opt-level="s"` on the release profile; measure again with the real frontend.
- Splash window during cold start (covers the first-run WebView2 init).
- Real-UI RAM re-measure before publishing hardware claims beyond the 16 GB floor.

## Reproduce

```
# Tauri (GNU fallback; MSVC once Build Tools are installed)
PATH += <mingw>/mingw64/bin + %USERPROFILE%\.cargo\bin
cd data/spikes/s1/tauri-hello/src-tauri && cargo +stable-x86_64-pc-windows-gnu build --release
# Electron
cd data/spikes/s1/electron-hello && npm install
# Measure (from repo root)
.\tools\spikes\s1\measure.ps1 -Exe .\data\spikes\s1\tauri-hello\src-tauri\target\release\s1-hello.exe -Name tauri
.\tools\spikes\s1\measure.ps1 -Exe .\data\spikes\s1\electron-hello\node_modules\electron\dist\electron.exe -Name electron -ArgumentLine "." -WorkDir .\data\spikes\s1\electron-hello
```
