/**
 * mesh-audit.ts — deterministic geometry audit + software-render harness for the
 * ArchResidenceBD parametric building generator.
 *
 * Run with:
 *   npx tsx scripts/mesh-audit.ts
 *
 * Zero runtime dependencies (Node builtins only: node:zlib, node:fs, node:path).
 * Fully deterministic via mulberry32; never uses Math.random.
 *
 * Outputs:
 *   scripts/audit-out/<caseId>/iso1.png | iso2.png | top.png | issues.png
 *   scripts/audit-out/report.md
 *   scripts/audit-out/report.json
 *
 * Audits per generated mesh:
 *   a. degenerate boxes (any bbox dim < 1 mm)
 *   b. exact duplicate solids (same bbox rounded to 0.1 mm)
 *   c. volume-overlap pairs ("clash", AABB intersection > 1 mm3)
 *   d. coplanar z-fighting pairs (face planes within 0.5 mm, face-rectangle
 *      overlap > 100 mm2, AND the two boxes' volumes overlap; flush contacts
 *      without volume overlap are intentionally NOT flagged)
 *   e. totals: objects, triangles, concrete volume m3, per-phase counts
 */
/// <reference types="node" />

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator";
import type { BuildingCustomization } from "../../src/cad/parametricBuildingGenerator";
import { FLOORPLAN_PRESETS } from "../../src/data/floorplanPresets";
import { getColorForObject } from "../../src/cad/viewer";
import type { MeshDocument, MeshObject } from "../../src/cad/mesh";
import type { BuildingProject, PhaseItem } from "../../src/engine/projectState";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const AUDIT_OUT = join(SCRIPT_DIR, "audit-out");
const IMG_W = 1200;
const IMG_H = 900;
const SEED = 0x4a554449; // "AUDI"

const DEGENERATE_MIN_DIM_MM = 1;
const OVERLAP_MIN_MM3 = 1;
const ZFIGHT_PLANE_TOL_MM = 0.5;
const ZFIGHT_FACE_MIN_MM2 = 100;
const DUP_ROUND_MM = 0.1;

const STORIES = [2, 4, 6, 8];
const PLOTS = [133.8, 200, 267.6, 334.5];
const COL_SMALL = [250, 300]; // stories < 6
const COL_TALL = [350, 400]; // stories >= 6

/** Kinds that count as structural concrete for the volumeM3 figure. */
const CONCRETE_KINDS = new Set([
  "slab",
  "beam",
  "column",
  "footing",
  "wall",
  "stair",
  "tank",
  "canopy",
  "parapet",
]);

