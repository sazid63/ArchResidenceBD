/** Dead and live loads and BNBC strength / service combinations (gravity cases). kN, m, kN/m2. */

import { liveLoadKnM2 } from "../rules/bnbc";
import { structurePack } from "../rules/bnbcStructure";
import type { RoomKind } from "../plans/types";
import { UNIT_WEIGHTS } from "./materials";

/** Self-weight of a slab of thickness `mm`, kN/m2. */
export const slabSelfWeightKnM2 = (mm: number): number => (UNIT_WEIGHTS.slabConcrete * mm) / 1000;

/** Dead load of a wall per metre of length: burnt-clay masonry plus cement plaster on both faces (Table 6.2.2), times clear height (m). */
export function wallLineLoadKnM(thicknessMm: number, clearHeightM: number): number {
  const perM2 = thicknessMm * UNIT_WEIGHTS.masonryKnM2PerMm + 2 * UNIT_WEIGHTS.plasterMm * UNIT_WEIGHTS.plasterKnM2PerMm;
  return perM2 * clearHeightM;
}

/** Self-weight of a beam web below the slab, kN/m. */
export const beamSelfWeightKnM = (bMm: number, hMm: number, slabMm: number): number =>
  (UNIT_WEIGHTS.frameConcrete * bMm * Math.max(0, hMm - slabMm)) / 1e6;

/**
 * Sec 2.3.13 live-load reduction factor L / L0 for a member with tributary area `atM2` and element factor `kll`
 * (Eq 6.2.1): 1 below K_LL A_T = 37.16 m2; never below 0.5 for a member carrying one floor, 0.4 for two or more. Loads above 4.8 kN/m2
 * are not reduced (Sec 2.3.13.2).
 */
export function liveReductionFactor(l0KnM2: number, atM2: number, kll: number, floors = 1): number {
  const red = structurePack().liveLoadReduction;
  if (l0KnM2 > red.noReductionAboveKnM2 || kll * atM2 < red.appliesWhenKllAtAtLeastM2) return 1;
  return Math.max(0.25 + 4.57 / Math.sqrt(kll * atM2), floors >= 2 ? red.minFraction.twoOrMoreFloors : red.minFraction.oneFloor);
}

/** BNBC Table 6.2.3 row used for a room (flats: private rooms 2.0, public rooms and corridors 4.8). */
export function liveLoadRowFor(kind: RoomKind): string {
  switch (kind) {
    case "lobby":
    case "corridor":
    case "stair":
    case "lift":
      return "residential-public";
    default:
      return "residential-private";
  }
}

/** Live load for a room kind, kN/m2. Floors that carry partitions not shown add the Sec 2.3.6 allowance elsewhere. */
export const liveLoadForKind = (kind: RoomKind): number => liveLoadKnM2(liveLoadRowFor(kind));

export const roofLiveKnM2 = (): number => liveLoadKnM2("roof-flat");
export const partitionAllowanceKnM2 = (): number => liveLoadKnM2("partition-allowance");

/** BNBC 2020 Sec 2.7.3 gravity strength combinations, as {D, L, Lr} factors. Combination numbers match the pack. */
export const GRAVITY_COMBOS = [
  { n: 1, d: 1.4, l: 0, lr: 0 },
  { n: 2, d: 1.2, l: 1.6, lr: 0.5 },
  { n: 3, d: 1.2, l: 1.0, lr: 1.6 },
] as const;

/** Governing factored load (any consistent unit): the largest of the gravity combinations. */
export function factoredLoad(d: number, l: number, lr = 0): { value: number; combo: number } {
  let best = { value: -Infinity, combo: 0 };
  for (const c of GRAVITY_COMBOS) {
    const v = c.d * d + c.l * l + c.lr * lr;
    if (v > best.value) best = { value: v, combo: c.n };
  }
  return best;
}

/** Sec 2.7.5 serviceability (vertical deflection): D + L. */
export const serviceLoad = (d: number, l: number): number => d + l;
