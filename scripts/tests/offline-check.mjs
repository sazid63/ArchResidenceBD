/**
 * Offline check of the production build (static, no browser): after `npm run build`, everything the app
 * needs to open without a network must be in the service worker's precache, and the worker must be real.
 *
 *   node scripts/tests/offline-check.mjs
 *
 * Checks: dist/sw.js has a build version and a precache list; every file under dist/ is in the list;
 * every asset index.html names, every file the entry script imports lazily, every icon and the manifest
 * itself are in the list; the manifest's icons exist; the CSP in tauri.conf.json allows what the build uses.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist");
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

if (!existsSync(join(dist, "sw.js"))) throw new Error("dist/sw.js is missing: run `npm run build` first");
const sw = readFileSync(join(dist, "sw.js"), "utf8");
const version = /const VERSION = ("[^"]+")/.exec(sw)?.[1];
const list = JSON.parse(/const PRECACHE = (\[[^\n]*\]);/.exec(sw)?.[1] ?? "[]");
check(!!version && version !== '"dev"', `service worker carries a build version ${version}`);
check(list.length > 10, `service worker precaches ${list.length} files`);
check(list.includes("/") && list.includes("/index.html"), "the app shell (/ and /index.html) is precached");

const files = walk(dist).map((p) => "/" + relative(dist, p).split("\\").join("/")).filter((f) => f !== "/sw.js" && !f.endsWith(".map"));
const missing = files.filter((f) => !list.includes(f));
check(missing.length === 0, `every built file is precached${missing.length ? ": missing " + missing.slice(0, 5).join(", ") : ""}`);
const ghosts = list.filter((f) => f !== "/" && !existsSync(join(dist, f.slice(1))));
check(ghosts.length === 0, `no precached file is missing from dist${ghosts.length ? ": " + ghosts.slice(0, 5).join(", ") : ""}`);

const html = readFileSync(join(dist, "index.html"), "utf8");
check(!/<script(?![^>]*\bsrc=)/.test(html), "index.html has no inline script (the desktop CSP allows none)");
const named = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
const unnamed = named.filter((f) => !list.includes(f));
check(unnamed.length === 0, `everything index.html names is precached (${named.length} references)${unnamed.length ? ": " + unnamed.join(", ") : ""}`);

// Lazy chunks: every "./Name-hash.js" the built scripts import must be a built file.
const chunks = files.filter((f) => f.endsWith(".js"));
const lazyRefs = new Set();
for (const f of chunks) for (const m of readFileSync(join(dist, f.slice(1)), "utf8").matchAll(/["'`]\.\/([\w.-]+\.(?:js|css|json))["'`]/g)) lazyRefs.add("/assets/" + m[1]);
const unreachable = [...lazyRefs].filter((f) => !list.includes(f));
check(unreachable.length === 0, `every lazily imported chunk is precached (${lazyRefs.size} references)${unreachable.length ? ": " + unreachable.slice(0, 5).join(", ") : ""}`);

const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const iconMissing = manifest.icons.filter((i) => !existsSync(join(dist, i.src.slice(1))));
check(iconMissing.length === 0, `every manifest icon exists (${manifest.icons.length})${iconMissing.length ? ": " + iconMissing.map((i) => i.src).join(", ") : ""}`);
check(manifest.icons.some((i) => i.purpose === "maskable") && manifest.icons.some((i) => i.sizes === "192x192"), "manifest has a 192 px icon and a maskable icon");
check(!/\bAI\b/.test(manifest.description + manifest.name), "manifest makes no AI claim");

const tauri = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const csp = tauri.app.security.csp;
check(typeof csp === "string" && /default-src 'self'/.test(csp) && !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), "desktop CSP is set, same-origin, no eval, no inline scripts");
check(tauri.build.devUrl === "http://localhost:3000" && tauri.build.beforeDevCommand === "npm run dev", "tauri dev URL and command match `npm run dev`");
check(tauri.bundle.icon.every((i) => existsSync(join(root, "src-tauri", i))), "every desktop icon in tauri.conf.json exists");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\noffline check passed");