const KEY_LIGHT = norm3(0.45, 0.65, 0.75); // same key light as src/cad/viewer.ts
const FILL_LIGHT = norm3(-0.4, -0.3, 0.5); // same fill light as src/cad/viewer.ts
const RED: [number, number, number] = [1, 0, 0];

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function norm3(x: number, y: number, z: number): [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

// ---------------------------------------------------------------------------
// Case matrix
// ---------------------------------------------------------------------------

interface CaseSpec {
  caseId: string;
  stories: number;
  plotSqm: number;
  presetIds: string[]; // one per upper storey (index 0 = floor 1)
  custom?: BuildingCustomization;
  kind: "matrix" | "sweep" | "random";
}

function buildCases(): CaseSpec[] {
  const rng = mulberry32(SEED);
  const cases: CaseSpec[] = [];
  let idx = 0;

  // 1. Deterministic matrix: 2 cases per floorplan preset, round-robin over
  //    stories and plot sizes so every combination axis is covered.
  FLOORPLAN_PRESETS.forEach((preset, p) => {
    for (let variant = 0; variant < 2; variant++) {
      const stories = STORIES[(p + variant * 2) % 4];
      const plotSqm = PLOTS[(p + 1 + variant * 2) % 4];
      const choices = stories >= 6 ? COL_TALL : COL_SMALL;
      const col = choices[(p + variant) % 2];
      cases.push({
        caseId: `mx-${String(++idx).padStart(2, "0")}-s${stories}-p${plotSqm}-${preset.id}-c${col}`,
        stories,
        plotSqm,
        kind: "matrix",
        presetIds: Array.from({ length: stories - 1 }, () => preset.id),
        custom: { columnWidthMm: col, columnDepthMm: col },
      });
    }
  });

  // 2. Column-size sweep (every stories bucket x its column choices).
  for (const stories of STORIES) {
    const cols = stories >= 6 ? COL_TALL : COL_SMALL;
    for (const col of cols) {
      const preset = FLOORPLAN_PRESETS[(stories + col / 50) % FLOORPLAN_PRESETS.length];
      const plotSqm = PLOTS[(stories / 2 + col / 50) % PLOTS.length];
      cases.push({
        caseId: `col-${String(++idx).padStart(2, "0")}-s${stories}-c${col}-${preset.id}`,
        stories,
        plotSqm,
        kind: "sweep",
        presetIds: Array.from({ length: stories - 1 }, () => preset.id),
        custom: { columnWidthMm: col, columnDepthMm: col },
      });
    }
  }

  // 3. Seeded pseudo-random buildings (random stories, plot, per-floor preset,
  //    and custom column / footing / balcony parameters).
  for (let i = 0; i < 20; i++) {
    const stories = 2 + Math.floor(rng() * 7); // 2..8
    const plotBase = PLOTS[Math.floor(rng() * PLOTS.length)];
    const plotSqm = Math.round(plotBase * (0.75 + rng() * 0.5) * 10) / 10;
    const presetIds = Array.from({ length: stories - 1 }, () =>
      FLOORPLAN_PRESETS[Math.floor(rng() * FLOORPLAN_PRESETS.length)].id,
    );
    const pick = (arr: number[]) => arr[Math.floor(rng() * arr.length)];
    // One case exercises the generator's defaults (no custom block at all).
    const custom: BuildingCustomization | undefined =
      i === 17
        ? undefined
        : {
            columnWidthMm: pick([250, 300, 350, 400]),
            columnDepthMm: pick([250, 300, 350, 400]),
            footingSizeMm: pick([1600, 1800, 2000, 2200]),
            footingDepthMm: pick([1400, 1600, 1800, 2000]),
            balconyDepthMm: pick([900, 1200, 1500]),
          };
    cases.push({
      caseId: `rnd-${String(++idx).padStart(2, "0")}-s${stories}-p${plotSqm}`,
      stories,
      plotSqm,
      kind: "random",
      presetIds,
      custom,
    });
  }

  return cases;
}

function presetSummary(ids: string[]): string {
  const uniq = [...new Set(ids)];
  if (uniq.length <= 1) return uniq[0] ?? "(none)";
  const joined = uniq.join("|");
  return joined.length > 64
    ? `mixed(${uniq.length}):${joined.slice(0, 64)}…`
    : `mixed(${uniq.length}):${joined}`;
}

// ---------------------------------------------------------------------------
// Project construction (phases built like the app's phase generator)
// ---------------------------------------------------------------------------

function buildProject(
  caseId: string,
  stories: number,
  plotSqm: number,
  presetIds: string[],
): BuildingProject {
  const mkPhase = (
    id: string,
    kind: PhaseItem["kind"],
    storeyIndex: number | undefined,
    data: Record<string, unknown>,
  ): PhaseItem => ({
    id,
    nameEn: id,
    nameBn: "",
    kind,
    storeyIndex,
    status: "completed",
    data,
    messages: [],
  });

  const phases: PhaseItem[] = [
    mkPhase("phase-site", "site", undefined, {}),
    mkPhase("phase-foundation", "foundation", undefined, {}),
    mkPhase("phase-ground-floor", "ground_floor", 0, {}),
  ];
  for (let s = 1; s < stories; s++) {
    phases.push(
      mkPhase(`phase-floor-${s}`, "floor", s, {
        selectedFloorplanPreset: presetIds[s - 1],
      }),
    );
  }
  phases.push(mkPhase("phase-rooftop", "roof", undefined, {}));
  phases.push(mkPhase("phase-utilities", "utility", undefined, {}));

  return {
    id: `audit-${caseId}`,
    name: `Audit ${caseId}`,
    address: "Dhaka, Bangladesh",
    stories,
    plotSize: plotSqm,
    plotUnit: "sqm",
    plotSqm,
    unitsPerFloor: 2,
    createdAt: "2026-10-28T00:00:00.000Z",
    updatedAt: "2026-10-28T00:00:00.000Z",
    designStarted: true,
    phases,
  };
}

// ---------------------------------------------------------------------------
// Geometry audits
// ---------------------------------------------------------------------------

interface DegenerateIssue {
  id: string;
  kind: string;
  dimsMm: [number, number, number];
  minDimMm: number;
}

interface DuplicateGroup {
  bbox: number[];
  count: number;
  ids: string[];
  kind: string;
}

interface OverlapIssue {
  idA: string;
  idB: string;
  kindA: string;
  kindB: string;
  overlapMm3: number;
}

interface ZFightIssue {
  idA: string;
  idB: string;
  kindA: string;
  kindB: string;
  plane: string;
  faceOverlapMm2: number;
  volumeOverlapMm3: number;
}

interface CaseAudit {
  caseId: string;
  stories: number;
  plotSqm: number;
  presetIds: string[];
  custom?: BuildingCustomization;
  totals: {
    objects: number;
    triangles: number;
    volumeM3Concrete: number;
    volumeM3Total: number;
    phases: Record<string, number>;
  };
  counts: {
    degenerates: number;
    duplicates: number;
    overlaps: number;
    zFights: number;
  };
  issues: {
    degenerate: DegenerateIssue[];
    duplicateGroups: DuplicateGroup[];
    overlaps: OverlapIssue[];
    zFights: ZFightIssue[];
  };
  flaggedIds: Set<string>;
}

interface Face {
  axis: 0 | 1 | 2; // 0 = X plane, 1 = Y plane, 2 = Z plane
  c: number; // plane offset along the axis
  rect: [number, number, number, number]; // other two axes: [min1, max1, min2, max2]
}

function facesOf(o: MeshObject): Face[] {
  const [x0, y0, z0] = o.bboxMinMm;
  const [x1, y1, z1] = o.bboxMaxMm;
  return [
    { axis: 0, c: x0, rect: [y0, y1, z0, z1] },
    { axis: 0, c: x1, rect: [y0, y1, z0, z1] },
    { axis: 1, c: y0, rect: [x0, x1, z0, z1] },
    { axis: 1, c: y1, rect: [x0, x1, z0, z1] },
    { axis: 2, c: z0, rect: [x0, x1, y0, y1] },
    { axis: 2, c: z1, rect: [x0, x1, y0, y1] },
  ];
}

function boxOverlapVolume(a: MeshObject, b: MeshObject): number {
  const ix =
    Math.min(a.bboxMaxMm[0], b.bboxMaxMm[0]) - Math.max(a.bboxMinMm[0], b.bboxMinMm[0]);
  if (ix <= 0) return 0;
  const iy =
    Math.min(a.bboxMaxMm[1], b.bboxMaxMm[1]) - Math.max(a.bboxMinMm[1], b.bboxMinMm[1]);
  if (iy <= 0) return 0;
  const iz =
    Math.min(a.bboxMaxMm[2], b.bboxMaxMm[2]) - Math.max(a.bboxMinMm[2], b.bboxMinMm[2]);
  if (iz <= 0) return 0;
  return ix * iy * iz;
}

function zFightBetween(
  a: MeshObject,
  b: MeshObject,
  fa: Face[],
  volMm3: number,
): ZFightIssue | null {
  const fb = facesOf(b);
  let best: ZFightIssue | null = null;
  for (const A of fa) {
    for (const B of fb) {
      if (A.axis !== B.axis) continue;
      if (Math.abs(A.c - B.c) > ZFIGHT_PLANE_TOL_MM) continue;
      const w = Math.min(A.rect[1], B.rect[1]) - Math.max(A.rect[0], B.rect[0]);
      if (w <= 0) continue;
      const h = Math.min(A.rect[3], B.rect[3]) - Math.max(A.rect[2], B.rect[2]);
      if (h <= 0) continue;
      const area = w * h;
      if (area <= ZFIGHT_FACE_MIN_MM2) continue;
      if (!best || area > best.faceOverlapMm2) {
        best = {
          idA: a.id,
          idB: b.id,
          kindA: a.kind,
          kindB: b.kind,
          plane: `${"XYZ"[A.axis]}=${A.c.toFixed(1)}`,
          faceOverlapMm2: area,
          volumeOverlapMm3: volMm3,
        };
      }
    }
  }
  return best;
}

function bboxKey(o: MeshObject): string {
  const r = (v: number) => Math.round(v / DUP_ROUND_MM) * DUP_ROUND_MM;
  return [
    r(o.bboxMinMm[0]),
    r(o.bboxMinMm[1]),
    r(o.bboxMinMm[2]),
    r(o.bboxMaxMm[0]),
    r(o.bboxMaxMm[1]),
    r(o.bboxMaxMm[2]),
  ].join("|");
}

function auditMesh(spec: CaseSpec, mesh: MeshDocument): CaseAudit {
  const objects = mesh.objects;

  const degenerate: DegenerateIssue[] = [];
  const dupMap = new Map<string, MeshObject[]>();
  let volumeM3Concrete = 0;
  let volumeM3Total = 0;
  let triangles = 0;
  const phases: Record<string, number> = {};

  for (const o of objects) {
    const dims: [number, number, number] = [
      o.bboxMaxMm[0] - o.bboxMinMm[0],
      o.bboxMaxMm[1] - o.bboxMinMm[1],
      o.bboxMaxMm[2] - o.bboxMinMm[2],
    ];
    const minDim = Math.min(dims[0], dims[1], dims[2]);
    if (minDim < DEGENERATE_MIN_DIM_MM) {
      degenerate.push({ id: o.id, kind: o.kind, dimsMm: dims, minDimMm: minDim });
    }
    volumeM3Total += o.volumeMm3 / 1e9;
    if (CONCRETE_KINDS.has(o.kind)) volumeM3Concrete += o.volumeMm3 / 1e9;
    triangles += o.indices.length / 3;
    phases[o.phase] = (phases[o.phase] ?? 0) + 1;

    const key = bboxKey(o);
    const group = dupMap.get(key);
    if (group) group.push(o);
    else dupMap.set(key, [o]);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  for (const [key, group] of dupMap) {
    if (group.length > 1) {
      duplicateGroups.push({
        bbox: key.split("|").map(Number),
        count: group.length,
        ids: group.map((g) => g.id),
        kind: group[0].kind,
      });
    }
  }

  // Pairwise volume-overlap ("clash") + coplanar z-fighting detection.
  const overlaps: OverlapIssue[] = [];
  const zFights: ZFightIssue[] = [];
  const flaggedIds = new Set<string>();
  for (let i = 0; i < objects.length; i++) {
    const a = objects[i];
    const fa = facesOf(a);
    for (let j = i + 1; j < objects.length; j++) {
      const b = objects[j];
      const vol = boxOverlapVolume(a, b);
      if (vol <= OVERLAP_MIN_MM3) continue;
      overlaps.push({
        idA: a.id,
        idB: b.id,
        kindA: a.kind,
        kindB: b.kind,
        overlapMm3: vol,
      });
      flaggedIds.add(a.id);
      flaggedIds.add(b.id);
      const zf = zFightBetween(a, b, fa, vol);
      if (zf) zFights.push(zf);
    }
  }

  overlaps.sort((x, y) => y.overlapMm3 - x.overlapMm3);
  zFights.sort(
    (x, y) => y.faceOverlapMm2 - x.faceOverlapMm2 || y.volumeOverlapMm3 - x.volumeOverlapMm3,
  );
  duplicateGroups.sort((x, y) => y.count - x.count);
  degenerate.sort((x, y) => x.minDimMm - y.minDimMm);

  return {
    caseId: spec.caseId,
    stories: spec.stories,
    plotSqm: spec.plotSqm,
    presetIds: spec.presetIds,
    custom: spec.custom,
    totals: { objects: objects.length, triangles, volumeM3Concrete, volumeM3Total, phases },
    counts: {
      degenerates: degenerate.length,
      duplicates: duplicateGroups.length,
      overlaps: overlaps.length,
      zFights: zFights.length,
    },
    issues: { degenerate, duplicateGroups, overlaps, zFights },
    flaggedIds,
  };
}

// ---------------------------------------------------------------------------
// Software renderer (perspective iso + orthographic top, z-buffer, PNG out)
// ---------------------------------------------------------------------------

interface Cam {
  ex: number;
  ey: number;
  ez: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
  fx: number;
  fy: number;
  fz: number;
  sxScale: number;
  syScale: number;
  offX: number;
  offY: number;
  ortho: boolean;
  scale: number;
}

function frameBBox(objects: MeshObject[]): {
  center: [number, number, number];
  span3: number;
  spanXY: number;
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) {
    if (o.kind === "excavation") continue; // huge pit must not skew framing
    for (let k = 0; k < 3; k++) {
      if (o.bboxMinMm[k] < min[k]) min[k] = o.bboxMinMm[k];
      if (o.bboxMaxMm[k] > max[k]) max[k] = o.bboxMaxMm[k];
    }
  }
  if (!isFinite(min[0])) {
    // Nothing framed (e.g. all objects are excavation): frame everything.
    for (const o of objects) {
      for (let k = 0; k < 3; k++) {
        if (o.bboxMinMm[k] < min[k]) min[k] = o.bboxMinMm[k];
        if (o.bboxMaxMm[k] > max[k]) max[k] = o.bboxMaxMm[k];
      }
    }
  }
  if (objects.length === 0 || !isFinite(min[0])) {
    return { center: [0, 0, 0], span3: 1000, spanXY: 1000 };
  }
  return {
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
    span3: Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1000),
    spanXY: Math.max(max[0] - min[0], max[1] - min[1], 1),
  };
}

