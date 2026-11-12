import { useEffect, useState } from "react";
import type { BuildingModel } from "../model/building";
import type { FrameOptions } from "../structure/frame";
import { designAsync } from "./client";
import type { DesignResult } from "./compute";

export type AsyncDesign =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ready"; result: DesignResult; stale?: boolean }
  | { status: "error"; message: string };

/** The design for `model` computed in the worker; `idle` when there is no model. Stale answers are dropped; while changed options recompute for the same model, the previous result stays (marked `stale`) so inputs on screen do not unmount. */
export function useDesignAsync(model: BuildingModel | null, options: FrameOptions = {}): AsyncDesign {
  const key = JSON.stringify(options);
  const [state, setState] = useState<{ model: BuildingModel; key: string; value: AsyncDesign } | null>(null);
  useEffect(() => {
    if (!model) return;
    let live = true;
    designAsync(model, options).then(
      (result) => { if (live) setState({ model, key, value: { status: "ready", result } }); },
      (e: unknown) => { if (live) setState({ model, key, value: { status: "error", message: e instanceof Error ? e.message : String(e) } }); },
    );
    return () => { live = false; };
    // `key` is the serialised `options`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, key]);
  if (!model) return { status: "idle" };
  if (state && state.model === model) {
    if (state.key === key) return state.value;
    if (state.value.status === "ready") return { ...state.value, stale: true };
  }
  return { status: "running" };
}
