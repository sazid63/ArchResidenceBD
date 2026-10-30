import { readFileSync } from "fs";
import { inflateSync } from "zlib";

// Sample only a grid of ~2000 pixels per image (fast)
function sample(path: string): void {
  const buf = readFileSync(path);
  let p = 8, w = 0, h = 0;
  const idatParts: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    if (type === "IHDR") { w = buf.readUInt32BE(p + 16); h = buf.readUInt32BE(p + 20); }
    if (type === "IDAT") idatParts.push(buf.slice(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idatParts));
  let colored = 0, total = 0;
  const colors = new Map<string, number>();
  const stepX = Math.max(1, Math.floor(w / 40));
  const stepY = Math.max(1, Math.floor(h / 40));
  for (let y = 0; y < h; y += stepY) {
    const row = y * (1 + w * 4);
    for (let x = 0; x < w; x += stepX) {
      const i = row + 1 + x * 4;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];
      total++;
      const key = `${r},${g},${b}`;
      if (key !== "250,246,240") {
        colored++;
        colors.set(key, (colors.get(key) || 0) + 1);
      }
    }
  }
  console.log(`${path}: ${w}x${h} — ${(100 * colored / total).toFixed(0)}% of sampled grid is building`);
  [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([c, n]) => console.log(`    rgb(${c}) x${n}`));
}

for (const f of process.argv.slice(2)) sample(f);