/** Isometric perspective camera mirroring the app viewer (elevation 0.42, distance 1.5 x span). */
function isoCamera(
  azimuth: number,
  center: [number, number, number],
  span3: number,
  w: number,
  h: number,
): Cam {
  const el = 0.42;
  const d = span3 * 1.5;
  const ce = Math.cos(el);
  const se = Math.sin(el);
  const fx = -ce * Math.sin(azimuth); // forward (eye -> target)
  const fy = ce * Math.cos(azimuth);
  const fz = -se;

  let rx = fy; // right = cross(forward, up=(0,0,1))
  let ry = -fx;
  const rl = Math.hypot(rx, ry) || 1;
  rx /= rl;
  ry /= rl;
  const ux = ry * fz;
  const uy = -rx * fz;
  const uz = rx * fy - ry * fx;

  const proj = (0.5 * h) / Math.tan(0.85 / 2);
  return {
    ex: center[0] - fx * d,
    ey: center[1] - fy * d,
    ez: center[2] - fz * d,
    rx,
    ry,
    rz: 0,
    ux,
    uy,
    uz,
    fx,
    fy,
    fz,
    sxScale: proj,
    syScale: proj,
    offX: w * 0.5,
    offY: h * 0.5,
    ortho: false,
    scale: 1,
  };
}

