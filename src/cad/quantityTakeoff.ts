/**
 * Measured quantity take-off from the (interior-disjoint) solid model (v2.4.3).
 *
 * Why this exists: the previous BOQ multiplied every element's VOLUME by whatever rate the
 * object kind mapped to, even where the rate is priced per m2 (brickwork, partitions, doors,
 * windows) or per ton (railings -> steel), priced overhead tanks as solid concrete and had no
 * reinforcement item. Because the solids no longer overlap (solidKernel.resolveSolids), real
 * measurement is possible:
 *   - volumes can simply be summed (no double counting at column/beam/wall junctions),
 *   - exposed face areas (faces not in contact with another solid) give plaster / finish / floor
 *     areas without counting hidden contact faces.
 */

import type { MeshObject } from "./mesh";
import { EPS } from "./solidKernel";

export type FaceAreas = { px: number; nx: number; py: number; ny: number; pz: number; nz: number };

const q = (v: number) => Math.round(v * 2) / 2;

/** Area (mm2) of the union of rectangles clipped to [a0,a1]x[b0,b1]. */
function unionArea(rects: Array<[number, number, number, number]>, a0: number, a1: number, b0: number, b1: number): number {
  const clipped = rects
    .map(([x0, x1, y0, y1]) => [Math.max(a0, x0), Math.min(a1, x1), Math.max(b0, y0), Math.min(b1, y1)] as [number, number, number, number])
    .filter(([x0, x1, y0, y1]) => x1 - x0 > EPS && y1 - y0 > EPS);
  if (!clipped.length) return 0;
  const xs = [...new Set(clipped.flatMap((r) => [r[0], r[1]]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    const ys = clipped.filter((r) => r[0] <= x0 + EPS && r[1] >= x1 - EPS).map((r) => [r[2], r[3]] as [number, number]).sort((a, b) => a[0] - b[0]);
    let covered = 0, curEnd = -Infinity, curStart = 0;
    for (const [y0, y1] of ys) {
      if (y0 > curEnd) { if (curEnd > -Infinity) covered += curEnd - curStart; curStart = y0; curEnd = y1; }
      else curEnd = Math.max(curEnd, y1);
    }
    if (curEnd > -Infinity) covered += curEnd - curStart;
    area += covered * (x1 - x0);
  }
  return area;
}

/**
 * For every solid, the area of each of its six faces that is NOT covered by the opposite-facing
 * face of another solid (i.e. visible / finishable surface).
 */
export function exposedFaceAreas(objects: MeshObject[]): Map<string, FaceAreas> {
  type Rect = [number, number, number, number];
  const index = new Map<string, Rect[]>();
  const rectOf = (o: MeshObject, axis: number): Rect => {
    const [a, b] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    return [o.bboxMinMm[a], o.bboxMaxMm[a], o.bboxMinMm[b], o.bboxMaxMm[b]];
  };
  for (const o of objects)
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [1, -1]) {
        const plane = sign > 0 ? o.bboxMaxMm[axis] : o.bboxMinMm[axis];
        const key = `${axis}|${q(plane)}|${sign}`;
        (index.get(key) ?? index.set(key, []).get(key)!).push(rectOf(o, axis));
      }
  const out = new Map<string, FaceAreas>();
  for (const o of objects) {
    const res: FaceAreas = { px: 0, nx: 0, py: 0, ny: 0, pz: 0, nz: 0 };
    for (let axis = 0; axis < 3; axis++)
      for (const sign of [1, -1]) {
        const plane = sign > 0 ? o.bboxMaxMm[axis] : o.bboxMinMm[axis];
        const r = rectOf(o, axis);
        const full = (r[1] - r[0]) * (r[3] - r[2]);
        const cover = index.get(`${axis}|${q(plane)}|${-sign}`) ?? [];
        const covered = unionArea(cover, r[0], r[1], r[2], r[3]);
        const name = (sign > 0 ? "p" : "n") + "xyz"[axis];
        (res as Record<string, number>)[name] = Math.max(0, full - covered);
      }
    out.set(o.id, res);
  }
  return out;
}
