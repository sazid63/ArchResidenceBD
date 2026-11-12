import type { BuildingModel } from "../model/building";
import { buildBoq, type Boq } from "../quantities/takeoff";
import { analyzeStructure, type StructureResult } from "../structure/analyze";
import type { FrameOptions } from "../structure/frame";
import { buildBbs, type BbsResult } from "../structure/bbs";

/** The whole design pipeline for one building model: structure, bar schedule, BOQ. Pure and deterministic. */
export interface DesignResult {
  structure: StructureResult;
  bbs: BbsResult;
  boq: Boq;
}

export function computeDesign(model: BuildingModel, options: FrameOptions = {}): DesignResult {
  const structure = analyzeStructure(model, options);
  const bbs = buildBbs(structure, model);
  return { structure, bbs, boq: buildBoq(model, bbs) };
}
