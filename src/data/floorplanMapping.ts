/**
 * Maps the user's chosen typical floor plan (one of the 60 catalogue entries in
 * bangladeshFloorplans.ts) to the parametric preset the 3D generator can build.
 *
 * The catalogue entries are IMAGES with metadata; they carry no room geometry. Until a plan
 * is traced into a preset, the 3D model follows the closest parametric preset by unit count
 * (and plot size for the narrow-plot variant). The mapping is deliberate and deterministic so a
 * chosen plan always yields the same floors.
 */

import { FLOORPLAN_PRESETS } from "./floorplanPresets";
import type { FloorPlanImage } from "./bangladeshFloorplans";

/** Preset used when only the number of units per floor is known. */
export function presetForUnits(unitsPerFloor: number): string {
  if (unitsPerFloor <= 1) return "preset-single-luxury";
  if (unitsPerFloor === 2) return "preset-dual-3bed";
  if (unitsPerFloor === 3) return "preset-triple-rental";
  return "preset-studio-bachelor";
}

/** Lower bound (katha) of strings like "3.5-4.5 Katha"; null if unparsable. */
function minKatha(range: string): number | null {
  const m = range.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function presetForFloorPlan(plan: FloorPlanImage | null | undefined, fallbackUnits = 2): string {
  const units = plan?.unitsCount ?? fallbackUnits;
  const id = presetForUnits(units);
  // Narrow plots (< 3 katha) with two units use the duct plan, which is built for 25 ft frontage.
  if (units === 2 && plan) {
    const lo = minKatha(plan.plotSizeRange);
    if (lo !== null && lo < 3) return "preset-narrow-duct";
  }
  return FLOORPLAN_PRESETS.some((p) => p.id === id) ? id : FLOORPLAN_PRESETS[0].id;
}

/**
 * The preset for storey `s`: that floor's own selection, else the project's typical plan,
 * else the preset implied by units per floor. Never silently the same default for everything.
 */
export function resolveFloorPresetId(
  project: {
    unitsPerFloor?: number;
    typicalPresetId?: string;
    phases?: Array<{ kind: string; storeyIndex?: number; data?: Record<string, unknown> }>;
  },
  storey: number,
): string {
  const phase = project.phases?.find((p) => p.kind === "floor" && p.storeyIndex === storey);
  const own = phase?.data?.selectedFloorplanPreset as string | undefined;
  const id = own || project.typicalPresetId || presetForUnits(project.unitsPerFloor ?? 2);
  return FLOORPLAN_PRESETS.some((p) => p.id === id) ? id : presetForUnits(project.unitsPerFloor ?? 2);
}