/** Orthographic top-down plan camera (x right, y down, z toward viewer). */
function topCamera(
  center: [number, number, number],
  spanXY: number,
  w: number,
  h: number,
): Cam {
  const scale = (Math.min(w, h) * 0.85) / Math.max(spanXY, 1);
  return {
    ex: center[0],
    ey: center[1],
    ez: center[2] + spanXY * 4,
    rx: 1,
    ry: 0,
    rz: 0,
    ux: 0,
    uy: 1,
    uz: 0,
    fx: 0,
    fy: 0,
    fz: -1,
    sxScale: 1,
    syScale: 1,
    offX: w * 0.5 - center[0] * scale,
    offY: h * 0.5 - center[1] * scale,
    ortho: true,
    scale,
  };
}

function project(
  cam: Cam,
  vx: number,
  vy: number,
  vz: number,
): [number, number, number] | null {
  if (cam.ortho) return [vx * cam.scale + cam.offX, vy * cam.scale + cam.offY, -vz];
  const dx = vx - cam.ex;
  const dy = vy - cam.ey;
  const dz = vz - cam.ez;
  const zv = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (zv <= 1) return null; // behind camera
  const xv = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  const yv = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  const inv = 1 / zv;
  return [xv * cam.sxScale * inv + cam.offX, cam.offY - yv * cam.syScale * inv, zv];
}

