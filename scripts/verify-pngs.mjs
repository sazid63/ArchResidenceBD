// Temporary verification: validate audit PNG structure + pixel sanity,
// and aggregate overlap-pair categories from report.json.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./audit-out/", import.meta.url));
const names = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());

// crc32 table
const T = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  T[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const problems = [];
let total = 0;
for (const d of names) {
  for (const f of ["iso1.png", "iso2.png", "top.png", "issues.png"]) {
    total++;
    const buf = readFileSync(join(root, d, f));
    if (!buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      problems.push(`${d}/${f}: bad signature`);
      continue;
    }
    let off = 8;
    let w = 0, h = 0;
    const idat = [];
    let iend = false;
    while (off < buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      const data = buf.subarray(off + 8, off + 8 + len);
      const crc = buf.readUInt32BE(off + 8 + len);
      const expect = crc32(buf.subarray(off + 4, off + 8 + len));
      if (crc !== expect) problems.push(`${d}/${f}: ${type} CRC mismatch`);
      if (type === "IHDR") {
        w = data.readUInt32BE(0);
        h = data.readUInt32BE(4);
      }
      if (type === "IDAT") idat.push(data);
      if (type === "IEND") iend = true;
      off += 12 + len;
    }
    if (w !== 1200 || h !== 900) problems.push(`${d}/${f}: dims ${w}x${h}`);
    if (!iend) problems.push(`${d}/${f}: missing IEND`);
    const raw = inflateSync(Buffer.concat(idat));
    if (raw.length !== (w * 3 + 1) * h) problems.push(`${d}/${f}: raw size ${raw.length} vs ${(w * 3 + 1) * h}`);
    let nonBg = 0, red = 0;
    for (let y = 0; y < h; y++) {
      const rowStart = y * (w * 3 + 1);
      if (raw[rowStart] !== 0) problems.push(`${d}/${f}: filter byte row ${y} = ${raw[rowStart]}`);
      for (let x = 0; x < w; x++) {
        const i = rowStart + 1 + x * 3;
        const r = raw[i], g = raw[i + 1], b = raw[i + 2];
        if (r !== 250 || g !== 246 || b !== 240) nonBg++;
        if (r > 190 && g < 70 && b < 70) red++;
      }
    }
    const pct = ((nonBg / (w * h)) * 100).toFixed(1);
    if (nonBg < 2000) problems.push(`${d}/${f}: suspiciously few non-bg px (${nonBg})`);
    if (f === "issues" && red < 500) problems.push(`${d}/${f}: suspiciously few red px (${red})`);
    if (f === "iso1" && red > 20000) problems.push(`${d}/${f}: iso1 unexpectedly red (${red})`);
    if (f === "issues") console.log(`${d}/issues: coverage=${pct}% red=${red}`);
  }
}
console.log(`checked ${total} PNGs; problems: ${problems.length ? problems.slice(0, 40).join("\n") : "NONE"}`);

// Aggregate overlap categories from report.json
const report = JSON.parse(readFileSync(join(root, "report.json"), "utf8"));
const cat = new Map();
for (const c of report.cases) {
  for (const o of c.issues.overlaps) {
    const key = [o.kindA, o.kindB].sort().join(" x ");
    const e = cat.get(key) || { n: 0, mm3: 0 };
    e.n++;
    e.mm3 += o.overlapMm3;
    cat.set(key, e);
  }
}
const sorted = [...cat.entries()].sort((a, b) => b[1].n - a[1].n);
console.log("\nOverlap pair categories (kind x kind), by pair count:");
for (const [k, v] of sorted.slice(0, 18)) {
  console.log(`  ${k.padEnd(28)} pairs=${String(v.n).padStart(7)}  total=${(v.mm3 / 1e9).toFixed(1)} m3`);
}
const zf = new Map();
for (const c of report.cases) {
  for (const z of c.issues.zFights) {
    const key = [z.kindA, z.kindB].sort().join(" x ");
    zf.set(key, (zf.get(key) || 0) + 1);
  }
}
console.log("\nZ-fight pair categories (top 12):");
for (const [k, n] of [...zf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${k.padEnd(28)} pairs=${n}`);
}
