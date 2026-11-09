/**
 * What stands on the roof: the stair cover, the lift machine room and the overhead water tank on the stair cover.
 * The 3D model draws them (toMesh.ts) and the structure loads the roof with them (structure/analyze.ts), from the same numbers.
 */

import { slabSelfWeightKnM2, wallLineLoadKnM } from "../structure/loads";
import type { Rect } from "../plans/types";
import type { BuildingModel } from "./building";

/** The tank is inset from the cover walls by this much on every side, and is this tall. */
export const TANK_INSET_MM = 300;
export const TANK_HEIGHT_MM = 1200;
/** Water 10 kN/m3 and 10 % for the tank shell, with the tank full (conservative). */
export const WATER_KN_M3 = 10;
export const TANK_SHELL_FACTOR = 1.1;
/** Cover and machine-room slabs are 125 mm and carry 1.0 kN/m2 of finishes. */
const COVER_SLAB_MM = 125;
const COVER_FINISH_KN_M2 = 1.0;
/** Lift machine, sheave and the cabin and counterweight reactions at the machine-room slab. Assumption (lift size is not designed). */
export const LIFT_MACHINE_KN = 100;

export interface RoofLoad {
  /** Plan rectangle (plan frame, mm) the load acts over. */
  rect: Rect;
  /** Total load, kN. */
  kn: number;
  /** What it is, for the assumptions list and tests. */
  what: "stair cover" | "lift machine room" | "water tank";
}

const area = (r: Rect) => ((r.x1 - r.x0) * (r.y1 - r.y0)) / 1e6;

/** Self-weight of a cover (4 walls up to its roof slab, the slab and finishes), kN. */
function coverKn(r: Rect, heightMm: number): number {
  const perimeterM = (2 * (r.x1 - r.x0 + (r.y1 - r.y0))) / 1000;
  const wallsKn = perimeterM * wallLineLoadKnM(125, (heightMm - COVER_SLAB_MM) / 1000);
  const slabKn = area(r) * (slabSelfWeightKnM2(COVER_SLAB_MM) + COVER_FINISH_KN_M2);
  return wallsKn + slabKn;
}

/** The weight of the full tank on the stair cover, kN. */
export function tankKn(cover: Rect): number {
  const w = cover.x1 - cover.x0 - 2 * TANK_INSET_MM;
  const l = cover.y1 - cover.y0 - 2 * TANK_INSET_MM;
  if (w <= 0 || l <= 0) return 0;
  return ((w * l * TANK_HEIGHT_MM) / 1e9) * WATER_KN_M3 * TANK_SHELL_FACTOR;
}

/** The loads the roof structure carries besides its own slab, finishes and parapet. */
export function roofLoads(model: BuildingModel): RoofLoad[] {
  const out: RoofLoad[] = [];
  const h = model.roof.coverHeightMm;
  const sc = model.roof.stairCover;
  const lr = model.roof.liftRoom;
  if (sc) {
    out.push({ rect: sc, kn: coverKn(sc, h), what: "stair cover" });
    out.push({ rect: sc, kn: tankKn(sc), what: "water tank" });
  }
  if (lr) out.push({ rect: lr, kn: coverKn(lr, h) + LIFT_MACHINE_KN, what: "lift machine room" });
  return out;
}
