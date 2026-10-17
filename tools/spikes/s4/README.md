# S4 spike — persistent FreeCAD RPC worker ×2 (crash-isolated)

**Question:** can the app keep two warm CAD engines alive, talking over local RPC, and survive (with auto-restart) a hard crash of one while the other keeps serving — with zero new dependencies?

**Answer: yes.** Numbers and gotchas: `docs/spikes/S4-rpc.md`.

## Files

- `worker.py` — runs inside `freecadcmd`; stdlib `xmlrpc` server on `127.0.0.1`; **single-threaded on purpose** (FreeCAD is not thread-safe — jobs serialize within a worker; parallelism comes from the two-worker design).
- `supervisor.py` — the app stand-in: spawns both workers, runs deterministic jobs, hard-kills one mid-job, self-crashes the other, restarts both, and measures everything.

## Run (from the repo root)

```powershell
python tools\spikes\s4\supervisor.py
```

Outputs (gitignored): `data/downloads/s4/` — `run.json` + `worker_a.log` / `worker_b.log`.
Env knobs: `S4_PORT_A` / `S4_PORT_B` (default 9875 / 9876), `S4_NO_CRASH=1` (skip crash tests), `S4_FREECADCMD` (engine path override).

## Gotchas (full list in the evidence doc)

- `freecadcmd` runs a script with `__name__` = the file **stem**, not `__main__` — main-guards never fire; start the server at top level.
- A killed worker surfaces to the client as `ConnectionRefusedError` about **2 s after** the process dies (Windows loopback) — treat any `ConnectionError` as "worker dead"; a ≤1 s watchdog ping is the fast, deterministic detector (W2.1).
- Worker stdout order: engine banner → `S4_WORKER_READY …` → one line per job.
