/**
 * Pure-Node software 3D renderer for ArchResidenceBD meshes.
 * No WebGL / no canvas — uses Node's built-in zlib to write PNG.
 * Renders the app's real mesh (positions/indices) with the app's real
 * colour palette (getColorForObject) via perspective projection + painter's
 * algorithm (back-to-front triangle fill with per-face Lambert shading).
 *
 * Usage: npx tsx scripts/render-3d.ts
 */
import { writeFileSync } from "fs";
import { deflateSync } from "zlib";
import { createNewProject } from "../src/engine/projectState.js";
import { generateBuildingMesh } from "../src/cad/parametricBuildingGenerator.js";
import { getColorForObject, type Vec3 } from "../src/cad/viewer.js";
import type { MeshDocument } from "../src/cad/mesh.js";

// ---------------------------------------------------------------------------
// PNG writer (RGBA8, no interlace)
// ---------------------------------------------------------------------------
function crc32(buf: Buffer): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function writePNG(path: string, w: number, h: number, rgba: Buffer): void {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // Prepend a filter byte (0) to each scanline
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = deflateSync(raw, { level: 6 });
  writeFileSync(path, Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]));
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function perspective(fovY: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Array(16).fill(0);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = (2 * far * near) / (near - far);
  m[14] = -1;
  return m;
}
function lookAt(eye: V3, target: V3, up: V3): number[] {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  const m = new Array(16).fill(0);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0];
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1];
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
  m[12] = -dot(x, eye); m[13] = -dot(y, eye); m[14] = -dot(z, eye);
  m[15] = 1;
  return m;
}
function mulVec4(m: number[], v: V3): [number, number, number, number] {
  const w = 1;
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * w,
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * w,
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * w,
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * w,
  ];
}
function mulMat4(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
    out[r * 4 + c] = s;
  }
  return out;
}
function projectPoint(mvp: number[], p: V3): [number, number, number] | null {
  const [x, y, z, w] = mulVec4(mvp, p);
  if (w <= 1e-6) return null;
  return [x / w, y / w, z / w];
}

