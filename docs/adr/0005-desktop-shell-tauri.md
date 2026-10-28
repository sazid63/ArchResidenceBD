# ADR-0005 — Desktop shell: Tauri + WebView2 (React/Vite frontend)

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Owner (standing order for the autonomous build-out run; decision derived from the S1 measurements)

## Context

Plan v1.5 §3 records the shell as "Tauri + React (spike vs Electron in P0)". S1 measured both shells on the reference machine for a hello-window app (`docs/spikes/S1-shell.md`):

- Tauri 2 / WebView2 — 20.71 MB single exe; warm time-to-window 126–253 ms; ~307 MB idle RAM (7 processes); first-ever launch 1352 ms (WebView2 cold init).
- Electron 44.9.0 — 368.5 MB dist folder (electron.exe alone 235.7 MB); warm 355–378 ms; ~285 MB RAM (4 processes).
- Tauri's canonical Windows toolchain (MSVC `link.exe`) is absent on this dev machine; a GNU-toolchain build (rustup GNU target + portable MinGW-w64) was proven end-to-end. CI runners ship MSVC.
- WebView2 is present on supported Windows (10 22H2+ / 11, via Edge).

## Decision

1. **Shell = Tauri 2 with a React/Vite frontend**, rendering in WebView2 on Windows.
2. **One installer** via Tauri's bundler (NSIS) in P1 — one app, offline-first, no admin.
3. **Toolchain:** MSVC is the canonical target (CI + production). This dev machine builds via the GNU fallback (userspace, $0) until the owner installs Build Tools — tracked in `docs/work/OWNER-ATTENTION.md`.
4. **WebView2 dependency accepted**; fixed-runtime bundling remains the documented fallback if we ever meet a machine without it (+~170 MB per install — still well under Electron's footprint).
5. Electron spike artifacts stay out of the product (`data/spikes/`, gitignored); no Electron dependency ships.

## Consequences

- **+** Install ~20 MB before app assets/models; ~2.8× faster warm start; single small exe to brand and sign.
- **+** Rust side available for S6: reparent the engine window into the app frame (Win32 HWND/`SetParent`), hook messages, supervise engine processes — all first-class from the shell.
- **−** RAM is parity, not a win, at hello stage (WebView2 multi-process runtime: ~307 MB vs ~285 MB) — fine on the 16 GB floor; re-measure with the real UI before making claims.
- **−** A second Microsoft-maintained runtime in the stack; patches arrive via OS/Edge updates (cold start until then — splash planned).
- **−** First build needs a native toolchain (MSVC or the GNU fallback) — the price of the 18× smaller payload.
