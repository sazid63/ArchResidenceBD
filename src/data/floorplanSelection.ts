/**
 * Template selection rules for 2D floor plans.
 *
 * Plain functions over plain data — no UI and no storage — so the setup screen, the phase planner
 * and the mesh generator all resolve a plan the same way.
 *
 * The consistency rule lives here: a project stores ONE template per dwellings-per-floor count, so
 * every floor with the same unit count is built from the same drawing.
 */

import {
  FloorPlanTemplate,
  categoryForUnits,
  fallbackPresetForUnits,
  getTemplate,
  templatesForUnits,
} from "./floorplanLibrary";

/** The subset of a project the selection rules read. */
export interface FloorplanHost {
  unitsPerFloor?: number;
  /** Dwellings-per-floor → template id. The single source of truth for "which plan". */
  floorplanAssignments?: Record<string, string>;
  /** The template chosen for the project's typical floor (kept for older saved projects). */
  floorplanId?: string;
  /** Parametric preset derived from the chosen template. */
  typicalPresetId?: string;
}

export function assignmentKey(units: number): string {
  return String(Math.max(1, Math.round(units)));
}

/**
 * The template already assigned to this unit count, or null when the project has none yet.
 * A legacy `floorplanId` only counts when its own unit count matches the floor being asked about —
 * otherwise a 2-unit plan could leak onto a 1-unit floor.
 */
export function assignedTemplate(host: FloorplanHost, units: number): FloorPlanTemplate | null {
  const mapped = getTemplate(host.floorplanAssignments?.[assignmentKey(units)]);
  if (mapped) return mapped;
  const legacy = getTemplate(host.floorplanId);
  if (legacy && legacy.unitsPerFloor === Math.round(units)) return legacy;
  return null;
}

/**
 * The drawing the 3D model was actually built from: the assignment when there is one, otherwise the
 * template whose preset matches the preset the mesh resolved to, otherwise the category's first plan.
 * Used by the screens so the 2D image on screen always names the 3D model beside it.
 */
export function templateBehindMesh(
  host: FloorplanHost,
  units: number,
  presetId?: string,
): FloorPlanTemplate | null {
  const assigned = assignedTemplate(host, units);
  if (assigned) return assigned;
  const pool = templatesForUnits(units);
  return pool.find((t) => t.presetId === presetId) ?? pool[0] ?? null;
}

/** Every verified template for this unit count (empty when the category has no drawing). */
export function availableTemplates(units: number): FloorPlanTemplate[] {
  return templatesForUnits(units);
}

/**
 * Random pick from the category that matches `units`, with an optional seed for reproducible tests.
 * Returns null when the category has no verified drawing — callers must handle that explicitly.
 */
export function pickRandomTemplate(
  units: number,
  rng: () => number = Math.random,
  excludeId?: string,
): FloorPlanTemplate | null {
  const candidates = templatesForUnits(units);
  if (candidates.length === 0) return null;
  const pool = candidates.length > 1 && excludeId ? candidates.filter((t) => t.id !== excludeId) : candidates;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[index];
}

/**
 * Manual selection wins when it belongs to the requested category (e.g. a 4-dwelling drawing from
 * the "2+ unit" bucket may serve a 3-dwelling floor); otherwise the project falls back to an
 * automatic random pick from that category, never to a plan from another category.
 */
export function chooseTemplate(
  units: number,
  templateId?: string | null,
  rng: () => number = Math.random,
): { template: FloorPlanTemplate | null; auto: boolean; reason?: string } {
  const category = categoryForUnits(units);
  const manual = getTemplate(templateId);
  if (manual && categoryForUnits(manual.unitsPerFloor) === category) {
    return { template: manual, auto: false };
  }
  if (manual) {
    return {
      template: pickRandomTemplate(units, rng),
      auto: true,
      reason: `${manual.id} is a ${manual.category} plan and cannot fill a ${category} floor`,
    };
  }
  return { template: pickRandomTemplate(units, rng), auto: true };
}

/**
 * The project patch that pins `template` for a unit count (the drawing's own count by default).
 * Every floor with that count then shares the drawing; other counts keep their own assignment.
 */
export function assignmentPatch(
  host: FloorplanHost,
  template: FloorPlanTemplate,
  units: number = template.unitsPerFloor,
): { floorplanAssignments: Record<string, string>; floorplanId: string; typicalPresetId: string } {
  return {
    floorplanAssignments: { ...(host.floorplanAssignments || {}), [assignmentKey(units)]: template.id },
    floorplanId: template.id,
    typicalPresetId: template.presetId,
  };
}

/** The parametric preset that builds this unit count in 3D (falls back when a category is empty). */
export function presetForUnitsCategory(units: number): string {
  const assigned = pickRandomTemplate(units, () => 0);
  return assigned?.presetId ?? fallbackPresetForUnits(units);
}
