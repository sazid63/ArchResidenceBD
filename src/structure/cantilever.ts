/**
 * Cantilever slab strips (Phase B2): the balcony or verandah in front of the first structural line is a one-way slab that cantilevers
 * from the edge beam. There are no columns at its tip.
 *
 * Design, per metre width, for a cantilever of length L (tip to the centre line of the support beam):
 *   Md = wd L^2 / 2 + Pd L        wd = slab weight + finish, Pd = railing or parapet line load at the tip
 *   Ml = wl L^2 / 2               wl = balcony live load (floors) or roof live load (roof)
 *   Mu = largest BNBC Sec 2.7.5 gravity combination; Vu likewise at the support face.
 * Thickness: at least L / 10 (BNBC 2020 Part 6 Table 6.6.1, solid one-way slab, cantilever, divisor 10) and the floor's slab thickness.
 * Flexure and shear by the same sections as the other slabs (src/structure/section.ts). Hand-checkable: see cantilever.test.ts.
 *
 * Not checked, and listed in the assumptions: torsion of the edge beam from the cantilever moment, deflection beyond the L / 10 ratio,
 * and concentrated loads at the tip other than the railing.
 */

import { liveLoadForKind, roofLiveKnM2, factoredLoad, slabSelfWeightKnM2, wallLineLoadKnM } from "./loads";
import { DESIGN, UNIT_WEIGHTS } from "./materials";
import { flexure, shear, slabMinAs, type FlexureResult } from "./section";
import { structurePack } from "../rules/bnbcStructure";
import type { FloorGeometry } from "../plans/geometry";

/** Line load of a balcony railing (MS or aluminium with handrail), kN/m at the tip. Assumption. */
export const RAILING_KN_M = 1.0;

/** Bar diameter assumed when sizing d for the design; the bar schedule picks the real bar. */
const ASSUMED_BAR_MM = 12;

export interface CantileverInput {
  /** Tip to the centre line of the support beam, mm. */
  lengthMm: number;
  /** Slab thickness of the level, mm (the cantilever never goes thinner than the floor). */
  thicknessMm: number;
  roof: boolean;
  /** Parapet height on the roof, mm (the roof strip carries a 125 mm parapet wall at its tip). */
  parapetMm: number;
}

export interface CantileverResult {
  lengthMm: number;
  thicknessMm: number;
  /** L / 10, rounded up to 25 mm: the thinnest slab Table 6.6.1 allows for this length. */
  minThicknessMm: number;
  dMm: number;
  deadKnM2: number;
  liveKnM2: number;
  tipDeadKnM: number;
  /** Factored moment and shear per metre width, kN.m/m and kN/m. */
  muKnMPerM: number;
  vuKnPerM: number;
  flexure: FlexureResult;
  phiVcKnPerM: number;
  /** Largest of the flexure and shear ratios. */
  util: number;
  governs: "flexure" | "shear";
  /** Unfactored reaction on the support beam, kN per metre of beam. */
  beamDeadKnM: number;
  beamLiveKnM: number;
  /** Factored moment the edge beam receives as torsion, kN.m per metre of beam. Not checked: see the assumptions. */
  torsionKnMPerM: number;
}

/** Thinnest slab for a cantilever of this length, Table 6.6.1 (cantilever divisor), rounded up to 25 mm. */
export function cantileverMinThicknessMm(lengthMm: number): number {
  const div = structurePack().minThickness.table_6_6_1.solidOneWaySlab.divisors[3];
  return Math.ceil(lengthMm / div / 25) * 25;
}

export function designCantilever(inp: CantileverInput): CantileverResult {
  const L = inp.lengthMm / 1000;
  const h = Math.max(inp.thicknessMm, cantileverMinThicknessMm(inp.lengthMm), DESIGN.minSlabThicknessMm);
  const d = h - DESIGN.coverSlabMm - ASSUMED_BAR_MM / 2;
  const finish = inp.roof ? UNIT_WEIGHTS.roofFinishKnM2 : UNIT_WEIGHTS.floorFinishKnM2;
  const wd = slabSelfWeightKnM2(h) + finish;
  const wl = inp.roof ? roofLiveKnM2() : liveLoadForKind("balcony");
  const pd = inp.roof ? wallLineLoadKnM(RAILING_PARAPET_MM, inp.parapetMm / 1000) : RAILING_KN_M;

  const md = (wd * L * L) / 2 + pd * L;
  const ml = (wl * L * L) / 2;
  const vd = wd * L + pd;
  const vl = wl * L;
  // On a roof the live load is Lr; on a floor it is L (Sec 2.7.5 combinations 1 to 3).
  const mu = inp.roof ? factoredLoad(md, 0, ml).value : factoredLoad(md, ml).value;
  const vu = inp.roof ? factoredLoad(vd, 0, vl).value : factoredLoad(vd, vl).value;

  const fl = flexure(mu, 1000, d, slabMinAs(1000, h));
  const sh = shear(vu, 1000, d);
  const shearUtil = sh.phiVcKn > 0 ? vu / sh.phiVcKn : Infinity; // slabs carry shear in the concrete alone
  const util = Math.max(fl.util, shearUtil);
  return {
    lengthMm: inp.lengthMm,
    thicknessMm: h,
    minThicknessMm: cantileverMinThicknessMm(inp.lengthMm),
    dMm: d,
    deadKnM2: wd,
    liveKnM2: wl,
    tipDeadKnM: pd,
    muKnMPerM: mu,
    vuKnPerM: vu,
    flexure: fl,
    phiVcKnPerM: sh.phiVcKn,
    util,
    governs: fl.util >= shearUtil ? "flexure" : "shear",
    beamDeadKnM: vd,
    beamLiveKnM: vl,
    torsionKnMPerM: mu,
  };
}

/** Parapet wall thickness on the roof strip, mm (matches the BOQ roof parapet). */
const RAILING_PARAPET_MM = 125;

export interface CantileverStrip {
  id: string;
  /** Plan frame, mm: the strip runs from the tip (y0) to the support line (y1), across x0..x1. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * The cantilever strips of a floor plan: every balcony that lies wholly in front of the first structural line. A balcony that sits
 * between structural lines is an ordinary slab panel and is not listed here.
 */
export function cantileverStrips(geo: FloorGeometry): CantileverStrip[] {
  const f = geo.fitted;
  if (!f?.rooms) return [];
  const support = f.yLines[f.structuralY[0]];
  const out: CantileverStrip[] = [];
  f.rooms.forEach((room) => {
    if (room.def.kind !== "balcony") return;
    for (const r of room.rects) {
      if (r.y1 <= support && r.y0 < support) out.push({ id: `${room.def.id}-${out.length + 1}`, x0: r.x0, x1: r.x1, y0: r.y0, y1: Math.min(r.y1, support) });
    }
  });
  return out;
}