function fillTriangle(
  fb: Uint8Array,
  depth: Float32Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
  r: number,
  g: number,
  b: number,
): void {
  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (denom === 0) return;
  const inv = 1 / denom;
  // Barycentric lambdas for vertices 0 and 1 (lambda2 = 1 - l0 - l1).
  const a0 = (y1 - y2) * inv;
  const b0 = (x2 - x1) * inv;
  const c0 = (x1 * y2 - x2 * y1) * inv;
  const a1 = (y2 - y0) * inv;
  const b1 = (x0 - x2) * inv;
  const c1 = (x2 * y0 - x0 * y2) * inv;
  const dz0 = z0 - z2;
  const dz1 = z1 - z2;
  const dz = a0 * dz0 + a1 * dz1;

  let minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  let maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
  let minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  let maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
  if (minX > maxX || minY > maxY) return;

  for (let y = minY; y <= maxY; y++) {
    let l0 = a0 * minX + b0 * y + c0;
    let l1 = a1 * minX + b1 * y + c1;
    let zz = z2 + dz0 * l0 + dz1 * l1;
    let p = y * w + minX;
    for (let x = minX; x <= maxX; x++, p++) {
      if (l0 >= 0 && l1 >= 0 && l0 + l1 <= 1) {
        if (zz < depth[p]) {
          depth[p] = zz;
          const pi = p * 3;
          fb[pi] = r;
          fb[pi + 1] = g;
          fb[pi + 2] = b;
        }
      }
      l0 += a0;
      l1 += a1;
      zz += dz;
    }
  }
}

