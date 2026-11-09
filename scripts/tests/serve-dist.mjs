/**
 * Serves dist/ for manual checks of the production build (offline behaviour, the desktop CSP).
 *
 *   node scripts/tests/serve-dist.mjs [port] [--csp]
 *
 * --csp sends the Content-Security-Policy from src-tauri/tauri.conf.json, so a CSP violation in the
 * desktop build shows up in a browser console without installing anything. SPA fallback to index.html.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "dist");
const port = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 4199);
const csp = process.argv.includes("--csp") ? JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8")).app.security.csp : null;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = normalize(join(dist, path));
  if (file !== dist && !file.startsWith(dist + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, "index.html");
  const headers = { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": file.endsWith("sw.js") ? "no-cache" : "max-age=0" };
  if (csp) headers["Content-Security-Policy"] = csp;
  res.writeHead(200, headers).end(readFileSync(file));
}).listen(port, () => console.log(`serving dist on http://localhost:${port}${csp ? " with the desktop CSP" : ""}`));
