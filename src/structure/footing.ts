/**
 * Isolated square pad footings, BNBC 2020 Part 6 Sec 6.4.10 and 6.8 (pack: spec/rules/bnbc-2020-structure.yaml):
 * plan area from the service load over the allowable bearing pressure (33 % higher with earthquake, Ch 3 Sec 3.9.3.2),
 * depth from one-way (beam action) shear and two-way punching shear at d/2 (Eq 6.6.72-6.6.74), flexure at the column face.
 *
 * Base moments (common practice, not in the gazette text read): the column base moments about x and y (magnified, from the
 * frame cases) make the soil pressure linear, q = P/A + 6 Mx/B^3 + 6 My/B^3 (service), and the factored pressure
 * q = Pu/A + 12 Mx x/B^3 + 12 My y/B^3 for the flexure and one-way shear. Where the eccentricity exceeds B/6 the triangular
 * pressure 2P/(3 B (B/2 - e)) is used for that axis. The footing is enlarged in 50 mm steps until bearing passes.
 * Service moments are taken as factored / 1.2 (assumption). Punching uses the mean factored pressure.
 * Units: kN, kN.m, mm, kPa in the bearing check. Utilisation is never clamped.
 */

import { footingPack, seismicPack } from "../rules/bnbcStructure";
import { DESIGN, MATERIALS } from "./materials";
import { flexure, slabMinAs, type FlexureResult } from "./section";

export type ColumnPosition = "interior" | "edge" | "corner";

/** Service-to-factored moment ratio used for the bearing check (assumption, see the module comment). */
export const SERVICE_TO_FACTORED_MOMENT = 1.2;

export interface FootingInput {
  /** Service load of the column at its base (D + reduced L), kN, and with the earthquake axial change (D + L + E), kN. */
  serviceKn: number;
  serviceSeismicKn: number;
  /** Largest factored load, kN. */
  puKn: number;
  colBxMm: number;
  colByMm: number;
  position: ColumnPosition;
  /** Allowable bearing pressure, kPa (site input; the footing and backfill weight is allowed for with `selfWeightFraction`). */
  allowableKpa: number;
  /** Footing, backfill and slab on top as a fraction of the column service load (assumption). */
  selfWeightFraction?: number;
  /** Concrete cylinder strength, MPa (default: the model grade, MATERIALS.fcMPa). */
  fcMPa?: number;
  /** Depth the column starter bars need: development length in compression plus cover and the two mat layers, mm (Sec 8.2.4). */
  minDepthMm?: number;
  /** Factored column base moments about x and y, kN.m (magnitudes; the worst direction is used). */
  momentXKnM?: number;
  momentYKnM?: number;
}

export interface FootingResult {
  /** Largest factored column load the footing was designed for, kN (a merged footing sums these). */
  puKn: number;
  sideMm: number;
  depthMm: number;
  dMm: number;
  /** Bearing pressure under service load and under the seismic combination, kPa, against the allowable and 1.33 x allowable. */
  pressureKpa: number;
  pressureSeismicKpa: number;
  /** Largest service bearing pressure with the base moments, kPa, and the smallest (negative means uplift at that corner). */
  qMaxKpa: number;
  qMinKpa: number;
  /** Factored base moments used, kN.m (magnitudes). */
  momentXKnM: number;
  momentYKnM: number;
  oneWayVuKn: number;
  oneWayPhiVcKn: number;
  punchVuKn: number;
  punchPhiVcKn: number;
  muKnM: number;
  flexure: FlexureResult;
  bearingUtil: number;
  util: number;
  governs: "bearing" | "one-way shear" | "punching" | "flexure";
}

export const COVER_MM = footingPack().coverAgainstEarth;
export const BAR_MM = 16;

/**
 * Bearing pressure of a square pad of side `bMm` under P (kN) and the two service base moments (kN.m): the linear
 * corner pressure, or the triangular pressure where the resultant is outside the middle third in either direction.
 * kPa throughout.
 */
export function bearing(bMm: number, pKn: number, mxKnM: number, myKnM: number) {
  const B = bMm / 1000;
  const A = B * B;
  const linear = pKn / A + (6 * mxKnM) / B ** 3 + (6 * myKnM) / B ** 3;
  const triangular = (mKnM: number) => {
    const e = Math.abs(mKnM) / Math.max(pKn, 1e-9);
    return e > B / 6 ? (2 * pKn) / (3 * B * Math.max(B / 2 - e, 1e-6)) : 0;
  };
  const qMax = Math.max(linear, triangular(mxKnM), triangular(myKnM));
  // uplift is not allowed: where the linear minimum is negative the pressure is taken as zero at that corner
  const qMin = Math.max(pKn / A - (6 * Math.abs(mxKnM)) / B ** 3 - (6 * Math.abs(myKnM)) / B ** 3, 0);
  return { qMax, qMin };
}

