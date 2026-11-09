/**
 * Equivalent static seismic analysis, BNBC 2020 Part 6 Sec 2.5 (spec/rules/bnbc-2020-structure.yaml):
 * spectrum Eq 6.2.34-6.2.36, period Eq 6.2.38, base shear Eq 6.2.37, vertical distribution Eq 6.2.41,
 * storey drift Eq 6.2.45-6.2.46 against Table 6.2.21, and the P-delta stability coefficient Eq 6.2.48-6.2.49.
 * Pure functions; kN, m, mm.
 */

import { seismicPack, type OccupancyGroup, type SeismicSystem, type SiteClass } from "../rules/bnbcStructure";

export const DHAKA_Z = 0.2;

export function systemById(id: string): SeismicSystem {
  const row = seismicPack().systems.rows.find((s) => s.id === id);
  if (!row) throw new Error(`unknown seismic system "${id}"`);
  return row;
}

/** Seismic design category from Table 6.2.18; zone is 1..4. */
export function designCategory(siteClass: SiteClass, group: OccupancyGroup, zone: 1 | 2 | 3 | 4): string {
  const table = group === "IV" ? seismicPack().designCategory.IV : seismicPack().designCategory.I_II_III;
  return table[siteClass][zone - 1];
}

/** Is the system permitted at this category and height (m)? Returns the limit that applies. */
export function systemPermitted(sys: SeismicSystem, category: string, heightM: number): { ok: boolean; limit: number | null | "NP" } {
  const idx = category === "B" ? 0 : category === "C" ? 1 : 2;
  const limit = sys.height[idx];
  if (limit === "NP") return { ok: false, limit };
  return { ok: limit === null || heightM <= limit, limit };
}

/** Eq 6.2.35a-d, normalised spectrum Cs for period T (s) with damping correction eta (1 for 5 % damping). */
export function spectrumCs(t: number, siteClass: SiteClass, eta = 1): number {
  const { s, tb, tc, td } = seismicPack().siteClasses[siteClass];
  if (t <= tb) return s * (1 + (t / tb) * (2.5 * eta - 1));
  if (t <= tc) return 2.5 * s * eta;
  if (t <= td) return 2.5 * s * eta * (tc / t);
  return 2.5 * s * eta * ((tc * td) / (t * t));
}

/** Eq 6.2.36: eta = sqrt(10 / (5 + xi)) >= 0.55, xi the damping ratio in percent. */
export const dampingEta = (xiPercent: number): number => Math.max(Math.sqrt(10 / (5 + xiPercent)), 0.55);

/** Eq 6.2.38 with Table 6.2.20: T = Ct h^m, h in m. */
export function approxPeriod(heightM: number, concreteMomentFrame: boolean): number {
  const p = seismicPack().period;
  const { ct, m } = concreteMomentFrame ? p.concreteMomentFrame : p.otherSystems;
  return ct * heightM ** m;
}

export interface SaInput {
  z: number;
  importance: number;
  r: number;
  t: number;
  siteClass: SiteClass;
}

/** Eq 6.2.34: Sa = (2/3)(Z I / R) Cs, not below 0.67 beta Z I S. */
export function designSa(inp: SaInput): { sa: number; cs: number; lowerBound: number; governs: "spectrum" | "lower bound" } {
  const cs = spectrumCs(inp.t, inp.siteClass);
  const raw = (2 / 3) * ((inp.z * inp.importance) / inp.r) * cs;
  const lower = 0.67 * seismicPack().spectrum.beta * inp.z * inp.importance * seismicPack().siteClasses[inp.siteClass].s;
  return { sa: Math.max(raw, lower), cs, lowerBound: lower, governs: raw >= lower ? "spectrum" : "lower bound" };
}

/** Sec 2.5.7.3: fraction of the live load that counts as seismic weight (25 % up to 3 kN/m2, 50 % above). */
export const liveWeightFraction = (liveKnM2: number): number => (liveKnM2 <= 3 ? seismicPack().weight.liveUpTo3KnM2 : seismicPack().weight.liveAbove3KnM2);

/** Eq 6.2.41 exponent k: 1 up to 0.5 s, 2 from 2.5 s, linear between. */
export function distributionExponent(t: number): number {
  return t <= 0.5 ? 1 : t >= 2.5 ? 2 : 1 + (t - 0.5) / 2;
}

/** Eq 6.2.41: forces F_x at levels with weights w (kN) and heights h (m above the base). */
export function distributeForces(v: number, w: number[], h: number[], k: number): number[] {
  const denom = w.reduce((a, wi, i) => a + wi * h[i] ** k, 0);
  return w.map((wi, i) => (v * wi * h[i] ** k) / denom);
}

