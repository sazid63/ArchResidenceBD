/**
 * Bundle-size budget (gzip), checked after `npm run build`. Fails when the first-load script or any one
 * chunk grows past its budget, so a heavy import in the shell or a screen shows up in CI, not in a user's browser.
 *
 *   node scripts/check-bundle-size.mjs
 *
 * Raise a budget only on purpose, and say why in the commit.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const KB = 1024;
const BUDGET = {
  /** The script index.html loads first: React, the shell, i18n, the project store. Measured 135 KB at M7-1. */
  entryJs: 160 * KB,
  /** The entry stylesheet. Measured 9 KB. */
  entryCss: 14 * KB,
  /** Any one lazy chunk (a screen or a shared engine). Largest at M7-1: the structural analysis, 34 KB. */
  chunkJs: 50 * KB,
  /** All JavaScript together. Measured 325 KB at M7-1. */
  totalJs: 380 * KB,
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const assets = join(dist, "assets");
const gz = (file) => gzipSync(readFileSync(file)).length;
const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

const html = readFileSync(join(dist, "index.html"), "utf8");
const entryJs = /<script[^>]+src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
const entryCss = /<link[^>]+href="\/(assets\/[^"]+\.css)"/.exec(html)?.[1];
if (!entryJs) throw new Error("dist/index.html has no entry script: run `npm run build` first");

const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
const sizes = js.map((f) => ({ file: `assets/${f}`, gzip: gz(join(assets, f)) })).sort((a, b) => b.gzip - a.gzip);
const total = sizes.reduce((n, s) => n + s.gzip, 0);
const failures = [];
const check = (label, value, limit) => {
  const ok = value <= limit;
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(26)} ${fmt(value).padStart(10)} / ${fmt(limit)}`);
  if (!ok) failures.push(label);
};

check(`entry script`, gz(join(dist, entryJs)), BUDGET.entryJs);
if (entryCss) check(`entry stylesheet`, gz(join(dist, entryCss)), BUDGET.entryCss);
for (const s of sizes.filter((s) => s.file !== entryJs).slice(0, 3)) check(s.file.replace(/-[\w-]{8}\.js$/, ".js"), s.gzip, BUDGET.chunkJs);
const biggest = sizes.find((s) => s.file !== entryJs);
if (biggest && biggest.gzip > BUDGET.chunkJs) failures.push(biggest.file);
check(`all JavaScript (${js.length} files)`, total, BUDGET.totalJs);

if (failures.length) {
  console.error(`\nBundle budget exceeded: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nbundle sizes within budget");
