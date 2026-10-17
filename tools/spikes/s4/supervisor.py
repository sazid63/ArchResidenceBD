"""S4 spike supervisor - the "app" stand-in.

Spawns two persistent FreeCAD RPC workers (see worker.py) and answers the S4
question with measurements: two warm workers, crash-isolated, restartable.

Sequence:
  [1] port check (collision guard, refuses to start on a busy port)
  [2] spawn A + B, measure boot (spawn -> first ping)
  [3] deterministic geometry jobs, same spec on both -> results must be identical
  [4] concurrency: same 800 ms busy job on both in parallel vs ~1600 ms serial
  [5] crash isolation, two ways:
        - in-flight hard kill (taskkill) of A mid-job; the client call must raise;
          B keeps serving; A restarts and works again
        - self-crash via RPC (job op=crash) of B; A keeps serving; B restarts
  [6] memory footprint + worker stats
  -> data/downloads/s4/run.json

Run from the repo root:  python tools/spikes/s4/supervisor.py
Env: S4_FREECADCMD (path override), S4_PORT_A / S4_PORT_B, S4_NO_CRASH=1 to skip [5].
Stdlib only.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
import time
import xmlrpc.client
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / "data" / "downloads" / "s4"
OUT.mkdir(parents=True, exist_ok=True)

FREECADCMD = os.environ.get(
    "S4_FREECADCMD", r"C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe"
)
PORTS = {
    "a": int(os.environ.get("S4_PORT_A", "9875")),
    "b": int(os.environ.get("S4_PORT_B", "9876")),
}
SKIP_CRASH = os.environ.get("S4_NO_CRASH") == "1"

TIMES: dict[str, float] = {}
T0 = time.perf_counter()


def stamp(label: str, t_prev: float) -> float:
    t = time.perf_counter()
    TIMES[label] = round((t - t_prev) * 1000.0, 1)
    print(f"  {label:<28} {TIMES[label]:>8.1f} ms")
    return t


def port_free(port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", port))
        return True
    except OSError:
        return False
    finally:
        s.close()


class TimeoutTransport(xmlrpc.client.Transport):
    def __init__(self, timeout: float):
        super().__init__()
        self._timeout = timeout

    def make_connection(self, host):
        conn = super().make_connection(host)
        conn.timeout = self._timeout
        return conn


def make_proxies(port: int):
    uri = f"http://127.0.0.1:{port}/"
    return (
        xmlrpc.client.ServerProxy(uri, transport=TimeoutTransport(2.0), allow_none=True),
        xmlrpc.client.ServerProxy(uri, transport=TimeoutTransport(180.0), allow_none=True),
    )


def spawn(name: str, port: int) -> subprocess.Popen:
    env = os.environ.copy()
    env["S4_PORT"] = str(port)
    env["S4_NAME"] = name
    log = open(OUT / f"worker_{name}.log", "wb")
    return subprocess.Popen(
        [FREECADCMD, str(HERE / "worker.py")],
        stdout=log, stderr=subprocess.STDOUT, env=env, cwd=str(ROOT),
    )


def wait_ready(ping_proxy, timeout_s: float = 90.0, poll_s: float = 0.25):
    t0 = time.perf_counter()
    last_exc = None
    while time.perf_counter() - t0 < timeout_s:
        try:
            info = ping_proxy.ping()
            return info, round((time.perf_counter() - t0) * 1000.0, 1)
        except Exception as exc:  # noqa: BLE001 - polling until ready
            last_exc = exc
            time.sleep(poll_s)
    raise RuntimeError(f"worker not ready in {timeout_s}s: {last_exc!r}")


def memory_mb(pid: int):
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        field = out.split('","')[-1].rstrip('"')
        return round(int(field.split()[0].replace(",", "")) / 1024.0, 1)
    except Exception:  # noqa: BLE001
        return None


def kill_tree(pid: int) -> None:
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                   capture_output=True, timeout=60)


def main() -> int:
    if not Path(FREECADCMD).is_file():
        print(f"freecadcmd not found: {FREECADCMD}\n(set S4_FREECADCMD)")
        return 2
    print(f"engine cmd   {FREECADCMD}")
    print(f"worker       {HERE / 'worker.py'}")
    t = T0

    print("  [1] port check")
    for name, port in PORTS.items():
        if not port_free(port):
            print(f"      port {port} ({name}) is BUSY - refusing to start")
            return 3
        print(f"      port {port} ({name}) free")
    t = stamp("port check", t)

    procs: dict[str, subprocess.Popen] = {}
    ping_p: dict[str, object] = {}
    job_p: dict[str, object] = {}
    info: dict[str, dict] = {}
    boot_ms: dict[str, float] = {}
    results: dict[str, list] = {"a": [], "b": []}
    wall: dict[str, float] = {}
    crash: dict[str, object] = {}

    try:
        print("  [2] spawn two workers")
        spawn_t: dict[str, float] = {}
        for name, port in PORTS.items():
            spawn_t[name] = time.perf_counter()
            procs[name] = spawn(name, port)
        for name, port in PORTS.items():
            ping_p[name], job_p[name] = make_proxies(port)
        for name in PORTS:
            info[name], _ = wait_ready(ping_p[name])
            boot_ms[name] = round((time.perf_counter() - spawn_t[name]) * 1000.0, 1)
            print(f"      {name}: boot {boot_ms[name]} ms  pid {info[name]['pid']}  "
                  f"engine {info[name]['engine']}")
        t = stamp("spawn + ready x2", t)

        print("  [3] deterministic jobs (same spec on both workers)")
        for name in PORTS:
            for n in (1, 6, 12):
                res = job_p[name].job({"op": "boxes", "n": n})
                results[name].append(res)
                print(f"      {name} boxes n={n:<2} {res['ms']:>8} ms  vol {res['volume_mm3']}")
        for i, n in enumerate((1, 6, 12)):
            ra, rb = results["a"][i], results["b"][i]
            assert ra["volume_mm3"] == rb["volume_mm3"] and ra["bbox"] == rb["bbox"], \
                f"cross-worker mismatch for n={n}: {ra} vs {rb}"
        print("      cross-worker results identical (volume + bbox)")
        t = stamp("jobs x6 (2 workers)", t)

        print("  [4] concurrency (busy 800 ms on both, in parallel)")
        def _busy(name):
            t1 = time.perf_counter()
            job_p[name].job({"op": "busy", "ms": 800})
            wall[name] = round((time.perf_counter() - t1) * 1000.0, 1)
        ts = [threading.Thread(target=_busy, args=(n,)) for n in ("a", "b")]
        [x.start() for x in ts]
        [x.join() for x in ts]
        parallel_wall = max(wall.values())
        print(f"      a={wall['a']} ms  b={wall['b']} ms  -> parallel wall "
              f"{parallel_wall} ms (serial would be ~1600)")
        t = stamp("concurrency check", t)

        if not SKIP_CRASH:
            print("  [5] crash isolation - in-flight hard kill of worker A")
            holder: dict[str, object] = {}

            def _inflight():
                t1 = time.perf_counter()
                holder["call_start"] = t1
                try:
                    job_p["a"].job({"op": "busy", "ms": 5000})
                    holder["error"] = None
                except Exception as exc:  # noqa: BLE001
                    holder["error"] = type(exc).__name__
                    holder["raise_ms"] = round((time.perf_counter() - t1) * 1000.0, 1)

            th = threading.Thread(target=_inflight)
            th.start()
            time.sleep(0.8)
            tk = time.perf_counter()
            kill_tree(procs["a"].pid)
            procs["a"].wait(timeout=30)
            kill_done = time.perf_counter()
            kill_ms = round((kill_done - tk) * 1000.0, 1)
            th.join(timeout=30)
            after_kill = None
            if "raise_ms" in holder:
                kill_at_ms = round((kill_done - holder["call_start"]) * 1000.0, 1)
                after_kill = round(holder["raise_ms"] - kill_at_ms, 1)
            b_ok = job_p["b"].job({"op": "boxes", "n": 1})["ok"]
            print(f"      A killed (taskkill {kill_ms} ms) -> call raised "
                  f"{holder.get('error')} at {holder.get('raise_ms')} ms "
                  f"({after_kill} ms after the process died); B job ok: {b_ok}")
            crash["inflight"] = {
                "kill_ms": kill_ms,
                "error": holder.get("error"),
                "raise_after_call_start_ms": holder.get("raise_ms"),
                "raise_after_kill_ms": after_kill,
                "b_ok": b_ok,
            }

            t_restart = time.perf_counter()
            procs["a"] = spawn("a", PORTS["a"])
            ping_p["a"], job_p["a"] = make_proxies(PORTS["a"])
            info["a"], crash["restart_a_ms"] = wait_ready(ping_p["a"])
            ok = job_p["a"].job({"op": "boxes", "n": 1})["ok"]
            print(f"      A restarted in {crash['restart_a_ms']} ms, job ok: {ok}")

            print("  [5b] self-crash via RPC (worker B: job op=crash)")
            try:
                job_p["b"].job({"op": "crash"})
                b_exc = None
            except Exception as exc:  # noqa: BLE001
                b_exc = type(exc).__name__
            procs["b"].wait(timeout=30)
            a_ok = job_p["a"].job({"op": "boxes", "n": 1})["ok"]
            procs["b"] = spawn("b", PORTS["b"])
            ping_p["b"], job_p["b"] = make_proxies(PORTS["b"])
            info["b"], restart_b = wait_ready(ping_p["b"])
            print(f"      B crashed ({b_exc}); A job ok: {a_ok}; B restarted in {restart_b} ms")
            crash["self_crash"] = {"error": b_exc, "a_ok": a_ok, "restart_b_ms": restart_b}
            t = stamp("crash + restart x2", t)

        print("  [6] memory after load")
        mem = {n: memory_mb(procs[n].pid) for n in PORTS}
        print(f"      a={mem['a']} MB   b={mem['b']} MB")
        stats = {n: ping_p[n].stats() for n in PORTS}
        print(f"      stats a={stats['a']}")
        print(f"      stats b={stats['b']}")
        t = stamp("memory + stats", t)

        run = {
            "engine": info["a"]["engine"],
            "freecadcmd": FREECADCMD,
            "ports": PORTS,
            "boot_ms": boot_ms,
            "job_n": [1, 6, 12],
            "job_ms": {n: [r["ms"] for r in results[n]] for n in results},
            "identical_results_across_workers": True,
            "concurrency": {
                "a_ms": wall.get("a"),
                "b_ms": wall.get("b"),
                "parallel_wall_ms": max(wall.values()) if wall else None,
                "serial_estimate_ms": 1600,
            },
            "crash": crash if not SKIP_CRASH else "skipped",
            "memory_mb": mem,
            "stats": stats,
            "times_ms": TIMES,
            "total_ms": round((time.perf_counter() - T0) * 1000.0, 1),
        }
        (OUT / "run.json").write_text(json.dumps(run, indent=2, sort_keys=True), encoding="utf-8")
        print(f"  run.json     {OUT / 'run.json'}")
        print("S4_SPIKE_OK")
        return 0
    finally:
        for _, p in list(procs.items()):
            try:
                if p.poll() is None:
                    kill_tree(p.pid)
            except Exception:  # noqa: BLE001
                pass


if __name__ == "__main__":
    sys.exit(main())
