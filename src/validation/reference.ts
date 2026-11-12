/**
 * Independent second implementations of the core structural formulas, for cross-checking the engine.
 *
 * Rules for this file: it imports NOTHING from src/structure (only plain numbers go in), and it solves each problem a
 * different way than the engine does where that is possible (numerical root finding instead of the closed form, strain
 * compatibility from first principles, direct summation). If the engine and this file disagree, one of them is wrong
 * and the disagreement has to be explained, never silenced by loosening a tolerance.
 *
 * Units: N, mm, MPa unless a name says kN, kN.m or kPa. Strength design, ACI 318 / BNBC 2020 Part 6 Sec 6.2 and 6.3.
 */

/** Whitney stress-block factor beta1 for fc in MPa. */
export function refBeta1(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.min(0.85, Math.max(0.65, 0.85 - 0.05 * ((fc - 28) / 7)));
}

/** Design moment, kN.m, of a singly reinforced rectangular section with steel As (mm2): phi As fy (d - a/2). */
export function refPhiMn(as: number, b: number, d: number, fc: number, fy: number, phi = 0.9): number {
  const a = (as * fy) / (0.85 * fc * b);
  return (phi * as * fy * (d - a / 2)) / 1e6;
}

/** Steel at the tension-controlled limit (extreme strain 0.005, c/d = 0.003 / 0.008): from compatibility, not the rho formula. */
export function refAsTensionControlled(b: number, d: number, fc: number, fy: number): number {
  const c = d * (0.003 / (0.003 + 0.005));
  const a = refBeta1(fc) * c;
  return (0.85 * fc * b * a) / fy;
}

/** Steel needed for Mu (kN.m) by bisection on phi Mn(As); Infinity above the tension-controlled capacity. */
export function refAsForMoment(mu: number, b: number, d: number, fc: number, fy: number, phi = 0.9): number {
  if (mu <= 0) return 0;
  const top = refAsTensionControlled(b, d, fc, fy);
  if (refPhiMn(top, b, d, fc, fy, phi) < mu) return Infinity;
  let lo = 0;
  let hi = top;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (refPhiMn(mid, b, d, fc, fy, phi) < mu) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Concrete shear strength Vc = 0.17 sqrt(fc) b d, kN. */
export const refVc = (b: number, d: number, fc: number): number => (0.17 * Math.sqrt(fc) * b * d) / 1000;

/** Stirrup area per mm required for Vu (kN), or 0 when none is required (Vu <= phi Vc / 2). */
export function refAvPerMm(vu: number, b: number, d: number, fc: number, fyt: number, phi = 0.75): number {
  const vc = refVc(b, d, fc);
  if (vu <= (phi * vc) / 2) return 0;
  const vs = Math.max(vu / phi - vc, 0);
  const calc = (vs * 1000) / (fyt * d);
  const min = Math.max((0.062 * Math.sqrt(fc) * b) / fyt, (0.35 * b) / fyt);
  return Math.max(calc, min);
}

/** Column section at neutral-axis depth c: nominal axial force (kN) and moment (kN.m) about the centroid, two bar layers. */
export function refColumnPoint(h: number, b: number, astTotal: number, dPrime: number, c: number, fc: number, fy: number, es = 200_000): { pn: number; mn: number; epsT: number } {
  const b1 = refBeta1(fc);
  const a = Math.min(b1 * c, h);
  let pn = 0.85 * fc * b * a;
  let mn = 0.85 * fc * b * a * (h / 2 - a / 2);
  for (const y of [dPrime, h - dPrime]) {
    const strain = (0.003 * (c - y)) / c; // compression positive
    let stress = es * strain;
    stress = Math.max(-fy, Math.min(fy, stress));
    const displaced = y <= a ? 0.85 * fc : 0; // concrete the bar sits in is not counted twice
    const force = (astTotal / 2) * (stress - displaced);
    pn += force;
    mn += force * (h / 2 - y);
  }
  const epsT = (0.003 * (h - dPrime - c)) / c;
  return { pn: pn / 1000, mn: mn / 1e6, epsT };
}

/** phi for tied columns from net tensile strain: 0.65 compression-controlled (limit 0.002 for Grade 420), 0.90 from 0.005. */
export function refPhiColumn(epsT: number): number {
  if (epsT <= 0.002) return 0.65;
  if (epsT >= 0.005) return 0.9;
  return 0.65 + (0.25 * (epsT - 0.002)) / 0.003;
}

/** Pure axial strength P0 (kN) and the capped design value phi 0.80 P0. */
export function refPureAxial(h: number, b: number, rho: number, fc: number, fy: number): { p0: number; phiPnMax: number } {
  const ag = h * b;
  const ast = rho * ag;
  const p0 = (0.85 * fc * (ag - ast) + fy * ast) / 1000;
  return { p0, phiPnMax: 0.65 * 0.8 * p0 };
}

/** Normalised spectrum from the four branch equations, written as a table of (period limit, value at limit) segments. */
export function refCs(t: number, s: number, tb: number, tc: number, td: number): number {
  const plateau = 2.5 * s;
  if (t <= tb) return s + (plateau - s) * (t / tb);
  if (t <= tc) return plateau;
  if (t <= td) return plateau * (tc / t);
  return plateau * ((tc * td) / (t * t));
}

/** Design spectral ratio Sa = (2/3) Z I / R * Cs, not below 0.67 beta Z I S (beta = 0.2). */
export function refSa(z: number, importance: number, r: number, t: number, site: { s: number; tb: number; tc: number; td: number }, beta = 0.2): number {
  const spectrum = ((2 / 3) * z * importance * refCs(t, site.s, site.tb, site.tc, site.td)) / r;
  return Math.max(spectrum, 0.67 * beta * z * importance * site.s);
}

/** Vertical distribution: F_i = V w_i h_i^k / sum(w_j h_j^k). */
export function refStoreyForces(v: number, w: number[], h: number[], k: number): number[] {
  let sum = 0;
  for (let j = 0; j < w.length; j++) sum += w[j] * Math.pow(h[j], k);
  return w.map((wi, i) => (v * wi * Math.pow(h[i], k)) / sum);
}

/** Smallest square pad side (mm, multiple of 50) that keeps service pressure under the allowable. */
export function refPadSide(serviceKn: number, selfWeightFraction: number, allowableKpa: number): number {
  const areaM2 = ((1 + selfWeightFraction) * serviceKn) / allowableKpa;
  return Math.ceil((Math.sqrt(areaM2) * 1000) / 50) * 50;
}

/** Two-way (punching) shear strength, kN, at perimeter b0 for a column of long/short side ratio beta (ACI three-term rule). */
export function refPunchVc(b0: number, d: number, beta: number, alphaS: number, fc: number): number {
  const lambda = Math.sqrt(fc);
  const v1 = 0.17 * (1 + 2 / beta);
  const v2 = 0.083 * ((alphaS * d) / b0 + 2);
  const v3 = 0.33;
  return (Math.min(v1, v2, v3) * lambda * b0 * d) / 1000;
}
