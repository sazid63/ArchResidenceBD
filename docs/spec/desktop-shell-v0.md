# The desktop shell v0 (W5.1): the app becomes an app

**Status:** v0.1.0 — the shell exists, the core runs as its sidecar, and the channel between
them is proven live.
**Code:** `app/src-tauri/` (the Tauri app + the bridge crate) ·
`core/src/archres_core/bridge.py` (the core's half) · `app/src/ipc/core.ts` (the app's
client) · **Tests:** `core/tests/test_bridge.py` (8) · the bridge crate's own tests (CI) ·
**Decision record:** ADR-0060 · **Plan:** §4 (the shell: Tauri + React), §5.2 (the core is
frozen)

## What it was

The plan's §4 names the shell: **Tauri + React** (spike S1 chose it). The repo carried the
React prototype and the core — and **no shell**, so the app could not be an app.

The two halves needed a channel, and the repo had none: the **job protocol** is the wire
between the app and the *persistent engine workers* (the CAD, spike S4) — not between the
shell and the core.

## What it is now

- **The core is a sidecar; the channel is stdio, one JSON object per line** — the shell
  starts the core and talks to it over its pipes. No socket, no port, no discovery — and the
  UTF-8 law (`archres_core.stdio`) already exists for exactly this.
- **The bridge has its own small envelope** — `{"id", "method", "params"}` in,
  `{"id", "result"}` or `{"id", "error"}` out.
- **The error codes are the job protocol's frozen ones** — `invalid_params`, `internal`,
  `timeout` — so the app speaks one vocabulary, and a test holds the bridge to the schema's
  enum.
- **The bridge carries the app's own loop** — the **agent session** (the same one the demo
  drives): create, resume, state, respond, use_default, skip, finish, commit, history,
  coverage — plus `ping` and `version`.
- **The bridge crate carries no Tauri dependency on purpose** — the channel is testable on
  its own, and the Tauri glue is a thin layer on top of it.
- **An error is an error, not a dead channel** — a malformed line, an unknown method and a
  missing session all come back as an envelope, and the next request still works.
- **The channel speaks UTF-8 in every locale** — the shell writes UTF-8 bytes ✓ and the core
  says so on the way in ✓, because a pipe on Windows is decoded in the *locale code page* ✗:
  a user's machine in cp1252 would otherwise hand the core a mangled Bangla answer ✗ (and
  the reader crashes on it ✗) ✓ — and a test forces that locale so the case is the same on
  every machine ✓ ✓.
- **The core's health is a first-class fact of the app** — the About screen shows it, and in
  a browser (the prototype) it says plainly that there is no core.

## The live probe (2026-10-21)

The shell's actual usage: the core spawned as a sidecar, one JSON object per line over
stdio. Nothing mocked — the probe spawns the real bridge and reads its real answers.

```
1. the ping:
   {"id": "p1", "result": {"name": "archres-core", "pid": 16616, "version": "0.1.0",
    "protocolVersion": "0.1.0", "uptimeS": 0.0}}
2. the version:
   {"id": "p2", "result": {"bridgeVersion": "0.1.0", "protocolVersion": "0.1.0",
    "coreVersion": "0.0.0"}}
3. an unknown method (an error, not a dead channel):
   {"id": "p3", "error": {"code": "invalid_params", "message": "unknown method: 'nope'"}}
4. a session that was never created:
   {"id": "p4", "error": {"code": "invalid_params", "message": "no session 'x'"}}
5. a malformed line:
   {"id": "", "error": {"code": "invalid_params", "message": "not JSON: Expecting value: line 1 column 1 (char 0)"}}
6. the channel is still alive after the malformed line:
   {"id": "p6", "result": {"name": "archres-core", "pid": 16616, "version": "0.1.0",
    "protocolVersion": "0.1.0", "uptimeS": 0.0}}
the bridge exited with 0
```

And the session path — the app's own loop, through the bridge:

