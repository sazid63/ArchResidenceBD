/**
 * Renders a 5-storey Dhaka residential building as PNG screenshots.
 * Reuses the same software renderer logic from mesh-audit.ts.
 * Zero external dependencies — Node builtins only.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { getColorForObject } from "../../src/cad/viewer.js";
import type { MeshDocument } from "../../src/cad/mesh.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "planning");
mkdirSync(OUT, { recursive: true });
const W = 1600, H = 1000;

// ---- Math helpers ----
type Vec3 = [number, number, number];
type Cam = {
  ex: number; ey: number; ez: number;
  rx: number; ry: number; rz: number;
  ux: number; uy: number; uz: number;
  fx: number; fy: number; fz: number;
  sxScale: number; syScale: number; offX: number; offY: number;
  ortho: boolean; scale: number;
};

function norm3(x: number, y: number, z: number): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const KEY_LIGHT = norm3(0.45, 0.65, 0.75);
const FILL_LIGHT = norm3(-0.4, -0.3, 0.5);
const RED: Vec3 = [1, 0, 0];

function frameBBox(objects: MeshDocument["objects"]): { center: Vec3; span3: number; spanXY: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const o of objects) {
    for (let i = 0; i < 3; i++) {
      minX = Math.min(minX, o.bboxMinMm[i]); minY = Math.min(minY, o.bboxMinMm[i]); minZ = Math.min(minZ, o.bboxMinMm[i]);
      maxX = Math.max(maxX, o.bboxMaxMm[i]); maxY = Math.max(maxY, o.bboxMaxMm[i]); maxZ = Math.max(maxZ, o.bboxMaxMm[i]);
    }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  return { center: [cx, cy, cz], span3: span, spanXY: Math.max(maxX - minX, maxY - minY) };
}

function isoCamera(azimuth: number, center: Vec3, span3: number, w: number, h: number): Cam {
  const el = 0.42, d = span3 * 1.5;
  const ce = Math.cos(el), se = Math.sin(el);
  const fx = -ce * Math.sin(azimuth), fy = ce * Math.cos(azimuth), fz = -se;
  let rx = fy, ry = -fx;
  const rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;
  const ux = ry * fz, uy = -rx * fz, uz = rx * fy - ry * fx;
  const proj = (0.5 * h) / Math.tan(0.85 / 2);
  return {
    ex: center[0] - fx * d, ey: center[1] - fy * d, ez: center[2] - fz * d,
    rx, ry, rz: 0, ux, uy, uz, fx, fy, fz,
    sxScale: proj, syScale: proj, offX: w * 0.5, offY: h * 0.5,
    ortho: false, scale: 1,
  };
}

function topCamera(center: Vec3, spanXY: number, w: number, h: number): Cam {
  const scale = (Math.min(w, h) * 0.85) / Math.max(spanXY, 1);
  return {
    ex: center[0], ey: center[1], ez: center[2] + spanXY * 4,
    rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0,
    fx: 0, fy: 0, fz: -1,
    sxScale: 1, syScale: 1,
    offX: w * 0.5 - center[0] * scale, offY: h * 0.5 - center[1] * scale,
    ortho: true, scale,
  };
}

function project(cam: Cam, vx: number, vy: number, vz: number): [number, number, number] | null {
  if (cam.ortho) return [vx * cam.scale + cam.offX, vy * cam.scale + cam.offY, -vz];
  const dx = vx - cam.ex, dy = vy - cam.ey, dz = vz - cam.ez;
  const zv = dx * cam.fx + dy * cam.fy + dz * cam.fz;
  if (zv <= 1) return null;
  const xv = dx * cam.rx + dy * cam.ry + dz * cam.rz;
  const yv = dx * cam.ux + dy * cam.uy + dz * cam.uz;
  const inv = 1 / zv;
  return [xv * cam.sxScale * inv + cam.offX, cam.offY - yv * cam.syScale * inv, zv];
}

function fillTriangle(fb: Uint8Array, depth: Float32Array, w: number, h: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number, r: number, g: number, b: number): void {
  const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (denom === 0) return;
  const inv = 1 / denom;
  const a0 = (y1 - y2) * inv, b0 = (x2 - x1) * inv, c0 = (x1 * y2 - x2 * y1) * inv;
  const a1 = (y2 - y0) * inv, b1 = (x0 - x2) * inv, c1 = (x2 * y0 - x0 * y2) * inv;
  const a2 = (y0 - y1) * inv, b2 = (x1 - x0) * inv, c2 = (x0 * y1 - x1 * y0) * inv;
  const dz0 = z0 - z2, dz1 = z1 - z2, dz = a0 * dz0 + a1 * dz1;
  const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxx = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
  const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxy = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let py = miny; py <= maxy; py++) {
    let l0 = a0 * minx + b0 * py + c0;
    let l1 = a1 * minx + b1 * py + c1;
    let zz = z2 + dz0 * l0 + dz1 * l1;
    let p = py * w + minx;
    for (let px = minx; px <= maxx; px++, p++) {
      if (l0 >= 0 && l1 >= 0 && l0 + l1 <= 1) {
        if (zz < depth[p]) {
          depth[p] = zz;
          const pi = p * 3;
          fb[pi] = r; fb[pi + 1] = g; fb[pi + 2] = b;
        }
      }
      l0 += a0; l1 += a1; zz += dz;
    }
  }
}

function renderScene(objects: MeshDocument["objects"], cam: Cam, w: number, h: number): Uint8Array {
  const depth = new Float32Array(w * h);
  depth.fill(Infinity);
  const fb = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    fb[i * 3] = 250; fb[i * 3 + 1] = 246; fb[i * 3 + 2] = 240;
  }
  for (const o of objects) {
    const col = getColorForObject(o);
    const pos = o.positions, nrm = o.normals, ind = o.indices;
    for (let t = 0; t < ind.length; t += 3) {
      const i0 = ind[t], i1 = ind[t + 1], i2 = ind[t + 2];
      const p0 = i0 * 3, p1 = i1 * 3, p2 = i2 * 3;
      const nx = nrm[p0], ny = nrm[p0 + 1], nz = nrm[p0 + 2];
      if (nx * (pos[p0] - cam.ex) + ny * (pos[p0 + 1] - cam.ey) + nz * (pos[p0 + 2] - cam.ez) >= 0) continue;
      const l1 = nx * KEY_LIGHT[0] + ny * KEY_LIGHT[1] + nz * KEY_LIGHT[2];
      const l2 = nx * FILL_LIGHT[0] + ny * FILL_LIGHT[1] + nz * FILL_LIGHT[2];
      const shade = Math.min(1.12, 0.52 + 0.48 * Math.max(l1, 0) + 0.35 * Math.max(l2, 0));
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

// ---- PNG encoder ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, "ascii"); out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(fb: Uint8Array, w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const stride = w * 3, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; raw.set(fb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1); }
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw, { level: 1 })), pngChunk("IEND", Buffer.alloc(0))]);
}

// ---- Main ----
const p5 = {
  id: "demo-5story", name: "Dhaka 5-Storey Residential", address: "Mirpur, Dhaka",
  stories: 5, plotSize: 3.5, plotUnit: "katha" as const,
  plotSqm: 234.1, unitsPerFloor: 2, phases: [], designStarted: true,
  createdAt: "", updatedAt: "",
};

const doc = generateBuildingMesh(p5, "final", {
  columnWidthMm: 250, columnDepthMm: 250,
  footingSizeMm: 1800, footingDepthMm: 1600, balconyDepthMm: 1200,
});

const frame = frameBBox(doc.objects);
console.log(`[render] ${doc.objects.length} objects, footprint ${((frame.spanXY)/1000).toFixed(1)}m, height ${((frame.span3)/1000).toFixed(1)}m`);

// Three views
const views: Array<{ name: string; cam: Cam }> = [
  { name: "iso-front", cam: isoCamera(0.9, frame.center, frame.span3, W, H) },
  { name: "iso-side",  cam: isoCamera(4.0, frame.center, frame.span3, W, H) },
  { name: "top-plan",  cam: topCamera(frame.center, frame.spanXY, W, H) },
];

for (const { name, cam } of views) {
  const fb = renderScene(doc.objects, cam, W, H);
  const buf = encodePng(fb, W, H);
  const path = join(OUT, `5story-${name}.png`);
  writeFileSync(path, buf);
  console.log(`[render] saved ${path}  (${buf.length.toLocaleString()} bytes)`);
}

// Summary stats
const counts: Record<string, number> = {};
for (const o of doc.objects) counts[o.kind] = (counts[o.kind] || 0) + 1;
console.log(`[render] objects: ${JSON.stringify(counts)}`);
console.log(`[render] triangles: ${doc.objects.reduce((s, o) => s + o.indices.length / 3, 0)}`);
console.log("DONE");
