# CAD worker pool v0 (W2.1)

**Status:** v0.1.0 — the pool is live against FreeCAD 1.1.4; the walking skeleton (W2.2) is next.
**Code:** `core/src/archres_core/cad/pool.py` (app side) · `cad/worker/worker.py` (in-engine side)
· `core/src/archres_core/cad/launcher.py` (the shared measurement, refactored for reuse)
· `tools/cad/pool_probe.py` (live probe) · `core/tests/test_cad_pool.py` (stub-driven tests)
**Contract:** `spec/schemas/job-protocol.schema.json` + `docs/spec/interfaces-v0.md` §1 (frozen in
W0.9 — W2.1 implements it, it does not redesign it) · **Decision record:** ADR-0021
**Plan:** §5–§6 (per-phase models, pipeline jobs) · §8 (two isolated persistent workers, fresh
document per job, deterministic generators, auto-restart) · §9 (identical outputs, no silent gaps)

## What it is

The pool is the app side of the CAD engine: two or more **persistent** FreeCAD processes, each
on its own free loopback port, serving the frozen job protocol over stdlib XML-RPC. The app
never spawns an engine per job and never embeds one: it submits a `JobRequest`, gets a
`JobResult`, and the engine's own measurement decides what was built.

| Piece | Where | What it does |
|---|---|---|
| Worker | `cad/worker/worker.py` | runs **inside** `freecadcmd`; serves `ping` / `stats` / `job` / `shutdown`; a fresh document per job; single-threaded on purpose |
| Pool | `core/src/archres_core/cad/pool.py` | spawns workers, watchdog, restart, deadlines, dispatch, clean shutdown |
| Measurement | `core/src/archres_core/cad/launcher.py` | the W1.8 launcher, refactored into `execute()` so the worker and the one-shot harness measure with **one** implementation |
| Probe | `tools/cad/pool_probe.py` | the live evidence: two real workers, identical measurements, a crash, a recovery |
| Tests | `core/tests/test_cad_pool.py` | the same contract against a stub worker (no engine, deterministic, in CI) |

## The contract the pool implements

- **Transport:** stdlib XML-RPC on `127.0.0.1`; the pool picks a **free port per worker at
  spawn** and passes it in — no hardcoded ports in the product (S4 carry-forward).
- **Control plane:** `ping()` is the readiness signal (never scraped from stdout), `stats()`
  reports jobs served and the last duration, `shutdown()` acknowledges and exits.
- **Data plane:** `job(JobRequest) → JobResult` with the frozen envelope (`messageType`,
  `protocolVersion` `0.1.0`, `jobId`, `kind`, `params`, `deadlineMs`).
- **Deadlines:** the client always sets `deadlineMs`; the frozen per-kind defaults are
  `geometry.build` 30 s · `drawing.sheet` 120 s · `rebar.build` 60 s. A job that outruns its
  deadline is a **timeout**, and the worker is replaced (the engine cannot be interrupted
  safely, so a stuck job is dropped, never silently continued).
- **Failure codes:** the frozen set. `worker_down` / `worker_restarted` / `timeout` are
  **client-synthesised**; `engine_error` comes from the engine; `invalid_params` from either
  side. A crash in flight fails that job with `worker_restarted` and the app resubmits — jobs
  are stateless, so a crash costs nothing but the job.
- **Kinds:** `geometry.build` is implemented. `drawing.sheet` and `rebar.build` return an
  explicit `invalid_params` ("not implemented by this worker yet") until their engines land —
  a declared state, never a silent drop.
- **The measurement travels as an artifact.** The frozen `JobResult` has no free-form metrics
  field, so the worker writes `geometry.json` (objects, volumes, bounding boxes, solids,
  validity, engine version) into the job's output directory and returns it as a hashed
  artifact; `metrics.durationMs` carries the timing.

### The macro contract (one contract, two hosts)

A candidate macro reads its parameters from `ARCHRES_JOB_PARAMS` and writes artifacts into
`ARCHRES_JOB_OUTDIR` — the same environment contract the W1.8 one-shot harness uses. The
worker writes both before running the macro, so **one macro runs unchanged** on the one-shot
launcher and on the persistent worker. The job's `params` are `{"script": "<source>",
"scriptParams": {...}}`: the source is what the app (or a model) produced, `scriptParams` is
what the macro may read.

## The two rules the pool had to learn

Both were found by the live probe and the stub tests, and both are the S4 carry-forward made
real:

1. **The watchdog only pings an idle worker.** The engine is single-threaded, so a ping to a
   worker that is serving a job is not answered until the job is done — and a job that outruns
   its deadline is the *job's* contract, not the watchdog's. Pinging busy workers killed
   healthy workers mid-job (the first draft did exactly that: a hung job came back as
   `worker_restarted` instead of `timeout`). A ping failure therefore only proves death if the
   worker was still idle when the ping came back.
2. **A timeout is a timeout, not a death.** The XML-RPC transport turns a socket timeout into a
   `ProtocolError`, so the exception type cannot tell the two apart; the **elapsed time**
   against the job's deadline can. The pool reports `timeout` for a job that ran out of time and
   `worker_restarted` for a worker that refused the connection.

## Live probe (2026-10-20, FreeCAD 1.1.4, Windows)

`uv run --directory core python ../tools/cad/pool_probe.py --engine "<freecadcmd>"` — 2 real
workers, the committed W1.8 candidate as the macro, 1 pad × 1 column:

| Measurement | Value |
|---|---|
| Pool up (2 workers spawned, both ready) | **1.047 s** (≈0.1 s per worker uptime at first ping) |
| Job on worker A / worker B | 235.0 ms / 15.0 ms (first call carries the warm-up) |
| Measured geometry, worker A vs B | **identical** — artifact sha256 `fe6c1b4e8e3601bf…` on both |
| Worker killed mid-job | the job fails cleanly: `status: error`, `error.code: worker_restarted`, `artifacts: []` |
| The other worker | **untouched** (same pid, same port) and still serving |
| Recovery | the dead worker is replaced (new pid, new port, `restarts: 1`) and the next job is `ok` |
| Whole probe | 6.36 s, exit 0 |

The identical artifact hash across two independent engine processes is the point of the
package: **the same job produces the same bytes** (plan §9, "outputs identical").

## What is deliberately not here

- **The generators.** W2.1 runs whatever macro it is given; the site/foundation generator is
  W2.2 and the floor generator is W2.3. The committed W1.8 candidate is a *scratch* macro: it
  hard-codes its parameters, and the app must drive it from the spec.
- **The other two job kinds.** `drawing.sheet` (W2.5) and `rebar.build` (W2.4) return
  `invalid_params` until their engines exist.
- **A pool config file.** The interfaces doc leaves the product's pool format to W2.1; this
  version takes it in code (`WorkerConfig`). A committed config file is a later, reviewed
  artefact when the app needs to ship one.
- **The app wiring.** The pool is a library; the Tauri/React shell starts it when P2's
  workspace needs geometry (W2.8+).

## Checks

```powershell
uv run --directory core pytest -q tests/test_cad_pool.py       # stub-driven, no engine
uv run --directory core python ../tools/cad/pool_probe.py --engine "<freecadcmd>"   # live
```