function renderScene(
  objects: MeshObject[],
  cam: Cam,
  w: number,
  h: number,
  flagged: Set<string> | null,
): Uint8Array {
  const depth = new Float32Array(w * h);
  depth.fill(Infinity);
  const fb = new Uint8Array(w * h * 3);
  // Viewer background colour (0.98, 0.965, 0.94).
  for (let i = 0; i < w * h; i++) {
    fb[i * 3] = 250;
    fb[i * 3 + 1] = 246;
    fb[i * 3 + 2] = 240;
  }

  const key = KEY_LIGHT;
  const fill = FILL_LIGHT;

  for (const o of objects) {
    const isFlagged = !!flagged && flagged.has(o.id);
    const col = isFlagged ? RED : getColorForObject(o);
    const pos = o.positions;
    const nrm = o.normals;
    const ind = o.indices;

    for (let t = 0; t < ind.length; t += 3) {
      const i0 = ind[t];
      const i1 = ind[t + 1];
      const i2 = ind[t + 2];
      const p0 = i0 * 3;
      const p1 = i1 * 3;
      const p2 = i2 * 3;

      // Backface cull with the face normal (robust for any winding).
      const nx = nrm[p0];
      const ny = nrm[p0 + 1];
      const nz = nrm[p0 + 2];
      if (nx * (pos[p0] - cam.ex) + ny * (pos[p0 + 1] - cam.ey) + nz * (pos[p0 + 2] - cam.ez) >= 0) {
        continue;
      }

      // Viewer shader: shade = ambient(0.52) + 0.48*key + 0.35*fill, cap 1.12.
      let shade: number;
      if (isFlagged) {
        shade = 1; // solid, unlit red for issue evidence
      } else {
        const l1 = nx * key[0] + ny * key[1] + nz * key[2];
        const l2 = nx * fill[0] + ny * fill[1] + nz * fill[2];
        shade = Math.min(0.52 + 0.48 * Math.max(l1, 0) + 0.35 * Math.max(l2, 0), 1.12);
      }
      const r = Math.min(255, Math.round(col[0] * shade * 255));
      const g = Math.min(255, Math.round(col[1] * shade * 255));
      const b = Math.min(255, Math.round(col[2] * shade * 255));

      const s0 = project(cam, pos[p0], pos[p0 + 1], pos[p0 + 2]);
      const s1 = project(cam, pos[p1], pos[p1 + 1], pos[p1 + 2]);
      const s2 = project(cam, pos[p2], pos[p2 + 1], pos[p2 + 2]);
      if (!s0 || !s1 || !s2) continue;

      fillTriangle(fb, depth, w, h, s0[0], s0[1], s0[2], s1[0], s1[1], s1[2], s2[0], s2[1], s2[2], r, g, b);
    }
  }
  return fb;
}

