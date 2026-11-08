/**
 * From a saved project to the building model and its mesh (ticket M2-5).
 *
 * A project made with the plot-and-plan setup (M2-4) carries `plot` and `planId`; everything below
 * is derived from those. Older saves have neither: they return null here, `generateBuildingMesh` gives
 * them an empty mesh, and PlotShapeCallout asks for the plot shape (no guessing).
 */

import type { MeshDocument } from "../cad/mesh";
import { filterMeshByPhase } from "../cad/meshParts";
import type { BuildingProject } from "../engine/projectState";
import { deriveBuilding, type BuildingInput, type BuildingResult } from "./building";
import { mToMm } from "./planChoices";
import { buildMesh } from "./toMesh";

/** Drop cached meshes (tests and audits). */
export function clearProjectMeshCache(): void {
  cache.clear();
}

/** The model input for a project, or null when the project has no plot shape or plan yet. */
export function buildingInputFor(project: BuildingProject): BuildingInput | null {
  const { plot, planId } = project;
  if (!plot || !planId) return null;
  return {
    plotWidthMm: mToMm(plot.frontageM),
    plotDepthMm: mToMm(plot.depthM),
    storeys: Math.max(1, Math.round(project.stories || 1)),
    planId,
    mirror: !!project.mirror,
  };
}

/** The building for a project; null for a project without plot shape or plan. */
export function buildingForProject(project: BuildingProject): BuildingResult | null {
  const input = buildingInputFor(project);
  return input ? deriveBuilding(input) : null;
}

const MAX_CACHE = 8;
const cache = new Map<string, MeshDocument>();

/**
 * The 3D mesh of a project built from the model, filtered to a phase the way the old generator did
 * ("final" or nothing = everything). Null when the project has no plot shape or plan. When the plan
 * no longer fits the plot the mesh is empty; `buildingForProject` says why.
 */
export function meshForProject(project: BuildingProject, phaseFilter?: string): MeshDocument | null {
  const input = buildingInputFor(project);
  if (!input) return null;
  const key = JSON.stringify(input);
  let full = cache.get(key);
  if (!full) {
    const b = deriveBuilding(input);
    full = b.ok ? buildMesh(b.model) : { schemaVersion: "0.1.0", units: "mm", objects: [] };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, full);
  }
  if (!full.objects.length) return full;
  const filtered = filterMeshByPhase(full.objects, phaseFilter);
  return filtered.length ? { ...full, objects: filtered } : full;
}
