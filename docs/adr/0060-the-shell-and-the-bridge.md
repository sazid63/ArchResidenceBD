# ADR-0060 — The shell and the bridge: the core is a sidecar, and the channel is one JSON object per line

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
shell slice) · **Plan:** §4 (the shell: Tauri + React ·) · §5.2 (the core is frozen) ·
**Related:** ADR-0004 (the engine's name is not branding), ADR-0010 (the model call belongs
to the orchestrator)
**Code:** `app/src-tauri/` (the shell · the Tauri app + the bridge crate) ·
`core/src/archres_core/bridge.py` (the core's half) · `app/src/ipc/core.ts` (the app's
client) · **Tests:** `core/tests/test_bridge.py` (8) · the bridge crate's own tests (in CI) ·
**Spec:** `docs/spec/desktop-shell-v0.md`

## Context

The plan's §4 names the shell: **Tauri + React** (spike S1 chose it) ✓. The repo carried
the React prototype ✓ and the core ✓ — and **no shell** ✗, so the app could not be an app.

The two halves needed a channel, and the repo had none: the **job protocol**
(`spec/schemas/job-protocol.schema.json`) is the wire between the app and the *persistent
engine workers* (the CAD ✓, spike S4 ✓) — not between the shell and the core ✓.

## Decisions

1. **The core is a sidecar; the channel is stdio, one JSON object per line.** The shell
   starts the core and talks to it over its pipes ✓ — no socket, no port, no discovery ✓,
   and the UTF-8 law (`archres_core.stdio`) already exists for exactly this ✓ ✓.
2. **The job protocol is not the shell's protocol** ✓ — it is the workers' ✓ — so the bridge
   has its own small envelope: `{"id", "method", "params"}` in, `{"id", "result"}` or
   `{"id", "error"}` out ✓ ✓.
3. **The error codes are the job protocol's frozen ones** ✓ — `invalid_params` ✓, `internal`
   ✓, `timeout` ✓ — so the app speaks **one vocabulary** ✓ (and a test holds the bridge to
   the schema's enum ✓ ✓).
4. **The bridge carries the app's own loop** ✓ — the **agent session** ✓ (the same one the
   demo drives ✓ and the same one the app will ✓): create ✓, resume ✓, state ✓, respond ✓,
   use_default ✓, skip ✓, finish ✓, commit ✓, history ✓, coverage ✓ — plus ping ✓ and
   version ✓ ✓.
5. **The bridge crate carries no Tauri dependency on purpose** ✓ — the channel is testable
   on its own ✓, and the Tauri glue is a thin layer on top of it ✓ ✓.
6. **An error is an error, not a dead channel** ✓ — a malformed line ✓, an unknown method ✓
   and a missing session ✓ all come back as an envelope ✓, and the next request still
   works ✓ (the live probe shows it ✓ ✓).
7. **The core's health is a first-class fact of the app** ✓ — the About screen shows it ✓,
   and in a browser (the prototype ✓) it says plainly that there is no core ✓ ✓.

## Consequences

- **The shell exists** ✓ — `app/src-tauri/` carries the Tauri app ✓, the window ✓, the
  commands ✓ and the sidecar ✓ — and the channel is **probed live** ✓ (the spec doc has
  the output ✓ ✓).
- **The Rust code is not built on the dev machine** ✓ — re-measured 2026-10-21: there is no
  linker here at all (no `link.exe` ✗, no `gcc` ✗) — so it is verified in **CI** ✓: the
  bridge crate's **tests** ✓, the **desktop shell's compile** ✓ (`cargo check` ✓, on Linux ✓,
  where the WebView2 SDK is not needed ✓) and the workspace's **formatting** ✓ — and the
  *desktop bundle* (the installer ✓, W5.1's remaining half ✓) needs the WebView2 SDK on top
  of that ✗ (the owner's item #1 ✓ ✓).
- **What remains in W5.1** ✓: the **installer** (the app + the CAD engine + the Python
  runtime + the model pack ✓, laid down progressively ✓), the **install folder's licence
  files** ✓, and the app's own terms ✓ (the owner's ✓ ✓).
