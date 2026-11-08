// Copies the self-hosted UI fonts from @fontsource into public/assets/fonts.
// Run after changing font packages:  npm run fonts
// The app never loads fonts from the network (offline desktop build).
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "assets", "fonts");
const weights = [400, 500, 600, 700];
const wanted = [
  ...weights.map((w) => ["noto-sans", `noto-sans-latin-${w}-normal.woff2`]),
  ...weights.map((w) => ["noto-sans-bengali", `noto-sans-bengali-bengali-${w}-normal.woff2`]),
];

mkdirSync(out, { recursive: true });
const keep = new Set(wanted.map(([, file]) => file));
for (const file of readdirSync(out)) {
  if (file.endsWith(".woff2") && !keep.has(file)) rmSync(join(out, file));
}
for (const [pkg, file] of wanted) {
  const src = join(root, "node_modules", "@fontsource", pkg, "files", file);
  if (!existsSync(src)) throw new Error(`missing ${src} - run npm ci first`);
  copyFileSync(src, join(out, file));
}
console.log(`fonts: ${wanted.length} files in public/assets/fonts`);
