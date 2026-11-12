import { useMemo } from "react";
import { useProject } from "../context/ProjectContext";
import { useDesignAsync } from "../design/useDesignAsync";
import { buildingForProject } from "../model/projectMesh";
import type { StructureResult } from "../structure/analyze";
import type { BbsResult } from "../structure/bbs";
import type { Boq } from "../quantities/takeoff";
import type { BuildingModel } from "../model/building";

/** What the construction screens need, all from the one building model: the structure, the bar schedule and the BOQ. */
export interface DesignData {
  model: BuildingModel;
  structure: StructureResult;
  bbs: BbsResult;
  boq: Boq;
}

export type DesignState =
  | { state: "no_plan" }
  | { state: "no_fit"; reasons: { en: string; bn: string } }
  | { state: "running" }
  | { state: "error"; message: string }
  | { state: "ready"; projectName: string; data: DesignData };

/** The active project's model, structure, bar schedule and BOQ (computed in a worker), or why there are none. */
export function useDesign(): DesignState {
  const { project } = useProject();
  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const model = built && built.ok ? built.model : null;
  const async = useDesignAsync(model);
  if (!project || !built) return { state: "no_plan" };
  if (!built.ok) return { state: "no_fit", reasons: { en: built.reasons.map((r) => r.message.en).join(" "), bn: built.reasons.map((r) => r.message.bn).join(" ") } };
  if (async.status === "error") return { state: "error", message: async.message };
  if (async.status !== "ready" || !model) return { state: "running" };
  return { state: "ready", projectName: project.name, data: { model, ...async.result } };
}