```
the create: {"id": "s1", "result": {"sessionId": "s1",
  "prompt": {"done": false, "questionId": "project-name", "flow": "setup",
  "pointer": "/project/name", "type": "text", "ask": "What should we call this project?",
  "why": "Used on drawings, reports and the engineer pack.", "chips": [],
  "progress": {"done": false, "current": "project-name", "answered": 0, "fallback": 0,
  "omitted": 0, "skipped": 0, "open": 0, "openEssential": [], "pending": [],
  "assumptions": []}}, "done": false, "pending": []}}
the respond: {"id": "s3", "result": {"turn": {"decision": "ask_again",
  "turn": {"decision": "ask_again", "question_id": "project-name", "pointer": "/project/name",
  "reply": {"en": "This one can't be assumed — please answer it. What should we call this project?",
  "bn": "এটি অনুমান করা যাবে না — উত্তরটি দরকার। এই প্রকল্পের নাম কী হবে?"}, "value": null,
  "ops": [], "reason": "essential_open", "chips": [], "pending": [], "assumption_id": null,
  "escalation": null}, ...
```

(The answer "I do not know" to an **essential** question is an `ask_again` — the interview
never assumes an essential value — and the Bangla reply comes back through the same
channel, in UTF-8, un-mangled.)

## The bug the locale test found (2026-10-21)

The channel read **stdin** in the locale code page ✗ — the fix was to reconfigure the
*input* as well as the output ✓ (`utf8_stdio((sys.stdin, sys.stdout, sys.stderr))` ✓).
Proved by forcing the locale: the channel without the fix **crashes** on a Bangla answer ✗
(the JSON cannot be read ✗), and with the fix the answer comes back exactly as it was
typed ✓ — `আমার বাড়ি` ✓ ✓.

## The conversation, through the channel (2026-10-22)

The app's main flow is now the **core's** conversation ✓ (ADR-0073 ✓) — probed through the
channel the app uses ✓:

```
the projects: ['Mirpur Duplex (internal test)']
the first question: plot-depth | And the depth, front to back?
the chips: [{'id': '@skip', 'label': "I don't know", 'kind': 'skip'}]
the decision: escalate | the reason: unparseable_number
the reply: উত্তরটি একটু ভালোভাবে বুঝে নিচ্ছি।
the next question: plot-depth
```

Three things that probe shows ✓: the question is the **flow book's** ✓, the chips are the
flow book's ✓ (with their **id** ✓ — the answer goes back as that id ✓, not as the label
✓ ✓), and an answer the engine cannot read comes back as an **escalation** ✓ with the
Bangla reply that says so ✓ — the interview's own honesty ✓ ✓ — and the **Bangla survives
the round trip** ✓ ✓ (the locale fix ✓).

## The project's creation, through the channel (2026-10-22)

The app's *New Project* button used to lead to a form that changed nothing. Now the
**project is the core's** ✓ (ADR-0074 ✓) — the app names it ✓ and picks the template ✓,
and the core writes the spec ✓ and opens the interview ✓ ✓:

```
the project: Mirpur Duplex | ...\projects\mirpur-duplex
the first question: project-name | What should we call this project?
the projects now: [('Mirpur Duplex', 0)]
the same name again: there is already a project at mirpur-duplex
no name: project.create needs a name
```

## What is deliberately not here

- **The Rust build on this machine** — re-measured 2026-10-21: there is **no linker here at
  all** (no `link.exe`, no `gcc`), so the Rust is verified in **CI** instead: the bridge
  crate's **tests**, the **desktop shell's compile** (`cargo check -p archres-app`, on Linux
  where the WebView2 SDK is not needed) and the workspace's **formatting**. The *desktop
  bundle* — the installer, W5.1's remaining half — needs the WebView2 SDK on top of that:
  the owner's item #1. The repo's Rust code is therefore verified in CI, not on this
  machine.
- **The installer itself** — the app, the CAD engine, the Python runtime and the model
  pack, laid down progressively — and the **install folder's licence files**. That is the
  rest of W5.1 (and W5.2 is the installer's download slice).
- **The app's own terms** — the owner's decision (OWNER-ATTENTION #10).

## Checks

```powershell
uv run --directory core pytest -q tests/test_bridge.py
cargo test --locked -p archres-bridge --manifest-path app/src-tauri/Cargo.toml
cargo check --locked -p archres-app --manifest-path app/src-tauri/Cargo.toml
cargo fmt --check --manifest-path app/src-tauri/Cargo.toml
pnpm --dir app typecheck
```

(The three cargo steps need a Rust toolchain with a linker; on this machine they run in CI
— the `shell` job.)
