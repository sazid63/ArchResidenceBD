/// <reference lib="webworker" />
import type { BuildingModel } from "../model/building";
import type { FrameOptions } from "../structure/frame";
import { computeDesign, type DesignResult } from "./compute";

export interface WorkerRequest { id: number; model: BuildingModel; options: FrameOptions }
export type WorkerReply = { id: number; ok: true; result: DesignResult } | { id: number; ok: false; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, model, options } = e.data;
  let reply: WorkerReply;
  try {
    reply = { id, ok: true, result: computeDesign(model, options) };
  } catch (err) {
    reply = { id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  (self as unknown as Worker).postMessage(reply);
};
