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
  /** The script index.html loads first: React, the shell, i18n, the project store. Measured 135 KB at M7-1, 179 KB after phase B (rules, lift, parking and torsion code reach the shell); the rule packs (RAJUK 23 KB, flow book 13 KB, BNBC 19 KB gzip as YAML text) and the engine that reads them are in the shell because the project store, the plan picker and the interview all use them synchronously. Budget 190 KB; a lazy pack loader would make project creation async and is not worth it for an offline app (the service worker caches everything). */
  entryJs: 190 * KB,
  /** The entry stylesheet. Measured 9 KB. */
  entryCss: 14 * KB,
  /** Any one lazy chunk (a screen or a shared engine). Largest at M7-1: the structural analysis, 34 KB. */
  chunkJs: 50 * KB,
  /** The design worker (structure, bars and BOQ engine in its own file, loaded when a design screen opens). 68 KB at the worker change (it carries its own copy of the engine and rule packs); off the first-load path. */
  workerJs: 80 * KB,
  /** The PDF libraries (pdf-lib, fontkit for the Bangla font, pako), loaded only when a PDF is made: each file is allowed this much. */
  pdfChunkJs: 340 * KB,
  /** All JavaScript together. Measured 325 KB at M7-1; 823 KB with the PDF libraries (P1-3), which load on demand. */
  totalJs: 960 * KB,
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
const isWorker = (f) => f.startsWith("assets/designWorker-");
const isPdfLib = (f) => /^assets\/(fontkit\.es|es|pako)-/.test(f);
for (const s of sizes.filter((s) => s.file !== entryJs).slice(0, 4)) check(s.file.replace(/-[\w-]{8}\.js$/, ".js"), s.gzip, isPdfLib(s.file) ? BUDGET.pdfChunkJs : isWorker(s.file) ? BUDGET.workerJs : BUDGET.chunkJs);
const biggest = sizes.find((s) => s.file !== entryJs && !isPdfLib(s.file) && !isWorker(s.file));
if (biggest && biggest.gzip > BUDGET.chunkJs) failures.push(biggest.file);
check(`all JavaScript (${js.length} files)`, total, BUDGET.totalJs);

if (failures.length) {
  console.error(`\nBundle budget exceeded: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nbundle sizes within budget");
