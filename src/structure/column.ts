/**
 * Reinforced-concrete tied columns, BNBC 2020 Part 6 Sec 6.2.3.2, 6.3.3.6, 6.3.9, 6.3.10 (pack:
 * spec/rules/bnbc-2020-structure.yaml): P-M interaction by strain compatibility, maximum axial strength Eq 6.6.9,
 * slenderness limits and moment magnification Eq 6.6.19-6.6.28, minimum moment Eq 6.6.24. Biaxial bending by
 * Bresler's reciprocal load method. Units: kN, kN.m, mm, MPa. Utilisation is never clamped.
 */

import { columnPack } from "../rules/bnbcStructure";
import { beta1, DESIGN, ecMPa, MATERIALS } from "./materials";

/** Column section: dimension along the x axis and along the y axis of the plan, mm. */
export interface ColSection {
  bx: number;
  by: number;
}

/** Stock sections, smallest area first. Special moment frames need at least 300 mm and a side ratio of 0.4 (assumption: not in the pages read). */
export const COLUMN_STOCK: ColSection[] = (() => {
  const sq = [300, 350, 400, 450, 500, 550, 600, 700].map((s) => ({ bx: s, by: s }));
  const rect = [[300, 450], [300, 600], [350, 500], [400, 600], [450, 700], [500, 750]].flatMap(([a, b]) => [{ bx: a, by: b }, { bx: b, by: a }]);
  return [...sq, ...rect].sort((p, q) => p.bx * p.by - q.bx * q.by || p.bx - q.bx);
})();

/** Distance from the face to the centre of the outer bars: cover 40 + tie 10 + half a 20 mm bar. */
export const D_PRIME_MM = DESIGN.coverBeamMm + DESIGN.stirrupMm + DESIGN.mainBarMm / 2;

export interface CurvePoint {
  /** Design strengths, kN and kN.m. */
  p: number;
  m: number;
  /** Net tensile strain in the extreme tension steel and the strength reduction factor used. */
  epsT: number;
  phi: number;
}

export interface Interaction {
  curve: CurvePoint[];
  /** Design axial strength cap phi 0.80 P0 (Eq 6.6.9), kN, and the nominal P0, kN. */
  phiPnMax: number;
  p0: number;
  astMm2: number;
}

/** Strength reduction factor from the net tensile strain (Sec 6.2.3.2): 0.65 up to fy/Es, 0.90 from 0.005, linear between. */
export function phiFromStrain(epsT: number, fy: number = MATERIALS.fyMPa): number {
  // Sec 6.3.3.3: for Grade 420 the compression-controlled strain limit may be set to 0.002
  const eps = fy === 420 ? 0.002 : fy / MATERIALS.EsMPa;
  if (epsT <= eps) return columnPack().phi.compressionControlledTied;
  if (epsT >= 0.005) return columnPack().phi.tensionControlled;
  const phiC = columnPack().phi.compressionControlledTied;
  return phiC + ((columnPack().phi.tensionControlled - phiC) * (epsT - eps)) / (0.005 - eps);
}

/**
 * Interaction curve for bending in the plane of `depthMm` (steel in two layers at D_PRIME from each face, ratio
 * `rho` on the gross area). Points run from pure compression (capped at phi Pn,max) down to zero axial load.
 */
export function interaction(depthMm: number, widthMm: number, rho: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): Interaction {
  const ag = depthMm * widthMm;
  const ast = rho * ag;
  const layers = [{ d: D_PRIME_MM, a: ast / 2 }, { d: depthMm - D_PRIME_MM, a: ast / 2 }];
  const p0 = (0.85 * fc * (ag - ast) + fy * ast) / 1000;
  const phiC = columnPack().phi.compressionControlledTied;
  const phiPnMax = phiC * columnPack().pnMaxTied.factor * p0;
  const pts: CurvePoint[] = [{ p: phiPnMax, m: 0, epsT: 0, phi: phiC }];
  const dT = depthMm - D_PRIME_MM;
  const b1 = beta1(fc);
  for (let i = 0; i <= 400; i++) {
    const c = depthMm * 3 * Math.pow(0.02 / 3, i / 400);
    const a = Math.min(b1 * c, depthMm);
    const cc = (0.85 * fc * widthMm * a) / 1000;
    let pn = cc;
    let mn = (cc * (depthMm / 2 - a / 2)) / 1000;
    for (const l of layers) {
      const eps = (0.003 * (c - l.d)) / c;
      const fs = Math.max(-fy, Math.min(fy, MATERIALS.EsMPa * eps));
      const f = (l.a * (fs - (l.d < a ? 0.85 * fc : 0))) / 1000;
      pn += f;
      mn += (f * (depthMm / 2 - l.d)) / 1000;
    }
    if (pn < 0) {
      // interpolate the zero-axial point and stop
      const prev = pts[pts.length - 1];
      const prevPn = prev.p / prev.phi;
      const t = prevPn / (prevPn - pn);
      const mAt = (prev.m / prev.phi) * (1 - t) + mn * t;
      const epsT = (0.003 * (dT - c)) / c;
      const phi = phiFromStrain(epsT, fy);
      pts.push({ p: 0, m: phi * mAt, epsT, phi });
      break;
    }
    const epsT = (0.003 * (dT - c)) / c;
    const phi = phiFromStrain(epsT, fy);
    pts.push({ p: Math.min(phi * pn, phiPnMax), m: phi * mn, epsT, phi });
  }
  return { curve: pts, phiPnMax, p0, astMm2: ast };
}

