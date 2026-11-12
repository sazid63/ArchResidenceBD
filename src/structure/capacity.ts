/**
 * Capacity design for special moment frames, BNBC 2020 Part 6 Sec 8.3 (gazette pp. 3677, 3692-3693):
 * - Sec 8.3.5.2 eq 6.8.5: sum of nominal column moments at a joint >= 1.2 x sum of nominal beam moments.
 * - Sec 8.3.8.1 (a)/(b): beam design shear from the probable moments Mpr at both ends plus the gravity load.
 * - Notation (gazette p. 3 of the notation list): Mpr is the probable moment strength with the bar tensile strength
 *   taken as at least 1.25 fy and a strength reduction factor of 1.0.
 *
 * Moments are kN.m, forces kN, lengths mm (lengths in metres where the name says M).
 * This module is pure: it gives the numbers. Wiring them into pass or fail is a separate step.
 */
import { interaction, type ColSection, D_PRIME_MM, type Interaction } from "./column";
import { DESIGN, MATERIALS } from "./materials";

/** Probable tensile strength of longitudinal bars as a multiple of fy (notation, Mpr). */
export const PROBABLE_FY_FACTOR = 1.25;

/** Equivalent rectangular block depth a, mm, for steel As at stress fs. */
const blockDepth = (asMm2: number, fsMPa: number, bMm: number, fc: number): number => (asMm2 * fsMPa) / (0.85 * fc * bMm);

/** Nominal beam moment with fy (phi 1.0), kN.m. Used for the beam side of eq 6.8.5. */
export function beamMn(asMm2: number, bMm: number, dMm: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number {
  const a = blockDepth(asMm2, fy, bMm, fc);
  return (asMm2 * fy * (dMm - a / 2)) / 1e6;
}

/** Probable beam moment Mpr at a joint face, kN.m: 1.25 fy in the bars, phi 1.0 (Sec 8.3.8.1). */
export function beamMpr(asMm2: number, bMm: number, dMm: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number {
  const fs = PROBABLE_FY_FACTOR * fy;
  const a = blockDepth(asMm2, fs, bMm, fc);
  return (asMm2 * fs * (dMm - a / 2)) / 1e6;
}

/**
 * Nominal column moment at an axial force, kN.m (phi 1.0). The design curve is divided point by point by its
 * strength reduction factor, then interpolated: p and m of the nominal curve are the design values over phi.
 */
export function columnMnAt(it: Interaction, pNominalKn: number): number {
  const c = it.curve.map((pt) => ({ p: pt.p / pt.phi, m: pt.m / pt.phi }));
  if (pNominalKn >= c[0].p) return 0;
  for (let i = 0; i + 1 < c.length; i++) {
    const a = c[i];
    const b = c[i + 1];
    if (pNominalKn <= a.p && pNominalKn >= b.p) {
      if (a.p === b.p) return Math.max(a.m, b.m);
      const t = (a.p - pNominalKn) / (a.p - b.p);
      return a.m + (b.m - a.m) * t;
    }
  }
  return c[c.length - 1].m;
}

/** Column moment strength for a section and steel ratio, from its interaction curve (nominal, kN.m). */
export function columnSectionMn(sec: ColSection, rho: number, pNominalKn: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number {
  const it = interaction(sec.by, sec.bx, rho, fc, fy, D_PRIME_MM);
  return columnMnAt(it, pNominalKn);
}

export interface JointCheck {
  sumMncKnM: number;
  sumMnbKnM: number;
  /** sum Mnc / sum Mnb; Infinity when no beam frames in. */
  ratio: number;
  ok: boolean;
}

/** Eq 6.8.5 at one joint. Columns are checked at the factored axial force that gives the lowest strength. */
export function strongColumnCheck(sumMncKnM: number, sumMnbKnM: number): JointCheck {
  const ratio = sumMnbKnM > 0 ? sumMncKnM / sumMnbKnM : Infinity;
  return { sumMncKnM, sumMnbKnM, ratio, ok: ratio >= 1.2 - 1e-9 };
}

/**
 * Design shear of a frame beam from the probable end moments and the factored gravity load (Sec 8.3.8.1 (a)):
 * Ve = (Mpr,left + Mpr,right) / ln + wu ln / 2. Ve is never less than the analysed factored shear Vu.
 */
export function beamVe(mprLeftKnM: number, mprRightKnM: number, lnMm: number, wuKnM: number, vuAnalysedKn = 0): number {
  const ln = lnMm / 1000;
  const ve = (mprLeftKnM + mprRightKnM) / ln + (wuKnM * ln) / 2;
  return Math.max(ve, vuAnalysedKn);
}

/** Probable-strength design shear of a beam from its steel, both ends given (Sec 8.3.8.1). */
export function beamVeFromSteel(
  asLeftMm2: number,
  asRightMm2: number,
  bMm: number,
  dMm: number,
  lnMm: number,
  wuKnM: number,
  fc: number = MATERIALS.fcMPa,
  fy: number = MATERIALS.fyMPa,
): number {
  return beamVe(beamMpr(asLeftMm2, bMm, dMm, fc, fy), beamMpr(asRightMm2, bMm, dMm, fc, fy), lnMm, wuKnM);
}

/** The beam effective depth used throughout the design (same as the beam design code). */
export const beamDepthMm = (hMm: number): number => hMm - DESIGN.coverBeamMm - DESIGN.stirrupMm - DESIGN.mainBarMm / 2;
