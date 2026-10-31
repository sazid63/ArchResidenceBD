/**
 * Solid kernel for the NativeCAD mesh engine (v2.3).
 *
 * Everything the generator emits is an axis-aligned box. This module keeps the whole model
 * *disjoint* and *closed*:
 *
 *  - `createBoxMesh`   builds one closed box with OUTWARD (counter-clockwise) winding.
 *  - `resolveSolids`   carves boxes against each other by structural priority, so a wall never
 *                      shares volume with the column/beam it wraps (no coplanar same-facing
 *                      faces => no z-fighting), and cuts openings (voids) out of walls/slabs.
 *  - `validateSolids`  audits a model: volume overlaps, coplanar same-facing faces, per-object
 *                      manifold/orientation, degenerate boxes and unsupported (floating) solids.
 *
 * Units: millimetres. Tolerance: 0.5 mm.
 */

import type { MeshObject } from "./mesh";

export const EPS = 0.5;

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/** Generates vertices, normals and indices for an axis-aligned 3D box solid (outward winding). */
export function createBoxMesh(
  id: string,
  label: string,
  kind: string,
  phase: string,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): MeshObject {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);
  const volumeMm3 = (maxX - minX) * (maxY - minY) * (maxZ - minZ);

  // Each face: 4 corners in counter-clockwise order seen from OUTSIDE the solid.
  const faces: Array<{ n: [number, number, number]; v: number[] }> = [
    { n: [0, 1, 0], v: [maxX, maxY, minZ, minX, maxY, minZ, minX, maxY, maxZ, maxX, maxY, maxZ] },
    { n: [0, -1, 0], v: [minX, minY, minZ, maxX, minY, minZ, maxX, minY, maxZ, minX, minY, maxZ] },
    { n: [0, 0, 1], v: [minX, minY, maxZ, maxX, minY, maxZ, maxX, maxY, maxZ, minX, maxY, maxZ] },
    { n: [0, 0, -1], v: [minX, maxY, minZ, maxX, maxY, minZ, maxX, minY, minZ, minX, minY, minZ] },
    { n: [1, 0, 0], v: [maxX, minY, minZ, maxX, maxY, minZ, maxX, maxY, maxZ, maxX, minY, maxZ] },
    { n: [-1, 0, 0], v: [minX, maxY, minZ, minX, minY, minZ, minX, minY, maxZ, minX, maxY, maxZ] },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach((f, i) => {
    positions.push(...f.v);
    for (let k = 0; k < 4; k++) normals.push(...f.n);
    const b = i * 4;
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });

  return {
    id,
    label,
    kind,
    phase,
    volumeMm3,
    bboxMinMm: [minX, minY, minZ],
    bboxMaxMm: [maxX, maxY, maxZ],
    positions,
    normals,
    indices,
  };
}

export const boxOf = (o: MeshObject): Box => ({
  min: [o.bboxMinMm[0], o.bboxMinMm[1], o.bboxMinMm[2]],
  max: [o.bboxMaxMm[0], o.bboxMaxMm[1], o.bboxMaxMm[2]],
});

export function overlapSize(a: Box, b: Box): [number, number, number] {
  return [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i])) as [
    number,
    number,
    number,
  ];
}

/** True when the two boxes share positive volume (beyond tolerance). */
export function volumesOverlap(a: Box, b: Box): boolean {
  const s = overlapSize(a, b);
  return s[0] > EPS && s[1] > EPS && s[2] > EPS;
}

/** a \ cutter  ->  up to 6 disjoint boxes (slab decomposition: Z first, then Y, then X). */
export function subtractBox(a: Box, c: Box): Box[] {
  if (!volumesOverlap(a, c)) return [a];
  const out: Box[] = [];
  const cur: Box = { min: [...a.min], max: [...a.max] };
  // Axis order Z, Y, X keeps the biggest horizontal pieces whole.
  for (const ax of [2, 1, 0]) {
    const lo = Math.max(c.min[ax], cur.min[ax]);
    const hi = Math.min(c.max[ax], cur.max[ax]);
    if (lo - cur.min[ax] > EPS) {
      const p: Box = { min: [...cur.min], max: [...cur.max] };
      p.max[ax] = lo;
      out.push(p);
    }
    if (cur.max[ax] - hi > EPS) {
      const p: Box = { min: [...cur.min], max: [...cur.max] };
      p.min[ax] = hi;
      out.push(p);
    }
    cur.min[ax] = lo;
    cur.max[ax] = hi;
  }
  return out;
}

