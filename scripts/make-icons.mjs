/**
 * Renders the app icon (assets/icon.svg) to PNG with headless Microsoft Edge:
 *   - assets/icon-1024.png        the source for `npx tauri icon assets/icon-1024.png` (desktop icons)
 *   - public/icons/icon-<n>.png   the PWA icons the manifest lists
 *
 * Run once when the icon changes:  node scripts/make-icons.mjs && npx tauri icon assets/icon-1024.png
 * Needs Edge (it ships with Windows). Set EDGE to its path to use another Chromium.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = join(root, "assets", "icon.svg");
const EDGE = process.env.EDGE || ["C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
if (!EDGE) throw new Error("Microsoft Edge not found; set EDGE to a Chromium executable");

const work = mkdtempSync(join(tmpdir(), "archres-icons-"));
const html = join(work, "icon.html");
writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#2e4fa3}img{display:block;width:100vw;height:100vh}</style><img src="${pathToFileURL(svg).href}">`);

function render(size, out) {
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(EDGE, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", `--screenshot=${out}`, `--window-size=${size},${size + 0}`, pathToFileURL(html).href], { stdio: "ignore" });
  console.log("wrote", out);
}

render(1024, join(root, "assets", "icon-1024.png"));
for (const n of [72, 96, 128, 144, 152, 192, 384, 512]) render(n, join(root, "public", "icons", `icon-${n}.png`));