// ---------------------------------------------------------------------------
// PNG encoding (hand-rolled: signature + IHDR + IDAT + IEND, CRC32)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(fb: Uint8Array, w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline prefixed with filter byte 0 (None).
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(fb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 1 });

  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function logCase(c: CaseAudit): void {
  const t = c.totals;
  console.log(`== ${c.caseId} | stories=${c.stories} plotSqm=${c.plotSqm} preset=${presetSummary(c.presetIds)}`);
  console.log(
    `   objects=${t.objects} triangles=${t.triangles} concrete=${t.volumeM3Concrete.toFixed(2)} m3 total=${t.volumeM3Total.toFixed(2)} m3`,
  );
  console.log(`   phases: ${Object.entries(t.phases).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(
    `   issues: degenerate=${c.counts.degenerates} duplicates=${c.counts.duplicates} overlaps=${c.counts.overlaps} zFights=${c.counts.zFights}`,
  );
  for (const d of c.issues.degenerate.slice(0, 10)) {
    console.log(
      `     DEG  ${d.id} (${d.kind}) minDim=${d.minDimMm.toFixed(3)} mm dims=${d.dimsMm.map((v) => v.toFixed(1)).join("x")}`,
    );
  }
  for (const d of c.issues.duplicateGroups.slice(0, 10)) {
    console.log(
      `     DUP  x${d.count} ${d.kind} bbox=[${d.bbox.map((v) => v.toFixed(1)).join(",")}] ids=${d.ids.slice(0, 4).join(",")}${d.ids.length > 4 ? "…" : ""}`,
    );
  }
  for (const o of c.issues.overlaps.slice(0, 10)) {
    console.log(`     OVL  ${fmtInt(o.overlapMm3)} mm3  ${o.idA} (${o.kindA}) x ${o.idB} (${o.kindB})`);
  }
  for (const z of c.issues.zFights.slice(0, 10)) {
    console.log(
      `     ZF   ${fmtInt(z.faceOverlapMm2)} mm2 @ ${z.plane}  ${z.idA} (${z.kindA}) x ${z.idB} (${z.kindB})`,
    );
  }
}

interface SerializedCase extends Omit<CaseAudit, "flaggedIds"> {
  flaggedCount: number;
}

function writeReports(
  outDir: string,
  results: CaseAudit[],
  durationMs: number,
): void {
  const rows = results
    .map((c) => {
      const t = c.totals;
      return (
        `| \`${c.caseId}\` | ${c.stories} | ${c.plotSqm} | ${presetSummary(c.presetIds)} | ` +
        `${t.objects} | ${t.triangles} | ${t.volumeM3Concrete.toFixed(2)} | ` +
        `${c.counts.degenerates} | ${c.counts.duplicates} | ${c.counts.overlaps} | ${c.counts.zFights} |`
      );
    })
    .join("\n");

  const allOv = results.flatMap((c) =>
    c.issues.overlaps.map((o) => ({ caseId: c.caseId, ...o })),
  );
  allOv.sort((a, b) => b.overlapMm3 - a.overlapMm3);
  const topOv = allOv.slice(0, 20);
  const ovRows = topOv
    .map(
      (o, i) =>
        `| ${i + 1} | ${fmtInt(o.overlapMm3)} | \`${o.caseId}\` | ${o.idA} (${o.kindA}) | ${o.idB} (${o.kindB}) |`,
    )
    .join("\n");

  const allZf = results.flatMap((c) =>
    c.issues.zFights.map((z) => ({ caseId: c.caseId, ...z })),
  );
  allZf.sort(
    (a, b) => b.faceOverlapMm2 - a.faceOverlapMm2 || b.volumeOverlapMm3 - a.volumeOverlapMm3,
  );
  const topZf = allZf.slice(0, 10);
  const zfRows = topZf
    .map(
      (z, i) =>
        `| ${i + 1} | ${fmtInt(z.faceOverlapMm2)} | ${fmtInt(z.volumeOverlapMm3)} | ${z.plane} | \`${z.caseId}\` | ${z.idA} (${z.kindA}) | ${z.idB} (${z.kindB}) |`,
    )
    .join("\n");

  const md = [
    "# ArchResidenceBD parametric generator — mesh audit (baseline)",
    "",
    `- Generated: ${new Date().toISOString()}`,
    "- Tool: `scripts/mesh-audit.ts` (deterministic, mulberry32 seed `0x4a554449`, no `Math.random`)",
    `- Cases: ${results.length} (20 preset matrix + 8 column-size sweep + 20 seeded-random)`,
    "- Command: `npx tsx scripts/mesh-audit.ts`",
    `- Wall time: ${(durationMs / 1000).toFixed(1)} s`,
    "- `volumeM3` = structural concrete kinds (slab, beam, column, footing, wall, stair, tank, canopy, parapet)",
    "- `duplicates` = distinct rounded-bbox (0.1 mm) groups with >= 2 members",
    "- `overlaps` = box pairs with volume intersection > 1 mm3",
    "- `zFights` = pairs with a shared face plane (<= 0.5 mm) whose face rectangles overlap > 100 mm2 AND whose volumes overlap (flush contacts are not flagged)",
    "",
    "## Summary table",
    "",
    "| case | stories | plotSqm | preset(s) | objects | triangles | volumeM3 | degenerates | duplicates | overlaps | zFights |",
    "|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|",
    rows,
    "",
    "## Top 20 worst volume-overlap pairs (all cases)",
    "",
    "| # | overlap mm3 | case | object A (kind) | object B (kind) |",
    "|---:|---:|---|---|---|",
    ovRows,
    "",
    "## Top 10 worst z-fighting pairs (all cases)",
    "",
    "| # | face overlap mm2 | volume overlap mm3 | plane | case | object A (kind) | object B (kind) |",
    "|---:|---:|---:|---|---|---|---|",
    zfRows,
    "",
  ].join("\n");
  writeFileSync(join(outDir, "report.md"), md, "utf8");

  const serialized: SerializedCase[] = results.map((c) => {
    const { flaggedIds, ...rest } = c;
    return { ...rest, flaggedCount: flaggedIds.size };
  });
  const json = {
    generatedAt: new Date().toISOString(),
    tool: "scripts/mesh-audit.ts",
    version: "1.0.0",
    seed: SEED,
    durationMs,
    caseCount: results.length,
    thresholds: {
      degenerateMinDimMm: DEGENERATE_MIN_DIM_MM,
      overlapMinMm3: OVERLAP_MIN_MM3,
      zFightPlaneTolMm: ZFIGHT_PLANE_TOL_MM,
      zFightFaceMinMm2: ZFIGHT_FACE_MIN_MM2,
      duplicateRoundMm: DUP_ROUND_MM,
    },
    cases: serialized,
    worstOverlaps: topOv,
    worstZFights: topZf,
  };
  writeFileSync(join(outDir, "report.json"), JSON.stringify(json, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const started = Date.now();
  const cases = buildCases();
  rmSync(AUDIT_OUT, { recursive: true, force: true });
  mkdirSync(AUDIT_OUT, { recursive: true });

  console.log(`[mesh-audit] ${cases.length} cases, output → ${AUDIT_OUT}\n`);
  console.log(
    `[mesh-audit] thresholds: degenerate < ${DEGENERATE_MIN_DIM_MM} mm | overlap > ${OVERLAP_MIN_MM3} mm3 | zFight plane <= ${ZFIGHT_PLANE_TOL_MM} mm & face > ${ZFIGHT_FACE_MIN_MM2} mm2\n`,
  );

  const results: CaseAudit[] = [];
  for (const spec of cases) {
    const project = buildProject(spec.caseId, spec.stories, spec.plotSqm, spec.presetIds);
    const mesh = generateBuildingMesh(project, "final", spec.custom);
    const audit = auditMesh(spec, mesh);
    results.push(audit);

    const dir = join(AUDIT_OUT, spec.caseId);
    mkdirSync(dir, { recursive: true });
    const frame = frameBBox(mesh.objects);
    const camIso1 = isoCamera(0.9, frame.center, frame.span3, IMG_W, IMG_H);
    const camIso2 = isoCamera(4.0, frame.center, frame.span3, IMG_W, IMG_H);
    const camTop = topCamera(frame.center, frame.spanXY, IMG_W, IMG_H);

    writeFileSync(
      join(dir, "iso1.png"),
      encodePng(renderScene(mesh.objects, camIso1, IMG_W, IMG_H, null), IMG_W, IMG_H),
    );
    writeFileSync(
      join(dir, "iso2.png"),
      encodePng(renderScene(mesh.objects, camIso2, IMG_W, IMG_H, null), IMG_W, IMG_H),
    );
    writeFileSync(
      join(dir, "top.png"),
      encodePng(renderScene(mesh.objects, camTop, IMG_W, IMG_H, null), IMG_W, IMG_H),
    );
    // iso1 with every clash / z-fight participant painted solid red.
    writeFileSync(
      join(dir, "issues.png"),
      encodePng(renderScene(mesh.objects, camIso1, IMG_W, IMG_H, audit.flaggedIds), IMG_W, IMG_H),
    );

    logCase(audit);
  }

  const durationMs = Date.now() - started;
  writeReports(AUDIT_OUT, results, durationMs);

  const totObjects = results.reduce((s, c) => s + c.totals.objects, 0);
  const totTris = results.reduce((s, c) => s + c.totals.triangles, 0);
  const totOvl = results.reduce((s, c) => s + c.counts.overlaps, 0);
  const totZf = results.reduce((s, c) => s + c.counts.zFights, 0);
  const totDup = results.reduce((s, c) => s + c.counts.duplicates, 0);
  const totDeg = results.reduce((s, c) => s + c.counts.degenerates, 0);

  console.log("\n================================================================");
  console.log("[mesh-audit] DONE");
  console.log(`  cases=${results.length} objects=${fmtInt(totObjects)} triangles=${fmtInt(totTris)}`);
  console.log(`  degenerate=${totDeg} duplicates=${totDup} overlaps=${fmtInt(totOvl)} zFights=${fmtInt(totZf)}`);
  console.log(`  outputs: ${AUDIT_OUT}`);
  console.log(`  wall time: ${(durationMs / 1000).toFixed(1)} s`);
}

try {
  main();
} catch (err) {
  console.error("[mesh-audit] FAILED:", err);
  process.exitCode = 1;
}
