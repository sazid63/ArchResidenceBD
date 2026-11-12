/** Reinforced-concrete section checks (strength design, SI). Utilisation is never clamped: 1.3 means 30 % over. */

import { beta1, DESIGN, MATERIALS } from "./materials";

export interface FlexureResult {
  /** Required steel from the demand alone, mm2 (Infinity when the demand exceeds the tension-controlled singly-reinforced capacity). */
  asCalcMm2: number;
  asMinMm2: number;
  asReqMm2: number;
  /** Design capacity at the tension-controlled singly-reinforced limit, kN.m. */
  capacityKnM: number;
  /** Demand / capacity at the tension-controlled limit. */
  util: number;
}

/** Singly-reinforced rectangular section. `mu` kN.m, widths and depths mm. */
export function flexure(mu: number, bMm: number, dMm: number, minAsMm2: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): FlexureResult {
  const phi = DESIGN.phiFlexure;
  const rhoTc = 0.85 * beta1(fc) * (fc / fy) * (0.003 / 0.008);
  const capacity = (phi * rhoTc * fy * bMm * dMm * dMm * (1 - (0.59 * rhoTc * fy) / fc)) / 1e6;
  const m = Math.max(mu, 0);
  const rn = (m * 1e6) / (phi * bMm * dMm * dMm);
  const root = 1 - (2 * rn) / (0.85 * fc);
  const asCalc = root < 0 || m > capacity ? Infinity : ((0.85 * fc) / fy) * (1 - Math.sqrt(root)) * bMm * dMm;
  return { asCalcMm2: asCalc, asMinMm2: minAsMm2, asReqMm2: Math.max(asCalc, minAsMm2), capacityKnM: capacity, util: capacity > 0 ? m / capacity : Infinity };
}

/** ACI minimum flexural steel for a beam, mm2. */
export const beamMinAs = (bMm: number, dMm: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number =>
  Math.max((0.25 * Math.sqrt(fc)) / fy, 1.4 / fy) * bMm * dMm;

/** ACI minimum slab steel (shrinkage and temperature, fy 420): 0.0018 b h. */
export const slabMinAs = (bMm: number, hMm: number): number => 0.0018 * bMm * hMm;

export interface ShearResult {
  /** Concrete shear strength phi.Vc, kN. */
  phiVcKn: number;
  /** Section limit phi(Vc + 0.66 sqrt(fc) b d), kN. */
  capacityKn: number;
  /** Stirrup area per mm of length needed, mm2/mm (0 when none is needed). */
  avPerMm: number;
  /** Demand / section limit. */
  util: number;
}

export function shear(vu: number, bMm: number, dMm: number, fc: number = MATERIALS.fcMPa, fyt: number = MATERIALS.fytMPa): ShearResult {
  const phi = DESIGN.phiShear;
  const vc = (0.17 * Math.sqrt(fc) * bMm * dMm) / 1000;
  const vsMax = (0.66 * Math.sqrt(fc) * bMm * dMm) / 1000;
  const capacity = phi * (vc + vsMax);
  const vs = Math.max(vu / phi - vc, 0);
  const calc = (vs * 1000) / (fyt * dMm);
  const minAv = (Math.max(0.062 * Math.sqrt(fc), 0.35) * bMm) / fyt;
  const need = vu > (phi * vc) / 2 ? Math.max(calc, minAv) : 0;
  return { phiVcKn: phi * vc, capacityKn: capacity, avPerMm: need, util: capacity > 0 ? vu / capacity : Infinity };
}

/** Cracked-section second moment of area, mm4, for steel area `asMm2` (singly reinforced). */
export function crackedInertia(bMm: number, dMm: number, asMm2: number, nRatio: number): number {
  // b x^2 / 2 = n As (d - x)  ->  (b/2) x^2 + n As x - n As d = 0
  const a = bMm / 2;
  const bq = nRatio * asMm2;
  const x = (-bq + Math.sqrt(bq * bq + 4 * a * nRatio * asMm2 * dMm)) / (2 * a);
  return (bMm * x ** 3) / 3 + nRatio * asMm2 * (dMm - x) ** 2;
}

/**
 * Crack control for beam tension bars (ACI 318-19 24.3.2 form, common practice; not transcribed from the gazette):
 * centre-to-centre spacing s <= min(380 (280 / fs) - 2.5 cc, 300 (280 / fs)) with fs = 2/3 fy, cc the clear cover to the bar surface.
 */
export function crackControlSpacingMm(coverMm: number, fy: number = MATERIALS.fyMPa): number {
  const fs = (2 / 3) * fy;
  return Math.min(380 * (280 / fs) - 2.5 * coverMm, 300 * (280 / fs));
}

/** Centre-to-centre spacing of `n` bars of diameter `dia` in one layer of a beam of width `bMm`, mm (infinite for one bar). */
export function barCentreSpacingMm(bMm: number, n: number, dia: number, coverMm: number = DESIGN.coverBeamMm, linkMm: number = DESIGN.stirrupMm): number {
  if (n < 2) return Infinity;
  return (bMm - 2 * (coverMm + linkMm) - dia) / (n - 1);
}

/** Beams deeper than this need side (skin) reinforcement: 750 mm (common practice; ACI 318-14 uses 900 mm). */
export const SKIN_STEEL_ABOVE_MM = 750;
export const needsSkinSteel = (hMm: number): boolean => hMm > SKIN_STEEL_ABOVE_MM;
