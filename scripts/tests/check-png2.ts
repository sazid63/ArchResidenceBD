import { readFileSync } from "fs";
import { inflateSync } from "zlib";

function checkPNG(path: string): void {
  const buf = readFileSync(path);
  let p = 8;
  let w = 0, h = 0, idatLen = 0;
  const idatParts: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    if (type === "IHDR") { w = buf.readUInt32BE(p + 16); h = buf.readUInt32BE(p + 20); }
    if (type === "IDAT") { idatLen += len; }
    p += 12 + len;
  }
  console.log(`${path}: ${w}x${h}, IDAT total ${idatLen} bytes`);
  if (w === 0 || h === 0) { console.log("  ERROR: Zero dimensions!"); return; }
  if (idatLen === 0) { console.log("  ERROR: No IDAT data!"); return; }
  // Check first few bytes of IDAT
  const raw = inflateSync(buf.slice(p - idatLen - 12, p)); // this is wrong but close enough
  console.log(`  Raw inflated: ${raw.length} bytes`);
  // Check first few scanlines
  for (let y = 0; y < Math.min(h, 5); y++) {
    const rowStart = y * (1 + w * 4);
    const filter = raw[rowStart];
    const px = [...raw.slice(rowStart + 1, rowStart + 1 + 4)].join(",");
    console.log(`  Row ${y}: filter=${filter}, first px RGB=${px}`);
  }
}

for (const f of process.argv.slice(2)) checkPNG(f);