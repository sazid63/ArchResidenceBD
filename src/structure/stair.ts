/**
 * Stair flight as a member: a one-way waist slab spanning between the landing (or floor) beams, per metre of flight width.
 * Common practice, not transcribed from the gazette (stated in the Structure assumptions):
 * - effective span = horizontal run of the flight + 300 mm (half a beam width at each end), simply supported (conservative);
 * - dead load per m2 of plan: waist 24 kN/m3 x t / cos(theta), the triangular steps 24 x riser / 2, finishes 1.5 kN/m2;
 * - live load 4.0 kN/m2 (stairs and exits), factored 1.2 D + 1.6 L;
 * - flexure and shear to Sec 6.3 like the slabs (flexure(), shear()), cover 20 mm, bars 10 to 16 mm at 100 to 200 mm;
 * - the waist grows in 25 mm steps from 150 to 250 mm until flexure and shear pass.
 * Units: kN, kN.m, mm; steel per metre of width.
 */
import { DEFAULT_STAIR, planStair } from "../cad/stairBuilder";
import { pickMatBars, type SlabBarPick } from "./barSelect";
import { flexure, shear, slabMinAs } from "./section";

export const STAIR_CONCRETE_KN_M3 = 24;
export const STAIR_FINISH_KN_M2 = 1.5;
export const STAIR_LIVE_KN_M2 = 4.0;
const COVER = 20;

export interface StairDesign {
  spanMm: number;
  waistMm: number;
  dMm: number;
  /** Factored load per metre of flight width, kN/m (per m2 of plan x 1 m). */
  wuKnM: number;
  muKnM: number;
  vuKn: number;
  asReqMm2PerM: number;
  main: SlabBarPick;
  flexureUtil: number;
  shearUtil: number;
  util: number;
  ok: boolean;
}

export function designStairFlight(floorToFloorMm: number): StairDesign {
  const lay = planStair(floorToFloorMm);
  const run = (lay.risersPerFlight - 1) * DEFAULT_STAIR.treadMm;
  const spanMm = run + 300;
  const L = spanMm / 1000;
  const theta = Math.atan2(lay.riserMm, DEFAULT_STAIR.treadMm);
  let last: StairDesign | null = null;
  for (let waist = 150; waist <= 250; waist += 25) {
    const dead = (STAIR_CONCRETE_KN_M3 * waist) / 1000 / Math.cos(theta) + (STAIR_CONCRETE_KN_M3 * lay.riserMm) / 2000 + STAIR_FINISH_KN_M2;
    const wu = 1.2 * dead + 1.6 * STAIR_LIVE_KN_M2;
    const d = waist - COVER - 6;
    const mu = (wu * L * L) / 8;
    const vu = Math.max(wu * (L / 2 - d / 1000), 0);
    const fl = flexure(mu, 1000, d, slabMinAs(1000, waist));
    const sh = shear(vu, 1000, d);
    const main = pickMatBars(fl.asReqMm2, Math.min(3 * waist, 200), [10, 12, 16]);
    const flexureUtil = Math.max(fl.util, fl.asReqMm2 > 0 && main.areaPerM > 0 ? fl.asReqMm2 / main.areaPerM : 0);
    // slabs carry shear in the concrete alone: the section is adequate when Vu <= phi Vc
    const shearUtil = sh.phiVcKn > 0 ? vu / sh.phiVcKn : Infinity;
    const util = Math.max(flexureUtil, shearUtil);
    last = { spanMm, waistMm: waist, dMm: d, wuKnM: wu, muKnM: mu, vuKn: vu, asReqMm2PerM: fl.asReqMm2, main, flexureUtil, shearUtil, util, ok: util <= 1 && main.fits };
    if (last.ok) return last;
  }
  return last as StairDesign;
}
