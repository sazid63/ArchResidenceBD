/**
 * Which parametric layout builds each storey.
 *
 * The chain is: a storey's own choice → the template assigned to its dwellings-per-floor count →
 * the project's typical preset → the default preset for that unit count. Because the assignment is
 * stored per unit count, every floor with the same count resolves to the same 2D drawing (and
 * therefore the same 3D layout).
 */

import { FLOORPLAN_PRESETS } from "./floorplanPresets";
import { fallbackPresetForUnits, getTemplate } from "./floorplanLibrary";
import { assignedTemplate, type FloorplanHost } from "./floorplanSelection";

/** Preset used when only the number of units per floor is known. */
export function presetForUnits(units: number): string {
  if (units <= 1) return "preset-single-luxury";
  if (units === 2) return "preset-dual-3bed";
  if (units === 3) return "preset-triple-rental";
  return "preset-studio-bachelor";
}

/** The preset a curated 2D template builds, or the unit-count default when no template is given. */
export function presetForTemplate(templateId: string | null | undefined, units: number): string {
  const template = getTemplate(templateId);
  if (template && template.unitsPerFloor === Math.round(units)) return template.presetId;
  return presetForUnits(units);
}

/**
 * The preset for storey `s`: that floor's own selection, else the plan assigned to this unit count,
 * else the project's typical plan, else the preset implied by units per floor.
 */
export function resolveFloorPresetId(
  project: FloorplanHost & {
    phases?: Array<{ kind: string; storeyIndex?: number; data?: Record<string, unknown> }>;
  },
  storey: number,
): string {
  const phase = project.phases?.find((p) => p.kind === "floor" && p.storeyIndex === storey);
  const own = phase?.data?.selectedFloorplanPreset as string | undefined;
  if (own && FLOORPLAN_PRESETS.some((p) => p.id === own)) return own;

  const units = project.unitsPerFloor ?? 2;
  const assigned = assignedTemplate(project, units);
  if (assigned) return assigned.presetId;

  const typical = project.typicalPresetId;
  if (typical && FLOORPLAN_PRESETS.some((p) => p.id === typical)) return typical;

  return presetForUnits(units) || fallbackPresetForUnits(units);
}
