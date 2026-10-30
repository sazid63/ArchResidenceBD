import { readFileSync, writeFileSync } from "fs";
import { inflateSync } from "zlib";

function analyzePNG(path: string): void {
  const buf = readFileSync(path);
  let p = 8, w = 0, h = 0;
  let idat = Buffer.alloc(0);
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    if (type === "IHDR") { w = buf.readUInt32BE(p + 16); h = buf.readUInt32BE(p + 20); }
    if (type === "IDAT") idat = Buffer.concat([idat, buf.slice(p + 8, p + 8 + len)]);
    p += 12 + len;
  }
  const raw = inflateSync(idat);
  // Count non-background pixels
  let colored = 0, total = 0;
  const hist = new Map<string, number>();
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4);
    const filter = raw[row];
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      const r = raw[i], g = raw[i + 1], b = raw[i + 2];
      total++;
      if (r === 250 && g === 246 && b === 240) continue; // background
      colored++;
      const key = `${r},${g},${b}`;
      hist.set(key, (hist.get(key) || 0) + 1);
    }
  }
  console.log(`${path}: ${w}x${h}, ${colored}/${total} colored pixels (${(100 * colored / total).toFixed(1)}%)`);
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  top.forEach(([k, n]) => console.log(`    rgb(${k}): ${n} px`));
}

for (const f of ["user_test_3story_iso.png", "user_test_3story_front.png", "user_test_3story_top.png"]) {
  analyzePNG(f);
}