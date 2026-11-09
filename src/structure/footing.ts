/**
 * Isolated square pad footings, BNBC 2020 Part 6 Sec 6.4.10 and 6.8 (pack: spec/rules/bnbc-2020-structure.yaml):
 * plan area from the service load over the allowable bearing pressure (33 % higher with earthquake, Ch 3 Sec 3.9.3.2),
 * depth from one-way (beam action) shear and two-way punching shear at d/2 (Eq 6.6.72-6.6.74), flexure at the column face.
 * Soil pressure is taken uniform (no footing moment). Units: kN, kN.m, mm, MPa. Utilisation is never clamped.
 */

import { footingPack, seismicPack } from "../rules/bnbcStructure";
import { DESIGN, MATERIALS } from "./materials";
import { flexure, slabMinAs, type FlexureResult } from "./section";

export type ColumnPosition = "interior" | "edge" | "corner";

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
}

export interface FootingResult {
  sideMm: number;
  depthMm: number;
  dMm: number;
  /** Bearing pressure under service load and under the seismic combination, kPa, against the allowable and 1.33 x allowable. */
  pressureKpa: number;
  pressureSeismicKpa: number;
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

const COVER_MM = footingPack().coverAgainstEarth;
const BAR_MM = 16;

export function designFooting(inp: FootingInput): FootingResult {
  const sw = inp.selfWeightFraction ?? 0.1;
  const incr = 1 + seismicPack().bearingIncrease.fraction;
  const area = Math.max(((1 + sw) * inp.serviceKn) / inp.allowableKpa, ((1 + sw) * inp.serviceSeismicKn) / (incr * inp.allowableKpa)); // m2
  const side = Math.max(Math.ceil((Math.sqrt(area) * 1000) / 50) * 50, Math.max(inp.colBxMm, inp.colByMm) + 300);
  const b = side;
  const pressure = ((1 + sw) * inp.serviceKn) / ((b / 1000) ** 2);
  const pressureE = ((1 + sw) * inp.serviceSeismicKn) / ((b / 1000) ** 2);
  const bearingUtil = Math.max(pressure / inp.allowableKpa, pressureE / (incr * inp.allowableKpa));
  const qu = (inp.puKn * 1000) / (b * b); // N/mm2 net factored upward pressure
  const fc = MATERIALS.fcMPa;
  const alphaS = footingPack().alphaS[inp.position];
  const beta = Math.max(inp.colBxMm, inp.colByMm) / Math.min(inp.colBxMm, inp.colByMm);

  let best: FootingResult | null = null;
  for (let h = 300; h <= 2000; h += 50) {
    const d = h - COVER_MM - BAR_MM - BAR_MM / 2; // two bar layers: centroid of the upper layer
    // beam action: critical section d from the column face, the larger of the two directions
    const lever = (col: number) => Math.max(b / 2 - col / 2 - d, 0);
    const vu1 = (qu * b * Math.max(lever(inp.colBxMm), lever(inp.colByMm))) / 1000;
    const phiVc1 = (DESIGN.phiShear * 0.17 * Math.sqrt(fc) * b * d) / 1000;
    // punching: perimeter b0 at d/2 from the column face
    const b0 = 2 * (inp.colBxMm + d) + 2 * (inp.colByMm + d);
    const vu2 = inp.puKn - (qu * (inp.colBxMm + d) * (inp.colByMm + d)) / 1000;
    const vc = Math.min(0.17 * (1 + 2 / beta), 0.083 * ((alphaS * d) / b0 + 2), 0.33) * Math.sqrt(fc) * b0 * d / 1000; // kN, Eq 6.6.72-6.6.74
    const phiVc2 = DESIGN.phiShear * vc;
    // flexure at the column face
    const cant = Math.max((b - inp.colBxMm) / 2, (b - inp.colByMm) / 2);
    const mu = (qu * b * cant * cant) / 2 / 1e6;
    const fl = flexure(mu, b, d, slabMinAs(b, h));
    const parts = [
      { u: bearingUtil, g: "bearing" as const },
      { u: vu1 / phiVc1, g: "one-way shear" as const },
      { u: vu2 / phiVc2, g: "punching" as const },
      { u: fl.util, g: "flexure" as const },
    ];
    const worst = parts.reduce((a, c) => (c.u > a.u ? c : a));
    best = { sideMm: b, depthMm: h, dMm: d, pressureKpa: pressure, pressureSeismicKpa: pressureE, oneWayVuKn: vu1, oneWayPhiVcKn: phiVc1, punchVuKn: vu2, punchPhiVcKn: phiVc2, muKnM: mu, flexure: fl, bearingUtil, util: worst.u, governs: worst.g };
    if (worst.u <= 1) return best;
  }
  return best as FootingResult;
}
