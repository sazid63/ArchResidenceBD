# ADR-0021 — A persistent CAD worker pool behind the frozen job protocol

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W2.1
**Code:** `core/src/archres_core/cad/pool.py` · `cad/worker/worker.py`
**Contract:** `spec/schemas/job-protocol.schema.json`, `docs/spec/interfaces-v0.md` §1 (W0.9)
**Spike:** S4 (`docs/spikes/S4-rpc.md`) · **Spec:** `docs/spec/cad-worker-v0.md`

## Context

Spike S4 proved that two warm FreeCAD workers over stdlib XML-RPC are viable with **no new
dependencies** (boot ~0.54 s, restart ~0.5 s, identical geometry across workers, crash
isolation). It also left a carry-forward list, because a spike is not a product: a watchdog as
the primary crash detector, per-job deadlines, a fresh document per job, the
`ping`/`stats`/`job`/`shutdown` API, free ports at spawn, and per-PID logs.

P2 needs the real thing: the walking skeleton (W2.10) will run foundation, floor, rebar,
sheet and BOQ jobs, and the app must survive an engine crash without losing the session or
hanging on a dead worker. The job protocol is already frozen (W0.9) — the envelope, the kind
roster, the deadline defaults and the error codes are law, and the interfaces doc explicitly
leaves the *pool format* to W2.1.

## Decisions

1. **The pool implements the frozen protocol; it does not redesign it.** `JobRequest` /
   `JobResult`, the kind roster (`geometry.build` · `drawing.sheet` · `rebar.build`), the
   per-kind deadline defaults and the six error codes are used as they are. The only thing W2.1
   adds is the params convention for the one implemented kind: `{"script": "<source>",
   "scriptParams": {...}}` — a source the app (or a model) produced, and the parameters the
   macro may read.
2. **One measurement implementation, two hosts.** The W1.8 launcher is refactored into
   `execute()`; the one-shot harness still writes `result.json`, and the worker returns the same
   payload over the protocol. A measured number therefore has one origin, and a change to the
   measurement cannot drift between the harness and the product.
3. **The measurement travels as an artifact, not as free-form metrics.** The frozen
   `JobResult` has `additionalProperties: false` and no place for the measured geometry, so the
   worker writes `geometry.json` (objects, volumes, bounding boxes, solids, validity, engine
   version) into the job's output directory and returns it as a hashed artifact. The app moves
   and hashes artifacts; the numbers stay inside the bytes the plan's §9 "identical outputs"
   rule can compare.
4. **One macro contract, two hosts.** A candidate macro reads `ARCHRES_JOB_PARAMS` and writes
   into `ARCHRES_JOB_OUTDIR` — the environment the W1.8 harness already uses. The worker writes
   both before running the macro, so the same macro runs unchanged on the one-shot launcher and
   on the persistent worker. The repair loop (W1.7) needs exactly that: a model's macro must run
   without a bespoke path.
5. **The watchdog only judges idle workers.** The engine is single-threaded: a ping to a worker
   that is serving a job is answered only after the job finishes. Treating that as a death
   killed healthy workers mid-job (the first draft turned a hung job into `worker_restarted`
   instead of `timeout`). A ping failure proves death only if the worker was still idle when
   the ping came back; a job that outruns its deadline is the job's contract.
6. **The deadline, not the exception type, separates a timeout from a death.** The XML-RPC
   transport turns a socket timeout into a `ProtocolError`, so the two are indistinguishable by
   type. The pool compares the elapsed time with the job's deadline: `timeout` for a job that
   ran out of time, `worker_restarted` for a worker that refused the connection. Both are
   client-synthesised codes from the frozen set.
7. **A poisoned worker is replaced, not reused.** A job that exceeded its deadline leaves the
   engine mid-execution and the engine cannot be interrupted safely, so the pool kills that
   worker and starts a fresh one. The job is lost (the caller sees `timeout`); nothing is
   silently continued.
8. **The supervisor cannot die silently.** The watchdog thread catches its own exceptions and
   exposes the last one (`pool.watchdog_error`), because a supervisor that stops supervising
   is the failure mode nobody notices.
9. **The unimplemented kinds are declared, not ignored.** `drawing.sheet` and `rebar.build`
   return `invalid_params` with the reason until W2.5 / W2.4 land — the plan's §9 rule (a gap is
   a visible state), applied to the job roster.
10. **The tests do not need an engine; the probe does.** The pool's contract (spawn, dispatch,
    crash, restart, deadline, shutdown) is engine-independent, so the unit tests drive a stub
    worker that speaks the same protocol — deterministic and fast in CI. The real engine is
    proven by `tools/cad/pool_probe.py`, whose numbers are recorded in the spec.

## Consequences

- The app never spawns an engine per job and never embeds one; the CAD engine stays a
  replaceable, restartable, isolated process.
- A crash costs one job, not a session: the job fails with a clean code and the app resubmits
  it against a fresh worker.
- The measured geometry is comparable across workers by hash, which is what makes the
  determinism claim testable rather than asserted.
- Two workers are the default; more is a configuration change, not a design change.
- The pool is a library in `archres_core.cad`, so the app shell can start it when the workspace
  needs geometry (W2.8+); the CAD package under `cad/` stays the in-engine half.
- The pool format is code for now. When the shipped app needs a pool configuration file, that
  is a reviewed artefact in a later package.
