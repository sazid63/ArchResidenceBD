/**
 * Dog-legged RCC stair (v2.3).
 *
 * v2.2 problems this replaces:
 *  - rise was hard-coded to 3000 mm, but the ground slab is 150 mm and upper slabs 125 mm, so
 *    the top step missed the floor above by 25 mm;
 *  - every step was a single 150 mm slab floating over nothing (no contact with the step below);
 *  - the 2400 x 4800 footprint ignored the room it was placed in and the slab above had no opening.
 *
 * Here the rise is an input (floor finish to floor finish), the riser is derived from it, every
 * step block overlaps the next by 150 mm in Z so the flight is one connected solid, the landing is
 * the same thickness, and the footprint is returned so the caller can cut the slab opening.
 *
 * Plan frame: `u` runs along the stair's length (0 = arrival/start end, landing at the far end),
 * `v` across its width. Flight 1 climbs on v in [0, W], flight 2 returns on v in [W+gap, 2W+gap],
 * and both reach the upper floor at u = 0.
 *
 * ASSUMED proportions (not transcribed from BNBC; the repo rule pack declares stair width a gap):
 * flight width 1000, riser <= 175, tread 250, landing 1000 (= flight width), well gap 150.
 */

import type { MeshObject } from "./mesh";
import { createBoxMesh } from "./solidKernel";

export interface StairParams {
  flightWidthMm: number;
  maxRiserMm: number;
  treadMm: number;
  landingMm: number;
  gapMm: number;
  extraSoffitMm: number;
}

export const DEFAULT_STAIR: StairParams = {
  flightWidthMm: 1120,
  maxRiserMm: 175,
  treadMm: 250,
  landingMm: 1000,
  gapMm: 100,
  extraSoffitMm: 150,
};

export interface StairLayout {
  risersPerFlight: number;
  riserMm: number;
  lengthMm: number; // along u
  widthMm: number; // along v
  blockMm: number; // vertical thickness of each step block / landing
}

export function planStair(riseMm: number, p: StairParams = DEFAULT_STAIR, risers?: number): StairLayout {
  let total = risers ?? Math.ceil(riseMm / p.maxRiserMm);
  if (total % 2) total++;
  const n = total / 2;
  const riser = riseMm / total;
  return {
    risersPerFlight: n,
    riserMm: riser,
    lengthMm: (n - 1) * p.treadMm + p.landingMm,
    widthMm: 2 * p.flightWidthMm + p.gapMm,
    blockMm: riser + p.extraSoffitMm,
  };
}

export interface StairPlacement {
  /** Plan position of the stair's (u=0, v=0) corner. */
  originX: number;
  originY: number;
  /** Which world axis `u` runs along, and the signs of u and v. */
  axis: "X" | "Y";
  uDir: 1 | -1;
  vDir: 1 | -1;
}

/** World-space plan rectangle covered by the stair. */
export function stairFootprint(layout: StairLayout, pl: StairPlacement) {
  const ux = pl.axis === "X" ? layout.lengthMm : layout.widthMm;
  const uy = pl.axis === "X" ? layout.widthMm : layout.lengthMm;
  const sx = pl.axis === "X" ? pl.uDir : pl.vDir;
  const sy = pl.axis === "X" ? pl.vDir : pl.uDir;
  const x2 = pl.originX + sx * ux;
  const y2 = pl.originY + sy * uy;
  return {
    x1: Math.min(pl.originX, x2), x2: Math.max(pl.originX, x2),
    y1: Math.min(pl.originY, y2), y2: Math.max(pl.originY, y2),
  };
}

export function buildDogLegStair(
  baseId: string,
  z0: number,
  riseMm: number,
  pl: StairPlacement,
  phase: string,
  p: StairParams = DEFAULT_STAIR,
  risers?: number,
): { objects: MeshObject[]; layout: StairLayout } {
  const L = planStair(riseMm, p, risers);
  const n = L.risersPerFlight;
  const objs: MeshObject[] = [];
  const W = p.flightWidthMm;

  const box = (id: string, label: string, u0: number, u1: number, v0: number, v1: number, zb: number, zt: number, kind: string) => {
    const [x0, y0] = pl.axis === "X" ? [pl.originX + pl.uDir * u0, pl.originY + pl.vDir * v0] : [pl.originX + pl.vDir * v0, pl.originY + pl.uDir * u0];
    const [x1, y1] = pl.axis === "X" ? [pl.originX + pl.uDir * u1, pl.originY + pl.vDir * v1] : [pl.originX + pl.vDir * v1, pl.originY + pl.uDir * u1];
    objs.push(createBoxMesh(id, label, kind, phase, x0, y0, zb, x1, y1, zt));
  };

  const landingTop = z0 + n * L.riserMm;
  for (let k = 1; k < n; k++) {
    // Flight 1: climbs from the arrival end toward the landing.
    const top = z0 + k * L.riserMm;
    box(`${baseId}_f1_${k}`, `Flight 1 Step ${k}`, (k - 1) * p.treadMm, k * p.treadMm, 0, W, Math.max(z0, top - L.blockMm), top, "stair");
  }
  box(`${baseId}_landing`, "Mid-Landing RCC Slab", (n - 1) * p.treadMm, L.lengthMm, 0, L.widthMm, landingTop - L.blockMm, landingTop, "stair");
  for (let j = 1; j < n; j++) {
    // Flight 2: returns to the arrival end and reaches the upper floor finish at u = 0.
    const top = landingTop + j * L.riserMm;
    const u1 = (n - 1) * p.treadMm - (j - 1) * p.treadMm;
    box(`${baseId}_f2_${j}`, `Flight 2 Step ${j}`, u1 - p.treadMm, u1, W + p.gapMm, L.widthMm, top - L.blockMm, top, "stair");
  }
  return { objects: objs, layout: L };
}
