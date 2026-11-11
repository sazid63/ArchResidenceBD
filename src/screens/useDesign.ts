import { useMemo } from "react";
import { useProject } from "../context/ProjectContext";
import { buildingForProject } from "../model/projectMesh";
import { analyzeStructure, type StructureResult } from "../structure/analyze";
import { buildBbs, type BbsResult } from "../structure/bbs";
import { buildBoq, type Boq } from "../quantities/takeoff";
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
  | { state: "ready"; projectName: string; data: DesignData };

/** The active project's model, structure, bar schedule and BOQ, or why there are none. */
export function useDesign(): DesignState {
  const { project } = useProject();
  return useMemo<DesignState>(() => {
    if (!project || !project.plot || !project.planId) return { state: "no_plan" };
    const built = buildingForProject(project);
    if (!built) return { state: "no_plan" };
    if (!built.ok) return { state: "no_fit", reasons: { en: built.reasons.map((r) => r.message.en).join(" "), bn: built.reasons.map((r) => r.message.bn).join(" ") } };
    const structure = analyzeStructure(built.model);
    const bbs = buildBbs(structure, built.model);
    return { state: "ready", projectName: project.name, data: { model: built.model, structure, bbs, boq: buildBoq(built.model, bbs) } };
  }, [project]);
}
