import type { BuildingModel } from "../model/building";
import type { FrameOptions } from "../structure/frame";
import { computeDesign, type DesignResult } from "./compute";
import type { WorkerReply, WorkerRequest } from "./designWorker";

/**
 * Runs the design pipeline off the UI thread. One shared worker; results are cached per model object and options,
 * so every screen that asks for the same building shares one computation. Without Worker support (tests, some
 * webviews) or if the worker fails to start, it computes inline: same answer, just on the main thread.
 */
interface Pending { resolve: (r: DesignResult) => void; reject: (e: Error) => void; model: BuildingModel; options: FrameOptions }

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();
const cache = new WeakMap<BuildingModel, Map<string, Promise<DesignResult>>>();

function inline(p: Pending): void {
  try { p.resolve(computeDesign(p.model, p.options)); } catch (e) { p.reject(e instanceof Error ? e : new Error(String(e))); }
}

function failAll(): void {
  workerBroken = true;
  worker = null;
  const waiting = [...pending.values()];
  pending.clear();
  for (const p of waiting) inline(p);
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    const w = new Worker(new URL("./designWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result); else p.reject(new Error(e.data.message));
    };
    w.onerror = () => failAll();
    worker = w;
    return w;
  } catch {
    workerBroken = true;
    return null;
  }
}

export function designAsync(model: BuildingModel, options: FrameOptions = {}): Promise<DesignResult> {
  const key = JSON.stringify(options);
  let byKey = cache.get(model);
  if (!byKey) { byKey = new Map(); cache.set(model, byKey); }
  const hit = byKey.get(key);
  if (hit) return hit;
  const p = new Promise<DesignResult>((resolve, reject) => {
    const entry: Pending = { resolve, reject, model, options };
    const w = getWorker();
    if (!w) { inline(entry); return; }
    const id = nextId++;
    pending.set(id, entry);
    try {
      w.postMessage({ id, model, options } satisfies WorkerRequest);
    } catch {
      pending.delete(id);
      inline(entry);
    }
  });
  byKey.set(key, p);
  const map = byKey;
  p.catch(() => map.delete(key));
  return p;
}