// Scanline triangle fill into an RGBA buffer with a z-buffer.
function fillTri(
  px: number[], py: number[], pz: number[],
  color: number, img: Buffer, zbuf: Float32Array, W: number, H: number,
): void {
  let minX = Math.max(0, Math.floor(Math.min(px[0], px[1], px[2])));
  let maxX = Math.min(W - 1, Math.ceil(Math.max(px[0], px[1], px[2])));
  let minY = Math.max(0, Math.floor(Math.min(py[0], py[1], py[2])));
  let maxY = Math.min(H - 1, Math.ceil(Math.max(py[0], py[1], py[2])));
  const area =
    (px[1] - px[0]) * (py[2] - py[0]) -
    (px[2] - px[0]) * (py[1] - py[0]);
  if (Math.abs(area) < 1e-9) return;
  const invArea = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const bx = x + 0.5, by = y + 0.5;
      const w0 = ((px[1] - bx) * (py[2] - by) - (px[2] - bx) * (py[1] - by)) * invArea;
      const w1 = ((px[2] - bx) * (py[0] - by) - (px[0] - bx) * (py[2] - by)) * invArea;
      const w2 = ((px[0] - bx) * (py[1] - by) - (px[1] - bx) * (py[0] - by)) * invArea;
      if (w0 >= -1e-4 && w1 >= -1e-4 && w2 >= -1e-4) {
        const z = w0 * pz[0] + w1 * pz[1] + w2 * pz[2];
        const idx = y * W + x;
        if (z > zbuf[idx]) {
          zbuf[idx] = z;
          img[idx * 4] = (color >> 16) & 255;
          img[idx * 4 + 1] = (color >> 8) & 255;
          img[idx * 4 + 2] = color & 255;
          img[idx * 4 + 3] = 255;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scene rendering
// ---------------------------------------------------------------------------
interface Face {
  pts: V3[];      // 3 world-space vertices
  n: V3;          // world normal
  color: number;  // rgb
  depth: number;  // eye-space z for sorting
  center: V3;
}

function collectFaces(mesh: MeshDocument, eye: V3): Face[] {
  const faces: Face[] = [];
  for (const o of mesh.objects) {
    const c = getColorForObject(o);
    const rgb = ((c[0] * 255) << 16) | ((c[1] * 255) << 8) | (c[2] * 255);
    const idx = o.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const a = [o.positions[idx[i] * 3], o.positions[idx[i] * 3 + 1], o.positions[idx[i] * 3 + 2]] as V3;
      const b = [o.positions[idx[i + 1] * 3], o.positions[idx[i + 1] * 3 + 1], o.positions[idx[i + 1] * 3 + 2]] as V3;
      const c3 = [o.positions[idx[i + 2] * 3], o.positions[idx[i + 2] * 3 + 1], o.positions[idx[i + 2] * 3 + 2]] as V3;
      const n = norm(cross(sub(b, a), sub(c3, a)));
      // back-face cull
      const viewDir = sub(eye, a);
      if (dot(n, viewDir) <= 0) continue;
      const center = [(a[0] + b[0] + c3[0]) / 3, (a[1] + b[1] + c3[1]) / 3, (a[2] + b[2] + c3[2]) / 3];
      faces.push({ pts: [a, b, c3], n, color: rgb, depth: len(sub(eye, center)), center });
    }
  }
  return faces;
}

function renderView(mesh: MeshDocument, mode: "iso" | "front" | "side" | "top", outPath: string, W: number, H: number): void {
  // Compute scene bounds
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const o of mesh.objects) {
    if (o.kind === "excavation") continue;
    minX = Math.min(minX, o.bboxMinMm[0]); maxX = Math.max(maxX, o.bboxMaxMm[0]);
    minY = Math.min(minY, o.bboxMinMm[1]); maxY = Math.max(maxY, o.bboxMaxMm[1]);
    minZ = Math.min(minZ, o.bboxMinMm[2]); maxZ = Math.max(maxZ, o.bboxMaxMm[2]);
  }
  const target: V3 = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1000);
  const dist = span * (mode === "top" ? 1.15 : 1.65);

  let azimuth = 0, elevation = 0.42;
  if (mode === "iso") { azimuth = 0.85; elevation = 0.42; }
  else if (mode === "front") { azimuth = 0; elevation = 0.05; }
  else if (mode === "side") { azimuth = Math.PI / 2; elevation = 0.05; }
  else if (mode === "top") { azimuth = 0; elevation = 1.52; }

  const eye: V3 = [
    target[0] + dist * Math.cos(elevation) * Math.sin(azimuth),
    target[1] - dist * Math.cos(elevation) * Math.cos(azimuth),
    target[2] + dist * Math.sin(elevation),
  ];

  const fovY = 0.85;
  const aspect = W / H;
  const proj = perspective(fovY, aspect, 50, dist * 6);
  const view = lookAt(eye, target, [0, 0, 1]);
  const mvp = mulMat4(proj, view);

  const img = Buffer.alloc(W * H * 4);
  // Warm paper background matching the app theme
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img[i] = 250; img[i + 1] = 246; img[i + 2] = 240; img[i + 3] = 255;
    }
  }
  const zbuf = new Float32Array(W * H).fill(-Infinity);

  const light = norm([0.45, 0.65, 0.75]);

  const faces = collectFaces(mesh, eye);
  // Sort back-to-front
  faces.sort((a, b) => b.depth - a.depth);

  for (const f of faces) {
    const [a, b, c3] = f.pts;
    const pa = projectPoint(mvp, a);
    const pb = projectPoint(mvp, b);
    const pc = projectPoint(mvp, c3);
    if (!pa || !pb || !pc) continue;
    if (pa[2] < -1 || pa[2] > 1 || pb[2] < -1 || pb[2] > 1 || pc[2] < -1 || pc[2] > 1) continue;
    // NDC -> screen
    const sx = (v: number) => (v * 0.5 + 0.5) * W;
    const sy = (v: number) => (1 - (v * 0.5 + 0.5)) * H;
    // Lambert shading
    const lambert = Math.max(0, dot(norm(f.n), light));
    const shade = 0.52 + 0.48 * lambert;
    const r = Math.min(255, Math.round(((f.color >> 16) & 255) * shade));
    const g = Math.min(255, Math.round(((f.color >> 8) & 255) * shade));
    const bl = Math.min(255, Math.round((f.color & 255) * shade));
    const col = (r << 16) | (g << 8) | bl;
    fillTri(
      [sx(pa[0]), sx(pb[0]), sx(pc[0])],
      [sy(pa[1]), sy(pb[1]), sy(pc[1])],
      [pa[2], pb[2], pc[2]],
      col, img, zbuf, W, H,
    );
  }

  writePNG(outPath, W, H, img);
  console.log(`✓ ${outPath}  (${(img.length / 1024 / 1024).toFixed(1)} MB raw, ${faces.length} faces)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const project = createNewProject({
  name: "Dhanmondi 3-Story Residence",
  address: "Road 11, Dhanmondi, Dhaka",
  stories: 3, plotSize: 5, plotUnit: "katha", unitsPerFloor: 2,
});
project.customization = {
  concreteGrade: 25, steelGrade: 415,
  accessibility: { rampSlope: 12, rampWidthMm: 1200, doorClearWidthMm: 900, wcClearMm: [1500, 1500], tactilePathWidthMm: 300, elevatorRequired: true, elevatorPitMm: 1200, elevatorWellMm: [1400, 1100, 2100], grabRailHeightMm: 700, brailleSignage: true },
  sustainability: { annualRainfallMm: 2000, tankEfficiency: 0.85, roofUValue: 0.8, wallUValue: 1.2, windowUValue: 3.5, coolingLoadFactor: 12, windowToFloorRatioMin: 0.15, daylightFactorTarget: 2.0 },
  fireSafety: { enabled: false, stairWidthMm: 1000, corridorWidthMm: 1200, travelDistanceMaxM: 30, fireRatingHours: 2, sprinklerSystem: false, smokeDetector: true },
  valueEngineering: { enabled: false, autoApply: false },
  constructionMgmt: { enabled: false },
};

const mesh = generateBuildingMesh(project, "final", project.customization);
console.log(`Mesh: ${mesh.objects.length} objects`);
const t0 = Date.now();
renderView(mesh, "iso", "C:/1_SAJID/ArchResidenceBD/repo/user_test_3story_iso.png", 1400, 950);
renderView(mesh, "front", "C:/1_SAJID/ArchResidenceBD/repo/user_test_3story_front.png", 1400, 950);
renderView(mesh, "side", "C:/1_SAJID/ArchResidenceBD/repo/user_test_3story_side.png", 1400, 950);
renderView(mesh, "top", "C:/1_SAJID/ArchResidenceBD/repo/user_test_3story_top.png", 1200, 1200);
console.log(`\nDone in ${Date.now() - t0}ms`);