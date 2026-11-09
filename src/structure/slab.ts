/**
 * Slab design. Two-way panels (long / short centre span <= 2) use the BNBC 2020 coefficient method, Sec 6.5.8.3
 * (Tables 6.6.8-6.6.11): negative moments from the total factored load, positive moments from the dead and live
 * parts separately, and the load shares w_a / w_b for slab shear and for the load on the supporting beams.
 * Longer panels span one way with the Sec 6.1.4.3 approximate moments. Units: kN, m, mm. Utilisation is never clamped.
 */

import { coefficient, structurePack, twoWayCase } from "../rules/bnbcStructure";
import { GRAVITY_COMBOS, slabSelfWeightKnM2 } from "./loads";
import { DESIGN, MATERIALS } from "./materials";
import { flexure, shear, slabMinAs, type FlexureResult, type ShearResult } from "./section";

/** Number of the two edges of one kind (long or short) that continue into a neighbouring slab: 0, 1 or 2. */
export type Continuity = 0 | 1 | 2;

export interface SlabInput {
  /** Centre-to-centre spans between supporting beams, m. */
  shortM: number;
  longM: number;
  /** Continuous edges among the two long edges (length = longM, they bound the short span) and the two short edges. */
  contLongEdges: Continuity;
  contShortEdges: Continuity;
  /** Dead load other than the slab's own weight (finishes), kN/m2. */
  deadExtraKnM2: number;
  /** Floor live load from Table 6.2.3 and the partition allowance (Sec 2.3.6), kN/m2 (both 0 on a roof). */
  liveBaseKnM2: number;
  livePartitionKnM2: number;
  /** Roof live load, kN/m2 (0 on a floor). */
  roofLiveKnM2: number;
  /** Mean beam-to-slab stiffness ratio alpha_fm of the four edge beams (Sec 6.2.5.3.3); default 2.1 (beams stiff, Eq 6.6.6). */
  alphaFm?: number;
  /** True when a discontinuous edge has an edge beam with alpha_f < 0.8: thickness +10 % (Sec 6.2.5.3.3 d). */
  weakEdgeBeam?: boolean;
  beamWidthMm?: number;
  /** Fix the thickness; otherwise the smallest 25 mm step from 125 mm that passes (or 300 mm when none does). */
  thicknessMm?: number;
}

export interface SlabDirection {
  spanM: number;
  /** Largest factored positive and negative moments per metre width, kN.m/m. */
  posKnM: number;
  negKnM: number;
  pos: FlexureResult;
  neg: FlexureResult;
  vuKn: number;
  shear: ShearResult;
}

export interface SlabResult {
  type: "one-way" | "two-way";
  /** Table case 1..9 (two-way only, 0 for one-way) and the span ratio m = la / lb. */
  caseNo: number;
  m: number;
  thicknessMm: number;
  /** Deflection-control minimum thickness, mm. */
  minThicknessMm: number;
  dKnM2: number;
  /** Unfactored live parts, kN/m2. */
  lBaseKnM2: number;
  lPartitionKnM2: number;
  lRoofKnM2: number;
  /** Largest factored total load, kN/m2, and the gravity combination that gave it. */
  wuKnM2: number;
  combo: number;
  /** Share of the load carried in the short (a) and long (b) direction (Table 6.6.11; 1 and 0 one-way). */
  shareShort: number;
  shareLong: number;
  short: SlabDirection;
  long: SlabDirection | null;
  util: number;
  governs: "flexure" | "shear" | "thickness";
}

const DISCONTINUOUS_NEG_FRACTION = 1 / 3; // assumption, see gap-discontinuous-edge-negative in the pack

/** Sec 6.1.4.3 approximate moments for a one-way strip of span `spanM`, divisors of w L^2. */
function oneWayMoments(w: number, spanM: number, cont: Continuity): { pos: number; neg: number } {
  const d = structurePack().approxCoefficients.momentDivisors;
  const wl2 = w * spanM * spanM;
  const slabSpanShort = spanM <= 3.048;
  if (cont === 2) return { pos: wl2 / d.positiveInterior, neg: wl2 / (slabSpanShort ? d.negativeAllSupportsSlabSpanUpTo3048mm : d.negativeOtherInteriorFaces) };
  if (cont === 1) return { pos: wl2 / d.positiveEndSpanDiscontinuousEndIntegral, neg: wl2 / (slabSpanShort ? d.negativeAllSupportsSlabSpanUpTo3048mm : d.negativeFirstInteriorSupportTwoSpans) };
  return { pos: wl2 / 8, neg: wl2 / d.negativeExteriorFaceSpandrelBeam };
}

