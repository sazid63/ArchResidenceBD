// Builds the design system's components/bundle.js and bundle.css from the app repo (v3 kit).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..").split(String.fromCharCode(92)).join("/");
const OUT = join(here, "out", "project", "components");
mkdirSync(OUT, { recursive: true });

const names = ["Button", "Card", "Chip", "Badge", "StatusBadge", "Dot", "StatusDot", "Callout", "Stat", "PageHeader",
  "ResultChip", "Value", "SegmentedControl", "EmptyState", "Toast", "Tabs", "Slider", "Modal"];

writeFileSync(join(here, "out", "entry.ts"), `export * from "${REPO}/src/ui/kit";
export { Tabs, Slider, Modal } from "../extras";
export { statusTone, phaseTone, costTone } from "${REPO}/src/theme/tokens";
`);

// react / react-dom / jsx runtime → the page's globals (React 18 there; the kit uses no 19-only API).
const globals = {
  name: "globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => ({ path: a.path, namespace: "g" }));
    b.onLoad({ filter: /.*/, namespace: "g" }, (a) => {
      if (a.path === "react/jsx-runtime" || a.path === "react/jsx-dev-runtime") {
        return { contents: `var R=window.React;function j(t,p,k){var o={};for(var n in p)if(n!=="children")o[n]=p[n];if(k!==undefined)o.key=k;var c=p&&p.children;return c===undefined?R.createElement(t,o):Array.isArray(c)?R.createElement.apply(null,[t,o].concat(c)):R.createElement(t,o,c);}module.exports={jsx:j,jsxs:j,jsxDEV:j,Fragment:R.Fragment};`, loader: "js" };
      }
      return { contents: `module.exports=${a.path.startsWith("react-dom") ? "window.ReactDOM" : "window.React"};`, loader: "js" };
    });
    b.onResolve({ filter: /\.css$/ }, (a) => ({ path: a.path, namespace: "nocss" }));
    b.onLoad({ filter: /.*/, namespace: "nocss" }, () => ({ contents: "", loader: "js" }));
  },
};

await build({
  entryPoints: [join(here, "out", "entry.ts")], bundle: true, format: "iife", globalName: "ArchRes", minify: true,
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [globals],
  outfile: join(here, "out", "bundle.raw.js"), target: "es2019", charset: "utf8", absWorkingDir: here,
});
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: "ArchRes", components: names.map((name) => ({ name })) })} */\n`;
let js = readFileSync(join(here, "out", "bundle.raw.js"), "utf8").replace(/^var ArchRes=/, "window.ArchRes=");
if (/<\/script|<!--/i.test(js)) throw new Error("forbidden sequence in bundle");
writeFileSync(join(OUT, "bundle.js"), header + js);

// Stylesheet: motion tokens, the shared base and layout bits, then the kit exactly as the app ships it.
const kit = readFileSync(`${REPO}/src/ui/kit.css`, "utf8").replace(/\r\n/g, "\n");
const css = `/* ArchResidence UI kit (v3, Civic style). Built from src/ui/kit.css plus the shared bits of
   src/theme/base.css and src/app.css. Motion and semantic aliases live here: the token file has
   no motion family, and the aliases (--ok, --warn, --bad, --info) are also in tokens.json. */
:root {
  --dur-fast: 120ms;
  --dur: 160ms;
  --dur-slow: 220ms;
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--primary) 40%, transparent);
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
:lang(bn) { line-height: 1.65; }
h1, h2, h3, h4, h5, p { margin: 0; }
h1 { font-size: var(--fs-3xl); font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; }
h2 { font-size: var(--fs-2xl); font-weight: 600; line-height: 1.3; }
h3 { font-size: var(--fs-lg); font-weight: 600; line-height: 1.35; }
button { font: inherit; color: inherit; cursor: pointer; border: none; background: none; border-radius: var(--r-md); }
input, select, textarea { font: inherit; color: inherit; border-radius: var(--r-md); }
:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
::selection { background: var(--primary-soft); color: var(--primary-ink); }
code, kbd, pre { font-family: var(--font-mono); font-size: 0.92em; }

/* ---- Layout helpers (app.css) ---- */
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-4); padding-bottom: var(--s-2); }
.page-head .sub { color: var(--ink-soft); margin-top: 2px; font-size: var(--fs-sm); }
.row { display: flex; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
.stack { display: flex; flex-direction: column; gap: var(--s-4); }
.grow { flex: 1; min-width: 0; }
.muted { color: var(--ink-soft); }
.faint { color: var(--ink-faint); }
.small { font-size: var(--fs-xs); }
.table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--fs-sm); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; }
.table thead th { background: var(--surface-2); color: var(--ink-soft); font-weight: 600; font-size: var(--fs-xs); text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); }
.table td { padding: 9px 12px; border-bottom: 1px solid var(--line); }
.table tbody tr:last-child td { border-bottom: none; }
.table .num { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) {
  .page-head { flex-direction: column; align-items: stretch; }
  .page-head h1 { font-size: 1.5rem; }
}

${kit}`;
writeFileSync(join(OUT, "bundle.css"), css);
console.log("bundle.js", (header + js).length, "bytes; bundle.css", css.length, "bytes");
