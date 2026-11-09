/**
 * Slab design by the coefficient method. Panels longer than twice the short side span one way; others share
 * the load between the two directions (Rankine-Grashof) and each direction uses the ACI 318 section 6.5
 * coefficients for its end continuity. Both steps are assumptions (see ASSUMPTIONS "slab-method").
 * Units: kN, m, mm. Utilisation is never clamped.
 */

import { factoredLoad, slabSelfWeightKnM2 } from "./loads";
import { DESIGN, MATERIALS } from "./materials";
import { flexure, shear, slabMinAs, type FlexureResult, type ShearResult } from "./section";

/** Number of ends of a strip that continue into a neighbouring slab: 0, 1 or 2. */
export type Continuity = 0 | 1 | 2;

/**
 * ACI 318 section 6.5.2 approximate moment coefficients as divisors of w L^2.
 * Positive: both ends continuous 16, one end continuous 14, none 8 (simply supported).
 * Negative: at a continuous end 11 (two continuous ends), 9 (one: first interior support, conservative);
 * at a discontinuous end integral with a beam 24.
 */
export function stripMoments(w: number, spanM: number, cont: Continuity): { pos: number; neg: number } {
  const wl2 = w * spanM * spanM;
  if (cont === 2) return { pos: wl2 / 16, neg: wl2 / 11 };
  if (cont === 1) return { pos: wl2 / 14, neg: wl2 / 9 };
  return { pos: wl2 / 8, neg: wl2 / 24 };
}

/** Share of a two-way panel's load that the short direction carries: L^4 / (L^4 + S^4). */
export const shortShare = (shortM: number, longM: number): number => longM ** 4 / (longM ** 4 + shortM ** 4);

/** ACI 318 minimum thickness for deflection control (fy 420), mm. One-way Table 7.3.1.1; two-way section 8.3.1.2 with beams on all sides. */
export function minThicknessMm(shortM: number, longM: number, contShort: Continuity, oneWay: boolean, beamWidthMm: number): number {
  if (oneWay) return (shortM * 1000) / (contShort === 2 ? 28 : contShort === 1 ? 24 : 20);
  const lnLong = longM * 1000 - beamWidthMm;
  const lnShort = shortM * 1000 - beamWidthMm;
  const beta = lnLong / lnShort;
  return Math.max(90, (lnLong * (0.8 + MATERIALS.fyMPa / 1400)) / (36 + 9 * beta));
}

export interface SlabInput {
  /** Centre-to-centre spans between supporting beams, m. */
  shortM: number;
  longM: number;
  /** Continuity of the strips that span the short and the long direction. */
  contShort: Continuity;
  contLong: Continuity;
  /** Dead load other than the slab's own weight (finish), kN/m2. */
  deadExtraKnM2: number;
  /** Floor live load including the partition allowance, kN/m2 (0 on a roof). */
  liveKnM2: number;
  /** Roof live load, kN/m2 (0 on a floor). */
  roofLiveKnM2: number;
  beamWidthMm?: number;
  /** Fix the thickness; otherwise the smallest 25 mm step from 125 mm that passes (or 300 mm when none does). */
  thicknessMm?: number;
}

export interface SlabDirection {
  spanM: number;
  /** Factored load carried in this direction, kN/m2. */
  wuKnM2: number;
  posKnM: number;
  negKnM: number;
  pos: FlexureResult;
  neg: FlexureResult;
  vuKn: number;
  shear: ShearResult;
}

export interface SlabResult {
  type: "one-way" | "two-way";
  thicknessMm: number;
  /** Deflection-control minimum from the code formula, mm. */
  minThicknessMm: number;
  dKnM2: number;
  lKnM2: number;
  wuKnM2: number;
  combo: number;
  short: SlabDirection;
  long: SlabDirection | null;
  /** Worst of flexure, shear and thickness demand/capacity ratios. */
  util: number;
  governs: "flexure" | "shear" | "thickness";
}

function direction(wu: number, spanM: number, cont: Continuity, hMm: number, dMm: number): SlabDirection {
  const mom = stripMoments(wu, spanM, cont);
  const minAs = slabMinAs(1000, hMm);
  const vu = Math.max(wu * (spanM / 2 - dMm / 1000), 0);
  return {
    spanM,
    wuKnM2: wu,
    posKnM: mom.pos,
    negKnM: mom.neg,
    pos: flexure(mom.pos, 1000, dMm, minAs),
    neg: flexure(mom.neg, 1000, dMm, minAs),
    vuKn: vu,
    shear: shear(vu, 1000, dMm),
  };
}

function evaluate(inp: SlabInput, hMm: number): SlabResult {
  const oneWay = inp.longM / inp.shortM > 2;
  const dKnM2 = slabSelfWeightKnM2(hMm) + inp.deadExtraKnM2;
  const { value: wu, combo } = factoredLoad(dKnM2, inp.liveKnM2, inp.roofLiveKnM2);
  const dShort = hMm - DESIGN.coverSlabMm - DESIGN.slabBarMm / 2;
  const dLong = dShort - DESIGN.slabBarMm;
  const alpha = oneWay ? 1 : shortShare(inp.shortM, inp.longM);
  const short = direction(wu * alpha, inp.shortM, inp.contShort, hMm, dShort);
  const long = oneWay ? null : direction(wu * (1 - alpha), inp.longM, inp.contLong, hMm, dLong);
  const dirs = long ? [short, long] : [short];
  const flex = Math.max(...dirs.flatMap((d) => [d.pos.util, d.neg.util]));
  const shr = Math.max(...dirs.map((d) => d.shear.util));
  const minT = minThicknessMm(inp.shortM, inp.longM, inp.contShort, oneWay, inp.beamWidthMm ?? 250);
  const thk = minT / hMm;
  const util = Math.max(flex, shr, thk);
  const governs = util === flex ? "flexure" : util === shr ? "shear" : "thickness";
  return {
    type: oneWay ? "one-way" : "two-way",
    thicknessMm: hMm,
    minThicknessMm: minT,
    dKnM2,
    lKnM2: inp.liveKnM2 + inp.roofLiveKnM2,
    wuKnM2: wu,
    combo,
    short,
    long,
    util,
    governs,
  };
}

export function designSlab(inp: SlabInput): SlabResult {
  if (inp.thicknessMm) return evaluate(inp, inp.thicknessMm);
  let last = evaluate(inp, DESIGN.minSlabThicknessMm);
  for (let h = DESIGN.minSlabThicknessMm; h <= 300; h += 25) {
    last = evaluate(inp, h);
    if (last.util <= 1) return last;
  }
  return last;
}
