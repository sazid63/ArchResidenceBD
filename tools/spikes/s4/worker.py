"""S4 spike - persistent FreeCAD RPC worker (stdlib xmlrpc, no new deps).

Runs inside `freecadcmd` as a long-lived process. A supervisor (the app stand-in)
talks to it over XML-RPC on 127.0.0.1. Single-threaded on purpose - FreeCAD is not
thread-safe, so jobs serialize *within* a worker; parallelism comes from running two
workers (that is the S4 design). Fresh document per job; the process stays warm.

Ops:
  ping()                      -> identity + uptime
  stats()                     -> job counter + last latency
  job({"op":"boxes", "n":N})  -> deterministic geometry job (pads+columns), volume/bbox
  job({"op":"busy", "ms":N})  -> sleep N ms (concurrency / in-flight-crash tests)
  job({"op":"crash"})         -> deliberate os._exit(42) (crash-isolation test)
  shutdown()                  -> clean exit

Env: S4_PORT (required), S4_NAME (label, default "worker").
Prints one S4_WORKER_READY line, then one log line per job.
"""

from __future__ import annotations

import os
import time
from xmlrpc.server import SimpleXMLRPCServer

import FreeCAD as App
import Part

PORT = int(os.environ.get("S4_PORT", "0"))
NAME = os.environ.get("S4_NAME", "worker")
ENGINE = ".".join(App.Version()[:3])
T0 = time.perf_counter()
JOBS = 0
LAST_MS: float | None = None
_doc = None


def _fresh_doc():
    global _doc
    if _doc is not None:
        App.closeDocument(_doc.Name)
    _doc = App.newDocument(f"S4_{NAME}")


def ping():
    return {
        "name": NAME,
        "pid": os.getpid(),
        "engine": ENGINE,
        "port": PORT,
        "uptime_s": round(time.perf_counter() - T0, 1),
    }


def stats():
    return {
        "name": NAME,
        "pid": os.getpid(),
        "jobs": JOBS,
        "last_ms": LAST_MS,
        "uptime_s": round(time.perf_counter() - T0, 1),
    }


def job(spec):
    global JOBS, LAST_MS
    t = time.perf_counter()
    op = spec.get("op", "boxes")

    if op == "crash":
        os._exit(42)  # hard crash on purpose: supervisor must survive + restart us

    if op == "busy":
        ms = float(spec.get("ms", 500))
        print(f"job start busy {ms:.0f}ms pid={os.getpid()}", flush=True)
        time.sleep(ms / 1000.0)
        JOBS += 1
        LAST_MS = round((time.perf_counter() - t) * 1000.0, 1)
        print(f"job busy {ms:.0f}ms pid={os.getpid()}", flush=True)
        return {"ok": True, "op": op, "ms": LAST_MS, "pid": os.getpid()}

    if op == "boxes":
        n = int(spec.get("n", 1))
        _fresh_doc()
        fused = None
        for i in range(n):
            pad = Part.makeBox(1200, 1200, 300, App.Vector(i * 1400.0, 0, 0))
            col = Part.makeBox(300, 300, 2700, App.Vector(i * 1400.0 + 450, 450, 300))
            piece = pad.fuse(col)
            fused = piece if fused is None else fused.fuse(piece)
        fused = fused.removeSplitter()
        obj = _doc.addObject("Part::Feature", "Structure")
        obj.Shape = fused
        _doc.recompute()
        bb = obj.Shape.BoundBox
        JOBS += 1
        LAST_MS = round((time.perf_counter() - t) * 1000.0, 1)
        print(f"job boxes n={n} {LAST_MS}ms pid={os.getpid()}", flush=True)
        return {
            "ok": True,
            "op": op,
            "n": n,
            "volume_mm3": round(obj.Shape.Volume, 1),
            "bbox": [round(bb.XMin, 1), round(bb.YMin, 1), round(bb.ZMin, 1),
                     round(bb.XMax, 1), round(bb.YMax, 1), round(bb.ZMax, 1)],
            "ms": LAST_MS,
            "pid": os.getpid(),
        }

    raise ValueError(f"unknown op: {op!r}")


def shutdown():
    import threading

    def _die():
        time.sleep(0.3)  # let the reply flush before we go
        os._exit(0)

    threading.Thread(target=_die, daemon=True).start()
    print("shutdown requested", flush=True)
    return "bye"


# NOTE: freecadcmd runs this file with __name__ == the file stem ("worker"), NOT
# "__main__" - so no main-guard here; the server starts at top level (S4 gotcha).
server = SimpleXMLRPCServer(("127.0.0.1", PORT), logRequests=False, allow_none=True)
for fn in (ping, stats, job, shutdown):
    server.register_function(fn)
print(f"S4_WORKER_READY {NAME} port={PORT} pid={os.getpid()} engine={ENGINE}", flush=True)
server.serve_forever()
