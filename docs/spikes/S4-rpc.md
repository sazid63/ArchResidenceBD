# S4 — persistent FreeCAD RPC worker ×2, crash-isolated

**Status:** done 2026-10-17 · **Verdict: yes** — two persistent, crash-isolated CAD workers are viable with **zero new dependencies** (stdlib `xmlrpc` inside `freecadcmd`).

**Question.** Can the app keep two warm CAD engine processes alive, send them jobs over a local RPC, and survive a hard crash of either (with auto-restart) while the other keeps serving — and is the cost acceptable on the reference machine?

**Tested build.** FreeCAD `1.1.4` (`1.1.4R20260928`) — `freecadcmd.exe` at `C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe`; bundled Python 3.11. Supervisor runs on the system Python (stdlib only).

## Method

- `tools/spikes/s4/worker.py` runs inside `freecadcmd`: stdlib `SimpleXMLRPCServer` on `127.0.0.1`, **single-threaded on purpose** — FreeCAD is not thread-safe, so jobs serialize *within* a worker; parallelism comes from the two-worker design. Fresh document per job; the process stays warm between jobs.
- `tools/spikes/s4/supervisor.py` is the app stand-in: port check → spawn two workers → deterministic geometry jobs (same spec on both) → concurrency test → crash tests (in-flight `taskkill` of A; self-crash via RPC on B) → restart both → memory + stats → `run.json`.
- Deterministic jobs: n pads (1200×1200×300) + n columns (300×300×2700) fused per pad, `removeSplitter`, volume + bbox returned.

## Results (run 2026-10-17, `data/downloads/s4/run.json`)

| Metric | Measured |
|---|---|
| Worker boot (spawn → first ping), each | **546 ms / 537 ms** |
| Geometry jobs n=1 / 6 / 12 (warm), worker A | 145 / 41 / 104 ms (first call ≈ +100 ms warm-up) |
| Same on worker B | 146 / 39 / 99 ms — **identical volume + bbox across workers** |
| Concurrency: 2× 800 ms job in parallel | wall **815 ms** (serial ≈ 1600 ms) |
| In-flight hard kill (taskkill mid-job) | other worker unaffected; call raises `ConnectionRefusedError` at **~3.0 s** (≈ **2.0 s after** process death) |
| Self-crash via RPC (`os._exit`) | same failure surface; other worker unaffected |
| Restart (respawn → ready → job OK) | **522 ms / 504 ms** |
| Memory per warm worker | **65 MB / 48 MB** (after load) |
| Full supervisor run (incl. 2 crash+restart cycles) | **8.5 s** |

## Gotchas learned

1. **`freecadcmd` sets `__name__` to the file stem** (e.g. `'worker'`), *not* `'__main__'` — `if __name__ == "__main__":` blocks **never execute**. (S3's script ran top-level code, so it never hit this.) Start servers at top level or set `__name__` yourself.
2. A dead worker surfaces to the client as `ConnectionRefusedError` ≈ **2 s after** process death on Windows loopback (consistent across runs) — crash detection via a failing call is *not* instant. The app must not rely on it; see carry-forward.
3. `taskkill /F /T /PID` is a deterministic teardown for both crash tests and cleanup; a `shutdown()` RPC gives the clean path.
4. Stdlib `xmlrpc` works fine inside `freecadcmd`'s Python 3.11 (no new deps) — single-threaded server = correct serializer for FreeCAD.
5. Worker stdout starts with the engine's banner — parse readiness by polling `ping()`, not by scraping stdout.
6. Spawned worker logs were opened with `'wb'` per spawn, so a restart truncates the previous log — use per-PID or append mode when you need cross-restart history (minor; noted for W2.1).
7. `xmlrpc.client`'s `Transport` caches connections per proxy — fine here; if the real pool multiplexes calls per worker from several threads, give each call path its own proxy (or add a thin client layer with explicit timeouts, as done here for ping vs job).

## Carry-forward to W2.1 (real worker pool) and W0.9 (job protocol)

- **Watchdog is the primary crash detector**: ping each worker every ≤1 s; on failure → mark dead, restart (backoff), fail the in-flight job with a clean "engine restarted" error. Measured restart cost (~0.5 s) makes aggressive restart policies cheap.
- **Per-job deadlines** on the client side (the spike used 180 s for jobs; real values per job type in W0.9).
- **Statelessness is a feature**: fresh document per job → a crash loses nothing; results are deterministic across workers (identical volume/bbox verified) — consistent with the §9 quality law.
- Worker API shape to carry: `ping` / `stats` / `job(spec)` / `shutdown`; job payloads are plain dicts (this becomes the frozen job protocol in W0.9).
- Ports: workers bind explicit localhost ports (9875/9876 here); the real pool should pick free ports and pass them to the app (no hardcoded defaults in the product).

## Reproduce

```powershell
python tools\spikes\s4\supervisor.py          # full run incl. crash tests (~9 s)
$env:S4_NO_CRASH='1'; python tools\spikes\s4\supervisor.py   # skip crash tests
```

Outputs: `data/downloads/s4/` (`run.json`, `worker_a.log`, `worker_b.log`; gitignored). Ports 9875/9876 must be free (the supervisor refuses to start otherwise).