/** Design moment capacity at axial load `p` (kN) by linear interpolation along the curve. */
export function momentCapacityAt(it: Interaction, p: number): number {
  const c = it.curve;
  if (p >= c[0].p) return 0;
  for (let i = 0; i + 1 < c.length; i++) {
    const a = c[i];
    const b = c[i + 1];
    if (p <= a.p && p >= b.p) {
      if (a.p === b.p) return Math.max(a.m, b.m);
      const t = (a.p - p) / (a.p - b.p);
      return a.m + (b.m - a.m) * t;
    }
  }
  return c[c.length - 1].m;
}

/**
 * Where the ray from the origin through (m, p) leaves the envelope: returns t >= 0 such that (t m, t p) is on the
 * curve (smallest crossing). Demand utilisation along the ray is 1 / t.
 */
export function rayScale(it: Interaction, m: number, p: number): number {
  let best = Infinity;
  const c = it.curve;
  for (let i = 0; i + 1 < c.length; i++) {
    const a = c[i];
    const b = c[i + 1];
    // solve t (m, p) = a + u (b - a)
    const dx = b.m - a.m;
    const dy = b.p - a.p;
    const det = m * -dy - p * -dx; // | m  -dx ; p  -dy |
    if (Math.abs(det) < 1e-12) continue;
    const t = (a.m * -dy - a.p * -dx) / det;
    const u = (m * a.p - p * a.m) / det;
    if (u >= -1e-9 && u <= 1 + 1e-9 && t > 1e-12 && t < best) best = t;
  }
  // The envelope is closed by the axes: zero moment up to the cap, zero axial from the end point.
  if (m === 0 && p > 0) best = Math.min(best, it.phiPnMax / p);
  return best;
}

export interface BendingLoads {
  /** First-order factored moments about this axis, kN.m: non-sway part and sway (lateral) part. */
  m2ns: number;
  m2s: number;
  /** Sway magnifier delta_s (Eq 6.6.28) for the lateral part, 1 when there is none. */
  deltaS: number;
}

export interface ColumnCase {
  id: string;
  /** Factored axial load, kN (negative = tension). */
  puKn: number;
  /** Ratio of factored sustained to total axial load (beta_dns, at most 1). */
  betaDns: number;
  /** Unsupported length, mm, and effective-length factor for sway checks (k >= 1). */
  luMm: number;
  k: number;
  /** Effective-length factor for bending in the y-z plane when it differs from k (sway frames, per axis). */
  kY?: number;
  x: BendingLoads;
  y: BendingLoads;
}

export interface AxisResult {
  slender: boolean;
  /** k lu / r against the limit of 22 (unbraced) and the magnified moments. */
  slendernessRatio: number;
  m2minKnM: number;
  deltaNs: number;
  deltaS: number;
  /** Design moment after magnification, kN.m, and its ratio to the first-order moment (limit 1.4, Sec 6.3.10.2.1). */
  mDesignKnM: number;
  amplification: number;
}

export interface CaseResult {
  id: string;
  puKn: number;
  x: AxisResult;
  y: AxisResult;
  /** Demand/capacity: biaxial interaction, and the amplification ratio over 1.4. */
  util: number;
  amplificationUtil: number;
  method: "Bresler" | "linear" | "tension";
}

