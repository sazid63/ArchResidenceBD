/**
 * Post-build step: turns public/sw.js into dist/sw.js with the real precache list and a build version.
 * Runs after `vite build` (see the "build" script). Every file under dist/ except the worker itself and
 * source maps is precached, so the app opens offline after the first visit.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(dist)
  .map((p) => relative(dist, p).split("\\").join("/"))
  .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
  .sort();

const hash = createHash("sha256");
for (const f of files) {
  hash.update(f);
  hash.update(readFileSync(join(dist, f)));
}
const version = hash.digest("hex").slice(0, 12);
const precache = ["/", ...files.map((f) => "/" + f)];

let src = readFileSync(join(root, "public", "sw.js"), "utf8");
const swap = (marker, value) => {
  if (!src.includes(marker)) throw new Error(`public/sw.js lost its ${marker} placeholder`);
  src = src.replace(marker, () => value);
};
swap('/*__VERSION__*/ "dev"', JSON.stringify(version));
swap("/*__PRECACHE__*/ []", JSON.stringify(precache));
writeFileSync(join(dist, "sw.js"), src);

const bytes = files.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
console.log(`[build-sw] version ${version}, ${precache.length} files precached (${(bytes / 1048576).toFixed(1)} MB)`);