/** Greedy re-merge of face-adjacent pieces so carving does not shred an element needlessly. */
export function mergeBoxes(pieces: Box[]): Box[] {
  const list = pieces.map((b) => ({ min: [...b.min], max: [...b.max] }) as Box);
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        for (let ax = 0; ax < 3; ax++) {
          const others = [0, 1, 2].filter((k) => k !== ax);
          const sameCross = others.every(
            (k) => Math.abs(a.min[k] - b.min[k]) <= EPS && Math.abs(a.max[k] - b.max[k]) <= EPS,
          );
          if (!sameCross) continue;
          if (Math.abs(a.max[ax] - b.min[ax]) <= EPS || Math.abs(b.max[ax] - a.min[ax]) <= EPS) {
            a.min[ax] = Math.min(a.min[ax], b.min[ax]);
            a.max[ax] = Math.max(a.max[ax], b.max[ax]);
            list.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
  }
  return list;
}

export interface Void {
  id: string;
  box: Box;
  /** Which solids this void cuts. */
  appliesTo: (o: MeshObject) => boolean;
}

/** Structural priority: higher wins the shared volume. Ties keep emission order. */
export const DEFAULT_PRIORITY: Record<string, number> = {
  column: 100,
  beam: 90,
  lintel: 85,
  slab: 80,
  stair: 75,
  tank: 70,
  canopy: 70,
  balcony: 65,
  door_frame: 60,
  door: 60,
  window: 60,
  railing: 55,
  wall: 50,
  partition: 50,
  parapet: 50,
};

export interface ResolveReport {
  inputObjects: number;
  outputObjects: number;
  carvedObjects: number;
  removedObjects: number;
  voidsApplied: number;
}

/**
 * Makes every solid interior-disjoint. Higher-priority solids keep their volume; lower ones are
 * carved. Voids are subtracted first. Pieces keep id/label/kind/phase (ids get a `~n` suffix and
 * `parentId` points to the original element id).
 */
export function resolveSolids(
  objects: MeshObject[],
  voids: Void[] = [],
  priority: Record<string, number> = DEFAULT_PRIORITY,
): { objects: MeshObject[]; report: ResolveReport } {
  const rank = (o: MeshObject) => priority[o.kind] ?? 40;
  const order = objects.map((o, i) => ({ o, i })).sort((a, b) => rank(b.o) - rank(a.o) || a.i - b.i);

  const placed: Box[] = [];
  const result = new Map<number, MeshObject[]>();
  let carved = 0;
  let removed = 0;
  let voidsApplied = 0;

  for (const { o, i } of order) {
    let pieces: Box[] = [boxOf(o)];
    let touched = false;

    for (const v of voids) {
      if (!v.appliesTo(o)) continue;
      const next = pieces.flatMap((p) => subtractBox(p, v.box));
      if (next.length !== pieces.length || next.some((p, k) => p !== pieces[k])) {
        touched = true;
        voidsApplied++;
      }
      pieces = next;
    }
    const self = boxOf(o);
    for (const other of placed) {
      if (pieces.length === 0) break;
      if (!volumesOverlap(self, other)) continue; // cheap reject: most pairs are far apart
      const next = pieces.flatMap((p) => subtractBox(p, other));
      if (next.length !== pieces.length || next.some((p, k) => p !== pieces[k])) touched = true;
      pieces = next;
    }

    if (!touched) {
      placed.push(boxOf(o));
      result.set(i, [o]);
      continue;
    }
    pieces = mergeBoxes(pieces);
    if (pieces.length === 0) {
      removed++;
      continue;
    }
    carved++;
    const parts = pieces.map((p, k) => {
      const part = createBoxMesh(
        pieces.length === 1 ? o.id : `${o.id}~${k + 1}`,
        o.label,
        o.kind,
        o.phase,
        p.min[0], p.min[1], p.min[2], p.max[0], p.max[1], p.max[2],
      );
      if (pieces.length > 1) part.parentId = o.id;
      return part;
    });
    parts.forEach((pt) => placed.push(boxOf(pt)));
    result.set(i, parts);
  }

  const out: MeshObject[] = [];
  for (let i = 0; i < objects.length; i++) {
    const r = result.get(i);
    if (r) out.push(...r);
  }
  return {
    objects: out,
    report: {
      inputObjects: objects.length,
      outputObjects: out.length,
      carvedObjects: carved,
      removedObjects: removed,
      voidsApplied,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

export interface ValidationReport {
  objects: number;
  overlappingPairs: number;
  overlapVolumeM3: number;
  sameFacingCoplanarPairs: number;
  nonManifoldObjects: string[];
  invertedWindingObjects: string[];
  degenerateObjects: string[];
  floatingObjects: string[];
  samples: { overlaps: string[]; zfight: string[] };
  pass: boolean;
}

/** Each undirected edge must be used by exactly two triangles, once per direction; volume > 0. */
export function checkClosedOutward(o: MeshObject): { closed: boolean; outward: boolean } {
  const key = (x: number, y: number, z: number) => `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
  const idOf = new Map<string, number>();
  const vid: number[] = [];
  for (let i = 0; i < o.positions.length; i += 3) {
    const k = key(o.positions[i], o.positions[i + 1], o.positions[i + 2]);
    if (!idOf.has(k)) idOf.set(k, idOf.size);
    vid.push(idOf.get(k)!);
  }
  const directed = new Map<string, number>();
  let signed = 0;
  for (let t = 0; t < o.indices.length; t += 3) {
    const [a, b, c] = [o.indices[t], o.indices[t + 1], o.indices[t + 2]];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = `${vid[p]}>${vid[q]}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
    const P = [a, b, c].map((i) => [o.positions[i * 3], o.positions[i * 3 + 1], o.positions[i * 3 + 2]]);
    signed +=
      (P[0][0] * (P[1][1] * P[2][2] - P[1][2] * P[2][1]) -
        P[0][1] * (P[1][0] * P[2][2] - P[1][2] * P[2][0]) +
        P[0][2] * (P[1][0] * P[2][1] - P[1][1] * P[2][0])) /
      6;
  }
  let closed = true;
  for (const [k, n] of directed) {
    const [p, q] = k.split(">");
    if (n !== 1 || directed.get(`${q}>${p}`) !== 1) closed = false;
  }
  return { closed, outward: signed > 0 };
}

export function validateSolids(objects: MeshObject[]): ValidationReport {
  const boxes = objects.map(boxOf);
  const overlaps: string[] = [];
  const zfight: string[] = [];
  let overlapVol = 0;
  let overlapPairs = 0;
  let zPairs = 0;
  const touching = new Array(objects.length).fill(false);

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const s = overlapSize(a, b);
      if (s[0] < -EPS || s[1] < -EPS || s[2] < -EPS) continue;
      touching[i] = touching[j] = true;
      if (s[0] > EPS && s[1] > EPS && s[2] > EPS) {
        overlapPairs++;
        overlapVol += (s[0] * s[1] * s[2]) / 1e9;
        if (overlaps.length < 8) overlaps.push(`${objects[i].id} x ${objects[j].id} (${s.map((v) => Math.round(v)).join("x")} mm)`);
      }
      // Coplanar faces with the SAME outward normal and positive shared area => z-fighting.
      let hit = false;
      for (let ax = 0; ax < 3 && !hit; ax++) {
        const o1 = (ax + 1) % 3;
        const o2 = (ax + 2) % 3;
        if (s[o1] <= EPS || s[o2] <= EPS) continue;
        if (Math.abs(a.max[ax] - b.max[ax]) <= EPS || Math.abs(a.min[ax] - b.min[ax]) <= EPS) hit = true;
      }
      if (hit) {
        zPairs++;
        if (zfight.length < 8) zfight.push(`${objects[i].id} ~ ${objects[j].id}`);
      }
    }
  }

  const nonManifold: string[] = [];
  const inverted: string[] = [];
  const degenerate: string[] = [];
  const floating: string[] = [];
  objects.forEach((o, i) => {
    const d = [0, 1, 2].map((k) => o.bboxMaxMm[k] - o.bboxMinMm[k]);
    if (d.some((v) => v <= EPS)) degenerate.push(o.id);
    const r = checkClosedOutward(o);
    if (!r.closed) nonManifold.push(o.id);
    if (!r.outward) inverted.push(o.id);
    // Below grade solids are carried by soil; everything else needs a neighbour or the ground.
    const onGround = o.bboxMinMm[2] <= EPS;
    if (!touching[i] && !onGround && o.bboxMaxMm[2] > 0) floating.push(o.id);
  });

  const report: ValidationReport = {
    objects: objects.length,
    overlappingPairs: overlapPairs,
    overlapVolumeM3: Number(overlapVol.toFixed(4)),
    sameFacingCoplanarPairs: zPairs,
    nonManifoldObjects: nonManifold,
    invertedWindingObjects: inverted,
    degenerateObjects: degenerate,
    floatingObjects: floating,
    samples: { overlaps, zfight },
    pass: false,
  };
  report.pass =
    overlapPairs === 0 &&
    zPairs === 0 &&
    nonManifold.length === 0 &&
    inverted.length === 0 &&
    degenerate.length === 0 &&
    floating.length === 0;
  return report;
}