function axisDesign(c: ColumnCase, ax: BendingLoads, depthMm: number, widthMm: number, k: number): AxisResult {
  const ig = (widthMm * depthMm ** 3) / 12;
  const r = 0.3 * depthMm;
  const ratio = (k * c.luMm) / r;
  const slender = ratio > columnPack().slenderness.neglectUnbracedBelow;
  const m2min = Math.max(c.puKn, 0) * (15 + 0.03 * depthMm) / 1000;
  const m2 = Math.max(Math.abs(ax.m2ns), m2min);
  let deltaNs = 1;
  if (slender) {
    const ei = (0.4 * ecMPa(MATERIALS.fcMPa) * ig) / (1 + Math.min(Math.max(c.betaDns, 0), 1)); // Eq 6.6.22, N.mm2
    const pc = (Math.PI ** 2 * ei) / (1 * c.luMm) ** 2 / 1000; // Eq 6.6.20 with k = 1 (non-sway, Sec 6.3.10.6.3), kN
    const den = 1 - c.puKn / (0.75 * pc);
    deltaNs = den <= 0 ? Infinity : Math.max(1 / den, 1); // Eq 6.6.19 with Cm = 1.0 (conservative)
  }
  const first = m2 + Math.abs(ax.m2s);
  const total = deltaNs * m2 + ax.deltaS * Math.abs(ax.m2s);
  return { slender, slendernessRatio: ratio, m2minKnM: m2min, deltaNs, deltaS: ax.deltaS, mDesignKnM: total, amplification: first > 0 ? total / first : 1 };
}

export interface ColumnCheck {
  rho: number;
  astMm2: number;
  cases: CaseResult[];
  util: number;
  governs: string;
}

/** Check one section and steel ratio against the load cases. */
export function checkColumn(sec: ColSection, rho: number, cases: ColumnCase[]): ColumnCheck {
  const itX = interaction(sec.bx, sec.by, rho); // bending in the x-z plane: depth along x
  const itY = interaction(sec.by, sec.bx, rho);
  const ag = sec.bx * sec.by;
  const out: CaseResult[] = cases.map((c) => {
    const ax = axisDesign(c, c.x, sec.bx, sec.by, c.k);
    const ay = axisDesign(c, c.y, sec.by, sec.bx, c.kY ?? c.k);
    // Sec 6.3.10.2.1: second-order effects may not raise the moment above 1.4 times the first-order moment; reported only when exceeded
    const ampRatio = Math.max(ax.amplification, ay.amplification);
    const amp = ampRatio > 1.4 ? ampRatio / 1.4 : 0;
    const p = c.puKn;
    let util: number;
    let method: CaseResult["method"];
    if (p <= 0) {
      const t = (-p) / ((0.9 * itX.astMm2 * MATERIALS.fyMPa) / 1000);
      util = t + ax.mDesignKnM / Math.max(momentCapacityAt(itX, 0), 1e-9) + ay.mDesignKnM / Math.max(momentCapacityAt(itY, 0), 1e-9);
      method = "tension";
    } else if (ax.mDesignKnM < 1e-9 && ay.mDesignKnM < 1e-9) {
      util = p / itX.phiPnMax;
      method = "Bresler";
    } else if (p >= (0.1 * MATERIALS.fcMPa * ag) / 1000) {
      const capX = ax.mDesignKnM < 1e-9 ? itX.phiPnMax : Math.min(rayScale(itX, ax.mDesignKnM, p) * p, itX.phiPnMax);
      const capY = ay.mDesignKnM < 1e-9 ? itY.phiPnMax : Math.min(rayScale(itY, ay.mDesignKnM, p) * p, itY.phiPnMax);
      const phiP0 = columnPack().phi.compressionControlledTied * itX.p0;
      const inv = 1 / capX + 1 / capY - 1 / phiP0;
      const cap = Math.min(1 / inv, itX.phiPnMax);
      util = p / cap;
      method = "Bresler";
    } else {
      util = ax.mDesignKnM / Math.max(momentCapacityAt(itX, p), 1e-9) + ay.mDesignKnM / Math.max(momentCapacityAt(itY, p), 1e-9);
      method = "linear";
    }
    return { id: c.id, puKn: p, x: ax, y: ay, util, amplificationUtil: amp, method };
  });
  let worst = 0;
  let governs = "none";
  for (const r of out) {
    if (r.util > worst) { worst = r.util; governs = `${r.id} interaction`; }
    if (r.amplificationUtil > worst) { worst = r.amplificationUtil; governs = `${r.id} amplification over 1.4`; }
  }
  return { rho, astMm2: itX.astMm2, cases: out, util: worst, governs };
}

/** Steel ratios tried, from the minimum 1 % to the 6 % maximum (4 % preferred, Sec 6.3.9.1). */
export const RHO_STEPS: number[] = (() => {
  const { minRatio, maxRatio } = columnPack().steel;
  const out: number[] = [];
  for (let r = minRatio; r <= maxRatio + 1e-9; r += 0.0025) out.push(Math.round(r * 10000) / 10000);
  return out;
})();

/** The smallest steel ratio up to `maxRho` that passes every case, or null. */
export function lightestSteel(sec: ColSection, cases: ColumnCase[], maxRho: number = columnPack().steel.preferredMaxRatio): ColumnCheck | null {
  for (const rho of RHO_STEPS) {
    if (rho > maxRho + 1e-9) break;
    const r = checkColumn(sec, rho, cases);
    if (r.util <= 1) return r;
  }
  return null;
}
