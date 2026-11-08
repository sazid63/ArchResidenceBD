/**
 * Entry point the screens, BOQ and exports call to get a project's 3D mesh.
 *
 * The preset-driven generator is gone (M2-5): a project with a plot shape and a plan gets its mesh from
 * the building model (`src/model/toMesh.ts`). A project without them gets an empty mesh until the
 * plot shape is entered (see PlotShapeCallout) rather than a guessed building.
 */

import type { BuildingProject } from "../engine/projectState";
import { meshForProject, clearProjectMeshCache } from "../model/projectMesh";
import type { MeshDocument } from "./mesh";
import type { BuildingCustomization } from "../types/customization";

export { filterMeshByPhase, createBoxMesh, createDoor3DMesh, createWindow3DMesh } from "./meshParts";

export function generateBuildingMesh(
  project: BuildingProject,
  phaseFilter?: string, // e.g. "phase-foundation", "phase-ground-floor", "phase-floor-1", or "final"
  _custom?: BuildingCustomization, // section sizes are placeholders until the structural engine sizes them (M4)
): MeshDocument {
  return meshForProject(project, phaseFilter) ?? { schemaVersion: "0.1.0", units: "mm", objects: [] };
}

// Re-export types from shared module for backward compatibility
export type {
  BuildingCustomization,
  AccessibilitySettings,
  SustainabilitySettings,
  FireSafetySettings,
  ValueEngineeringSettings,
  ConstructionMgmtSettings,
} from "../types/customization";

// Re-export defaults for backward compatibility
export {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";

/** Drop cached meshes (tests and audits). */
export const clearMeshCache = clearProjectMeshCache;
