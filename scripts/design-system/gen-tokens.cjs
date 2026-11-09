// Builds project/tokens.json from the app's src/theme/tokens.css (the single source).
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..", "..");
const css = fs.readFileSync(path.join(REPO, "src/theme/tokens.css"), "utf8").replace(/\r\n/g, "\n");

function block(selector) {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error("no block " + selector);
  const body = css.slice(start, css.indexOf("\n}", start));
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const hc = block(':root[data-theme="dark"][data-high-contrast="true"]');

const COLOR_USAGE = {
  paper: "App background. Pure white in light; deep blue-grey in dark.",
  surface: "Cards, panels, modals. Same as paper in light: cards are separated by a line border, not by tint.",
  "surface-2": "Sidebar, hover fills, recessed tiles (stats, callouts, tab track, table header).",
  "surface-3": "Pressed and stronger recess; slider track.",
  ink: "Primary text and headings on paper, surface and surface-2 (16:1 light).",
  "ink-soft": "Secondary text, subtitles, labels, inactive nav rows (7.3:1 light).",
  "ink-faint": "Captions, hints, icons in nav rows, section labels. Still 4.5:1+ on paper and surface-2 in both themes.",
  line: "Hairline borders of cards, tables and dividers.",
  "line-strong": "Input borders, the soft (secondary) button outline, dashed empty states, hover border of interactive cards.",
  primary: "Monsoon indigo. Actions only: the primary button, the New project button, focus ring, slider fill, selected states. Never used for a result.",
  "primary-hover": "Hover fill of a primary button.",
  "primary-active": "Pressed fill of a primary button.",
  "primary-soft": "Tint for the active nav row, selected rows, chip--primary and text selection.",
  "primary-ink": "Text on primary-soft and links on surface (8:1 light).",
  "on-primary": "Text and icons on a primary fill (white in light, deep indigo in dark).",
  sky: "Info blue mark (dots, chart fills). Status: gathering info. Cost: labour.",
  "sky-soft": "Fill behind sky-ink (info chips, info callouts).",
  "sky-ink": "Text on sky-soft.",
  sage: "Pass green mark. Status: designed. Cost: material. Alias: ok.",
  "sage-soft": "Fill behind sage-ink (Pass result chips, ok callouts).",
  "sage-ink": "Text on sage-soft.",
  lavender: "Categorical violet. Status: drafted. Cost: subcontract.",
  "lavender-soft": "Fill behind lavender-ink.",
  "lavender-ink": "Text on lavender-soft.",
  amber: "Warning amber mark. Status: stale (needs update). Cost: machinery. Alias: warn.",
  "amber-soft": "Fill behind amber-ink (Check result chips, warning callouts).",
  "amber-ink": "Text on amber-soft.",
  blush: "Fail red mark. Alias: bad. The danger button fill.",
  "blush-soft": "Fill behind blush-ink (Fail result chips, error callouts).",
  "blush-ink": "Text on blush-soft.",
  mint: "Categorical teal. Phase colour family for utilities.",
  "mint-soft": "Fill behind mint-ink.",
  "mint-ink": "Text on mint-soft.",
  "phase-site": "Construction phase: site and excavation (earth brown). 3D colour-by-phase, progress bars, charts.",
  "phase-foundation": "Construction phase: foundation (concrete grey).",
  "phase-floor": "Construction phase: floors (the primary indigo).",
  "phase-roof": "Construction phase: roof (amber).",
  "phase-utility": "Construction phase: utilities (teal).",
  "viewport-bg": "Background of the 3D viewport (read by the WebGL viewer, so it must stay #rrggbb).",
  "viewport-ground": "Ground plane in the 3D viewport.",
};

const tokens = [];
for (const [name, usage] of Object.entries(COLOR_USAGE)) {
  const v = (src) => {
    const raw = src[name];
    if (!raw) return undefined;
    if (raw.startsWith("var(--")) return "{" + raw.slice(6, -1) + "}";
    return raw;
  };
  const value = {};
  if (v(light)) value.light = v(light);
  if (v(dark)) value.dark = v(dark);
  if (v(hc)) value["high-contrast"] = v(hc);
  if (!value.light) throw new Error("no light value for " + name);
  tokens.push({ name, value: Object.keys(value).length === 1 ? value.light : value, usage });
}
// Semantic aliases (defined once for all themes).
const ALIASES = [
  ["ok", "sage", "Result: pass. Use instead of the tone name in new code."],
  ["ok-soft", "sage-soft", "Fill of a pass result."],
  ["ok-ink", "sage-ink", "Text of a pass result."],
  ["warn", "amber", "Result: check / warning."],
  ["warn-soft", "amber-soft", "Fill of a warning result."],
  ["warn-ink", "amber-ink", "Text of a warning result."],
  ["bad", "blush", "Result: fail; destructive actions."],
  ["bad-soft", "blush-soft", "Fill of a fail result."],
  ["bad-ink", "blush-ink", "Text of a fail result."],
  ["info", "sky", "Neutral information."],
  ["info-soft", "sky-soft", "Fill of an info note."],
  ["info-ink", "sky-ink", "Text of an info note."],
  ["border", "line", "Legacy alias of line, still used by many screens."],
  ["surface-sunken", "surface-3", "Legacy alias of surface-3."],
  ["surface-active", "primary-soft", "Legacy alias: selected rows."],
  ["muted", "ink-soft", "Legacy alias of ink-soft."],
];
for (const [name, target, usage] of ALIASES) tokens.push({ name, value: `{${target}}`, usage });

const px = (n) => light[n];
const out = {
  name: "ArchResidence",
  version: 3,
  meta: {
    source: "github",
    repo: "sazid63/ArchResidenceBD",
    ref: "v3 (Civic style, Monsoon indigo)",
    package: ".",
    paths: { tokens: ["src/theme/tokens.css", "src/theme/tokens.ts", "src/theme/base.css"], fonts: ["public/assets/fonts"], assets: ["src-tauri/icons"] },
    components: {
      Button: "src/ui/kit.tsx", Card: "src/ui/kit.tsx", Chip: "src/ui/kit.tsx", Badge: "src/ui/kit.tsx", StatusBadge: "src/ui/kit.tsx",
      Dot: "src/ui/kit.tsx", StatusDot: "src/ui/kit.tsx", Callout: "src/ui/kit.tsx", Stat: "src/ui/kit.tsx", PageHeader: "src/ui/kit.tsx",
      ResultChip: "src/ui/kit.tsx", Value: "src/ui/kit.tsx", SegmentedControl: "src/ui/kit.tsx", EmptyState: "src/ui/kit.tsx", Toast: "src/ui/kit.tsx",
      Tabs: "src/ui/kit.css", Slider: "src/ui/kit.css", Modal: "src/ui/kit.css",
    },
    synced: new Date().toISOString().slice(0, 10), // the day of the sync, not a fixed date
  },
  color: {
    themes: [
      { id: "light", name: "Light" },
      { id: "dark", name: "Dark" },
      { id: "high-contrast", name: "High contrast" },
    ],
    tokens,
  },
  type: {
    fonts: [
      ...[400, 500, 600, 700].map((w) => ({ family: "Noto Sans", file: `fonts/noto-sans-latin-${w}-normal.woff2`, weight: String(w), style: "normal" })),
      ...[400, 500, 600, 700].map((w) => ({ family: "Noto Sans Bengali", file: `fonts/noto-sans-bengali-bengali-${w}-normal.woff2`, weight: String(w), style: "normal" })),
    ],
    families: {
      ui: '"Noto Sans", "Noto Sans Bengali", system-ui, -apple-system, "Segoe UI", "Nirmala UI", sans-serif',
      mono: 'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, "Liberation Mono", monospace',
    },
    groups: [
      { name: "Headings", family: "ui", styles: [
        { name: "h1", fontSize: px("fs-3xl"), lineHeight: 1.25, fontWeight: 600, letterSpacing: "-0.01em", usage: "Page title (PageHeader). 24px under 900px.", sample: "Code compliance" },
        { name: "h2", fontSize: px("fs-2xl"), lineHeight: 1.3, fontWeight: 600, usage: "Section titles.", sample: "Bill of quantities" },
        { name: "h3", fontSize: px("fs-lg"), lineHeight: 1.35, fontWeight: 600, usage: "Card titles, settings groups.", sample: "Foundation phase" },
        { name: "h4", fontSize: px("fs-md"), lineHeight: 1.4, fontWeight: 600, usage: "Group labels inside cards.", sample: "Column schedule" },
      ] },
      { name: "Text", family: "ui", styles: [
        { name: "body", fontSize: px("fs-md"), lineHeight: 1.55, fontWeight: 400, usage: "Default UI text. Bangla runs get line-height 1.65.", sample: "Plot is 4 katha with a 6 m front road." },
        { name: "body-bn", fontSize: px("fs-md"), lineHeight: 1.65, fontWeight: 400, usage: "Bangla body text: never below 14px.", sample: "প্লট ৪ কাঠা, সামনের রাস্তা ৬ মিটার।" },
        { name: "small", fontSize: px("fs-sm"), lineHeight: 1.5, fontWeight: 400, usage: "Subtitles, table cells, callout body, tabs and chips at 500.", sample: "RAJUK 2008 · FAR 3.5" },
        { name: "caption", fontSize: px("fs-xs"), lineHeight: 1.45, fontWeight: 500, usage: "Stat labels, nav section labels, captions. Badges and result chips at 600.", sample: "Rules passed" },
        { name: "button", fontSize: px("fs-md"), lineHeight: 1.3, fontWeight: 500, usage: "Button and nav labels.", sample: "Fix layout" },
      ] },
      { name: "Data", family: "ui", styles: [
        { name: "stat-value", fontSize: px("fs-xl"), lineHeight: 1.3, fontWeight: 600, usage: "Stat figures and totals, tabular digits.", sample: "৳ ২.৪ কোটি" },
        { name: "code", fontSize: "13px", lineHeight: 1.5, fontWeight: 400, family: "mono", usage: "Real code and file names only. Figures stay in the UI font with tabular digits.", sample: "spec/rules/rajuk-2008.yaml" },
      ] },
    ],
  },
  spacing: { tokens: [
    ["s-1", "Icon-to-label gaps, tab track gap."], ["s-2", "Row gaps, button groups."], ["s-3", "Stat and callout padding, stack gaps in cards."],
    ["s-4", "Page-head gap, settings rows."], ["s-5", "Card and modal padding."], ["s-6", "Section gaps."], ["s-8", "Page padding, empty-state padding."],
    ["s-10", "Large layout gutters."], ["s-12", "Page bottom padding."],
  ].map(([n, u]) => ({ name: n, value: light[n], usage: u })) },
  radius: { note: "Soft, not bubbly: 10px on controls, 14px on cards, pills only for chips, badges and dots.", tokens: [
    ["r-sm", "Tabs and segmented items inside their track, small inner elements, icon buttons."],
    ["r-md", "Buttons, inputs, nav rows, stats, callouts, the tab track."],
    ["r-lg", "Cards, tables, modals, empty states."],
    ["r-xl", "Large hero panels and the cover."],
    ["r-pill", "Chips, badges, result chips, dots, scrollbars."],
  ].map(([n, u]) => ({ name: n, value: light[n], usage: u })) },
  shadow: { note: "Barely there: borders separate surfaces; shadows only lift interactive cards, the active tab and overlays.", tokens: [
    { name: "shadow-sm", value: { light: light["shadow-sm"], dark: dark["shadow-sm"], "high-contrast": hc["shadow-sm"] }, usage: "The active tab or segment." },
    { name: "shadow-md", value: { light: light["shadow-md"], dark: dark["shadow-md"], "high-contrast": hc["shadow-md"] }, usage: "Hover on interactive cards." },
    { name: "shadow-lg", value: { light: light["shadow-lg"], dark: dark["shadow-lg"], "high-contrast": hc["shadow-lg"] }, usage: "Modals, toasts, the mobile drawer." },
  ] },
  fontSize: { note: "The --fs-* scale components reference directly.", tokens: [
    ["fs-xs", "Captions, badges, stat labels."], ["fs-sm", "Tabs, chips, table cells, subtitles."], ["fs-md", "Body, buttons, nav (base)."],
    ["fs-lg", "h3, large buttons."], ["fs-xl", "Stat values, modal titles."], ["fs-2xl", "h2."], ["fs-3xl", "h1."],
  ].map(([n, u]) => ({ name: n, value: light[n], usage: u })) },
};
const dest = path.join(__dirname, "out", "project", "tokens.json");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
console.log("tokens:", tokens.length, "colors;", fs.statSync(dest).size, "bytes");