export function designFooting(inp: FootingInput): FootingResult {
  const sw = inp.selfWeightFraction ?? 0.1;
  const incr = 1 + seismicPack().bearingIncrease.fraction;
  const mx = Math.abs(inp.momentXKnM ?? 0);
  const my = Math.abs(inp.momentYKnM ?? 0);
  const msx = mx / SERVICE_TO_FACTORED_MOMENT;
  const msy = my / SERVICE_TO_FACTORED_MOMENT;
  const area = Math.max(((1 + sw) * inp.serviceKn) / inp.allowableKpa, ((1 + sw) * inp.serviceSeismicKn) / (incr * inp.allowableKpa)); // m2
  let side = Math.max(Math.ceil((Math.sqrt(area) * 1000) / 50) * 50, Math.max(inp.colBxMm, inp.colByMm) + 300);

  // enlarge until the bearing check passes with the base moments (gravity against allowable, seismic against 1.33 x allowable)
  const bearingFor = (b: number) => {
    const g = bearing(b, (1 + sw) * inp.serviceKn, msx, msy);
    const s = bearing(b, (1 + sw) * inp.serviceSeismicKn, msx, msy);
    const pG = ((1 + sw) * inp.serviceKn) / ((b / 1000) ** 2);
    const pE = ((1 + sw) * inp.serviceSeismicKn) / ((b / 1000) ** 2);
    return { g, s, util: Math.max(g.qMax / inp.allowableKpa, s.qMax / (incr * inp.allowableKpa)), pG, pE };
  };
  let bf = bearingFor(side);
  while (bf.util > 1 && side < 6000) {
    side += 50;
    bf = bearingFor(side);
  }
  const b = side;
  const Bm = b / 1000;
  const bearingUtil = bf.util;
  const fc = inp.fcMPa ?? MATERIALS.fcMPa;
  const alphaS = footingPack().alphaS[inp.position];
  const beta = Math.max(inp.colBxMm, inp.colByMm) / Math.min(inp.colBxMm, inp.colByMm);

  // factored pressure: mean (for punching) and the linear part from the factored base moments (flexure, one-way shear)
  const A = Bm * Bm;
  const a = (inp.puKn) / A; // kPa mean factored
  const kx = (12 * mx) / Bm ** 3; // kPa per m of x from the centre
  const ky = (12 * my) / Bm ** 3;
  const qMeanKpa = a;

  let best: FootingResult | null = null;
  const hStart = Math.max(300, Math.ceil((inp.minDepthMm ?? 0) / 50) * 50);
  for (let h = hStart; h <= 2000; h += 50) {
    const d = h - COVER_MM - BAR_MM - BAR_MM / 2; // two bar layers: centroid of the upper layer
    const dM = d / 1000;
    // beam action: critical section d from the column face, the larger of the two directions; the pressure is linear
    const oneWay = (col: number, kAxis: number) => {
      const xf = col / 2000; // face from centre, m
      const xs = xf + dM; // critical section from centre, m
      const X = Bm / 2;
      if (xs >= X) return 0;
      return Bm * (a * (X - xs) + (kAxis * (X * X - xs * xs)) / 2); // kN
    };
    const vu1 = Math.max(oneWay(inp.colBxMm, kx), oneWay(inp.colByMm, ky));
    const phiVc1 = (DESIGN.phiShear * 0.17 * Math.sqrt(fc) * b * d) / 1000;
    // punching: perimeter b0 at d/2 from the column face, mean pressure
    const b0 = 2 * (inp.colBxMm + d) + 2 * (inp.colByMm + d);
    const vu2 = inp.puKn - (qMeanKpa * (inp.colBxMm + d) * (inp.colByMm + d)) / 1e6;
    const vc = Math.min(0.17 * (1 + 2 / beta), 0.083 * ((alphaS * d) / b0 + 2), 0.33) * Math.sqrt(fc) * b0 * d / 1000; // kN, Eq 6.6.72-6.6.74
    const phiVc2 = DESIGN.phiShear * vc;
    // flexure at the column face: linear pressure over the cantilever strip of width B
    const cantilever = (col: number, kAxis: number) => {
      const xf = col / 2000;
      const c = Bm / 2 - xf;
      if (c <= 0) return 0;
      return Bm * ((a + kAxis * xf) * c * c) / 2 + (Bm * kAxis * c ** 3) / 3; // kN.m
    };
    const mu = Math.max(cantilever(inp.colBxMm, kx), cantilever(inp.colByMm, ky));
    const fl = flexure(mu, b, d, slabMinAs(b, h));
    const parts = [
      { u: bearingUtil, g: "bearing" as const },
      { u: vu1 / phiVc1, g: "one-way shear" as const },
      { u: vu2 / phiVc2, g: "punching" as const },
      { u: fl.util, g: "flexure" as const },
    ];
    const worst = parts.reduce((x, c) => (c.u > x.u ? c : x));
    best = {
      puKn: inp.puKn, sideMm: b, depthMm: h, dMm: d, pressureKpa: bf.pG, pressureSeismicKpa: bf.pE,
      qMaxKpa: bf.g.qMax, qMinKpa: bf.g.qMin, momentXKnM: mx, momentYKnM: my, oneWayVuKn: vu1, oneWayPhiVcKn: phiVc1, punchVuKn: vu2, punchPhiVcKn: phiVc2,
      muKnM: mu, flexure: fl, bearingUtil, util: worst.u, governs: worst.g,
    };
    if (worst.u <= 1) return best;
  }
  return best as FootingResult;
}