export interface SeismicInput {
  z: number;
  siteClass: SiteClass;
  group: OccupancyGroup;
  systemId: string;
  /** Number of storeys and the storey height, mm (levels at (i + 1) h). */
  storeys: number;
  storeyHeightMm: number;
  /** Seismic weight assigned to each level 0..n-1 (the slab above storey i), kN. */
  levelWeightsKn: number[];
  /** Lateral stiffness of each storey in kN/mm. */
  storeyStiffnessKnPerMm: number[];
  /** Importance factor override; default Table 6.2.17. */
  importance?: number;
}

export interface SeismicStorey {
  storey: number;
  shearKn: number;
  /** Elastic drift Vx / Kx, mm, and design drift Cd delta / I, mm. */
  elasticMm: number;
  designDriftMm: number;
  limitMm: number;
  util: number;
  /** Stability coefficient (Eq 6.2.48) and its limit (Eq 6.2.49 with beta = 1), and their ratio. */
  theta: number;
  thetaMax: number;
  thetaUtil: number;
}

export interface SeismicResult {
  z: number;
  importance: number;
  system: SeismicSystem;
  category: string;
  permitted: boolean;
  heightM: number;
  periodS: number;
  cs: number;
  sa: number;
  saGoverns: "spectrum" | "lower bound";
  weightKn: number;
  baseShearKn: number;
  k: number;
  /** Lateral force at each level, kN. */
  forcesKn: number[];
  storeys: SeismicStorey[];
  /** Overturning moment at the base of each storey, kN.m (Eq 6.2.47). */
  overturningKnM: number[];
  staticApplicable: boolean;
  /** Worst storey ratio of design drift and of stability coefficient to their limits (never clamped). */
  util: number;
}

export function analyseSeismic(inp: SeismicInput): SeismicResult {
  const pack = seismicPack();
  const sys = systemById(inp.systemId);
  const zone: 1 | 2 | 3 | 4 = inp.z <= 0.12 ? 1 : inp.z <= 0.2 ? 2 : inp.z <= 0.28 ? 3 : 4;
  const category = designCategory(inp.siteClass, inp.group, zone);
  const heightM = (inp.storeys * inp.storeyHeightMm) / 1000;
  const importance = inp.importance ?? pack.importance[inp.group];
  const t = approxPeriod(heightM, inp.systemId.includes("mrf"));
  const sa = designSa({ z: inp.z, importance, r: sys.r, t, siteClass: inp.siteClass });
  const w = inp.levelWeightsKn;
  const weight = w.reduce((a, b) => a + b, 0);
  const v = sa.sa * weight;
  const k = distributionExponent(t);
  const levelH = w.map((_, i) => ((i + 1) * inp.storeyHeightMm) / 1000);
  const forces = distributeForces(v, w, levelH, k);
  const n = w.length;
  const hMm = inp.storeyHeightMm;
  const limitFrac = (inp.storeys <= 4 ? pack.drift.limits.upTo4StoreysAccommodating : pack.drift.limits.allOther)[inp.group];
  const thetaMax = Math.min(0.5 / sys.cd, 0.25); // Eq 6.2.49 with beta = 1
  const storeys: SeismicStorey[] = [];
  for (let i = 0; i < n; i++) {
    const shear = forces.slice(i).reduce((a, b) => a + b, 0);
    const elastic = shear / inp.storeyStiffnessKnPerMm[i];
    const design = (sys.cd * elastic) / importance;
    const limit = limitFrac * hMm;
    const p = w.slice(i).reduce((a, b) => a + b, 0);
    // theta = Px Delta / (Vx h Cd), Delta the design drift (mm) and h in mm
    const theta = (p * design) / (shear * hMm * sys.cd);
    storeys.push({ storey: i, shearKn: shear, elasticMm: elastic, designDriftMm: design, limitMm: limit, util: design / limit, theta, thetaMax, thetaUtil: theta / thetaMax });
  }
  // Eq 6.2.47: M_x = sum over levels i >= x of F_i (h_i - h_x)
  const overturning = Array.from({ length: n }, (_, x) => {
    const hx = (x * hMm) / 1000;
    return forces.reduce((a, f, i) => (i >= x ? a + f * (levelH[i] - hx) : a), 0);
  });
  const perm = systemPermitted(sys, category, heightM);
  return {
    z: inp.z,
    importance,
    system: sys,
    category,
    permitted: perm.ok,
    heightM,
    periodS: t,
    cs: sa.cs,
    sa: sa.sa,
    saGoverns: sa.governs,
    weightKn: weight,
    baseShearKn: v,
    k,
    forcesKn: forces,
    storeys,
    overturningKnM: overturning,
    staticApplicable: t < Math.min(4 * pack.siteClasses[inp.siteClass].tc, 2),
    util: Math.max(0, ...storeys.map((s) => Math.max(s.util, s.thetaUtil))),
  };
}