/** Minimum thickness for deflection control, mm (Table 6.6.1 one-way; Eq 6.6.5 / 6.6.6 two-way). */
export function minThicknessMm(inp: SlabInput, oneWay: boolean): number {
  const bw = inp.beamWidthMm ?? 250;
  if (oneWay) {
    const div = structurePack().minThickness.table_6_6_1.solidOneWaySlab.divisors; // simply supported, one end, both ends
    return (inp.shortM * 1000) / div[inp.contLongEdges];
  }
  const lnLong = inp.longM * 1000 - bw;
  const beta = lnLong / (inp.shortM * 1000 - bw);
  const alpha = inp.alphaFm ?? 2.1;
  const fy = MATERIALS.fyMPa;
  let h = alpha > 2 ? (lnLong * (0.8 + fy / 1400)) / (36 + 9 * beta) : (lnLong * (0.8 + fy / 1400)) / (36 + 5 * beta * (Math.max(alpha, 0.2) - 0.2));
  h = Math.max(h, alpha > 2 ? 90 : 125);
  if (inp.weakEdgeBeam && (inp.contLongEdges < 2 || inp.contShortEdges < 2)) h *= 1.1;
  return h;
}

function evaluate(inp: SlabInput, hMm: number): SlabResult {
  const ratio = inp.longM / inp.shortM;
  const oneWay = ratio > 2;
  const m = 1 / ratio;
  const caseNo = oneWay ? 0 : twoWayCase(inp.contShortEdges, inp.contLongEdges);
  const dKnM2 = slabSelfWeightKnM2(hMm) + inp.deadExtraKnM2;
  const live = inp.liveBaseKnM2 + inp.livePartitionKnM2;
  const dShort = hMm - DESIGN.coverSlabMm - DESIGN.slabBarMm / 2;
  const dLong = dShort - DESIGN.slabBarMm;
  const la = inp.shortM;
  const lb = inp.longM;
  const shareA = oneWay ? 1 : (coefficient("shareA", caseNo, m) as number);
  const shareB = oneWay ? 0 : (coefficient("shareB", caseNo, m) as number);

  // Largest moment in each section over the gravity combinations.
  let posA = 0, negA = 0, posB = 0, negB = 0, wu = 0, comboAt = 0;
  for (const c of GRAVITY_COMBOS) {
    const wd = c.d * dKnM2;
    const wl = c.l * live + c.lr * inp.roofLiveKnM2;
    const w = wd + wl;
    if (w > wu) { wu = w; comboAt = c.n; }
    if (oneWay) {
      const mom = oneWayMoments(w, la, inp.contLongEdges);
      posA = Math.max(posA, mom.pos);
      negA = Math.max(negA, mom.neg);
      continue;
    }
    const cDa = coefficient("deadA", caseNo, m) as number;
    const cLa = coefficient("liveA", caseNo, m) as number;
    const cDb = coefficient("deadB", caseNo, m) as number;
    const cLb = coefficient("liveB", caseNo, m) as number;
    const pa = (cDa * wd + cLa * wl) * la * la;
    const pb = (cDb * wd + cLb * wl) * lb * lb;
    const nA = coefficient("negA", caseNo, m);
    const nB = coefficient("negB", caseNo, m);
    posA = Math.max(posA, pa);
    posB = Math.max(posB, pb);
    negA = Math.max(negA, nA === null ? pa * DISCONTINUOUS_NEG_FRACTION : nA * w * la * la);
    negB = Math.max(negB, nB === null ? pb * DISCONTINUOUS_NEG_FRACTION : nB * w * lb * lb);
  }

  const minAs = slabMinAs(1000, hMm);
  const dir = (span: number, pos: number, neg: number, share: number, d: number): SlabDirection => {
    const vu = Math.max(share * wu * (span / 2 - d / 1000), 0);
    return { spanM: span, posKnM: pos, negKnM: neg, pos: flexure(pos, 1000, d, minAs), neg: flexure(neg, 1000, d, minAs), vuKn: vu, shear: shear(vu, 1000, d) };
  };
  const short = dir(la, posA, negA, shareA, dShort);
  const long = oneWay ? null : dir(lb, posB, negB, shareB, dLong);
  const dirs = long ? [short, long] : [short];
  const flex = Math.max(...dirs.flatMap((d) => [d.pos.util, d.neg.util]));
  const shr = Math.max(...dirs.map((d) => d.shear.util));
  const minT = minThicknessMm(inp, oneWay);
  const thk = minT / hMm;
  const util = Math.max(flex, shr, thk);
  return {
    type: oneWay ? "one-way" : "two-way",
    caseNo,
    m,
    thicknessMm: hMm,
    minThicknessMm: minT,
    dKnM2,
    lBaseKnM2: inp.liveBaseKnM2,
    lPartitionKnM2: inp.livePartitionKnM2,
    lRoofKnM2: inp.roofLiveKnM2,
    wuKnM2: wu,
    combo: comboAt,
    shareShort: shareA,
    shareLong: shareB,
    short,
    long,
    util,
    governs: util === flex ? "flexure" : util === shr ? "shear" : "thickness",
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
