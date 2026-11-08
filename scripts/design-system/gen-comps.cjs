// Writes components/<Comp>/README.md and preview.html for the v3 kit.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "out", "project", "components");

const C = {
  Button: {
    group: "Actions", height: 72,
    readme: `# Button

An action button in four weights: \`primary\` (indigo fill), \`soft\` (the default: outlined secondary), \`ghost\` and \`danger\`.

- **Use** \`primary\` once per view for the main forward action ("Fix layout", "Create project"); \`soft\` for other actions; \`ghost\` for tertiary actions in toolbars; \`danger\` only to confirm a destructive step.
- **The consumer provides** \`children\` (a short verb phrase, sentence case) and \`onClick\`; \`disabled\` drops it to 50% opacity.
- Geometry: \`r-md\`, 36px tall (\`small\` 30px, \`large\` 44px), padding 7px 14px, \`fs-md\` at 500. Press moves it down 1px.
- Focus: 2px \`primary\` outline 2px outside.
- **Don't** put two primary buttons side by side, or use \`primary\` to signal success: results use ResultChip.`,
    body: `h('div', { className: 'row' },
      h(A.Button, { variant: 'primary' }, 'Fix layout'),
      h(A.Button, null, 'Export'),
      h(A.Button, { variant: 'ghost' }, 'Cancel'),
      h(A.Button, { variant: 'danger' }, 'Delete project'),
      h(A.Button, { variant: 'primary', disabled: true }, 'Export IFC'))`,
  },
  Card: {
    group: "Layout", height: 150,
    readme: `# Card

The base container: \`surface\` fill, a 1px \`line\` border, \`r-lg\` corners and \`s-5\` padding. No resting shadow.

- **Use** for every grouped block of content. Add \`className="card--interactive"\` when the whole card opens something: on hover its border darkens to \`line-strong\` and it takes \`shadow-md\`.
- **The consumer provides** \`children\`; layout inside is theirs.
- **Don't** nest cards; use a Callout or a Stat for the inner block.`,
    body: `h('div', { className: 'row', style: { alignItems: 'stretch' } },
      h(A.Card, { style: { width: 240 } }, h('h3', null, 'Foundation'), h('p', { className: 'muted', style: { fontSize: 'var(--fs-sm)', marginTop: 6 } }, 'Isolated footings, 1.5 m deep.')),
      h(A.Card, { className: 'card--interactive', style: { width: 240 } }, h('h3', null, 'Mirpur house'), h('p', { className: 'muted', style: { fontSize: 'var(--fs-sm)', marginTop: 6 } }, '4 storeys · 3.5 katha')))`,
  },
  Chip: {
    group: "Actions", height: 64,
    readme: `# Chip

A clickable pill for filters and quick picks, tinted by a tone.

- **Use** for filters ("Material", "Labour") and suggested replies. Tones follow the meaning maps (\`costTone\`, \`statusTone\`); \`neutral\` and \`primary\` for plain choices.
- **The consumer provides** \`children\`, \`tone\` (default \`neutral\`) and \`onClick\`.
- Geometry: \`r-pill\`, padding 5px 12px, \`fs-sm\` at 500; hover draws a border in the text colour.
- **Don't** use a Chip for read-only labels (Badge) or check outcomes (ResultChip).`,
    body: `h('div', { className: 'row' },
      h(A.Chip, null, 'All'), h(A.Chip, { tone: 'primary' }, 'Selected'),
      h(A.Chip, { tone: 'sage' }, 'Material'), h(A.Chip, { tone: 'sky' }, 'Labour'),
      h(A.Chip, { tone: 'amber' }, 'Machinery'), h(A.Chip, { tone: 'lavender' }, 'Subcontract'))`,
  },
  Badge: {
    group: "Data", height: 60,
    readme: `# Badge

A small read-only pill label: \`<tone>-ink\` on \`<tone>-soft\`, 12px at 600. Every tone pair meets 4.5:1 in light and dark.

- **Use** for counts and categories in tables, card headers and the sidebar (\`8/8\`).
- **The consumer provides** \`children\` (one or two words or a count) and \`tone\` (default \`neutral\`).
- For phase status use StatusBadge; for the outcome of a check use ResultChip.`,
    body: `h('div', { className: 'row' },
      h(A.Badge, null, '26 items'), h(A.Badge, { tone: 'primary' }, 'Typical floor'),
      h(A.Badge, { tone: 'sage' }, '8/8'), h(A.Badge, { tone: 'sky' }, 'Labour'),
      h(A.Badge, { tone: 'lavender' }, 'Subcontract'), h(A.Badge, { tone: 'mint' }, 'Utilities'))`,
  },
  Callout: {
    group: "Feedback", height: 200,
    readme: `# Callout

A note inside a screen or card: a \`fs-sm\` title over \`ink-soft\` body, on \`surface-2\` or a result tint.

- **Use** for guidance, assumptions and warnings. \`tone\` colours it by meaning: \`info\`, \`ok\`, \`warn\`, \`bad\`; omit it for a neutral note. \`warn\` and \`bad\` are announced to screen readers.
- **The consumer provides** \`title\` (a short statement) and \`children\` (one or two sentences that say what to do).`,
    body: `h('div', { className: 'stack', style: { maxWidth: 520, gap: 10 } },
      h(A.Callout, { title: 'Screening-level results' }, 'Member sizes are preliminary until a structural engineer checks them.'),
      h(A.Callout, { title: 'Soil report not provided', tone: 'warn' }, 'Using an allowable bearing of 100 kPa (assumption). Add a report to replace it.'),
      h(A.Callout, { title: 'Corridor too narrow', tone: 'bad' }, 'The corridor is 0.76 m; RAJUK 2008 asks for at least 1.2 m.'))`,
  },
  Stat: {
    group: "Data", height: 96,
    readme: `# Stat

A summary figure: a \`caption\` label above an 18px/600 value with tabular digits, on a \`surface-2\` tile with a \`line\` border.

- **The consumer provides** \`label\` (sentence case, short) and \`value\`, already formatted (currency \`৳\`, Bangla digits in BN).
- Put three or four side by side in a row; keep labels to two or three words.`,
    body: `h('div', { className: 'row', style: { gap: 12 } },
      h(A.Stat, { label: 'Rules passed', value: '14 / 18' }), h(A.Stat, { label: 'Floor area ratio', value: '2.8 / 3.0' }), h(A.Stat, { label: 'Estimated cost', value: '৳ 2.4 cr' }))`,
  },
  PageHeader: {
    group: "Layout", height: 110,
    readme: `# PageHeader

Each screen's top: an \`h1\` title, an optional \`ink-soft\` subtitle and right-aligned actions.

- **The consumer provides** \`title\`, optional \`subtitle\` (facts joined with " · ") and \`actions\` (Buttons, at most one primary).
- Under 900px it stacks and the title drops to 24px.`,
    body: `h(A.PageHeader, { title: 'Code compliance', subtitle: 'Mirpur house · 4 storeys · RAJUK 2008', actions: h(F, null, h(A.Button, null, 'Export'), h(A.Button, { variant: 'primary' }, 'Fix layout')) })`,
  },
  ResultChip: {
    group: "Data", height: 64,
    readme: `# ResultChip

The outcome of one check (a code rule, a structural member, a plan validation), with a dot and a word: Pass, Fail, Check, Not checked, Not applicable.

- **Use** wherever the app reports a result. Colours come from \`ok\`, \`bad\` and \`warn\`; *Not checked* is a hollow grey dot and *Not applicable* a dashed outline.
- **The consumer provides** \`result\` and \`lang\` (\`en\` or \`bn\`: labels are built in, e.g. উত্তীর্ণ / অনুত্তীর্ণ); \`children\` overrides the word.
- **Never** show *Pass* for a rule the app could not check: that is what *Not checked* is for.`,
    body: `h('div', { className: 'row' },
      h(A.ResultChip, { result: 'pass' }), h(A.ResultChip, { result: 'fail' }), h(A.ResultChip, { result: 'warn' }),
      h(A.ResultChip, { result: 'not_checked' }), h(A.ResultChip, { result: 'not_applicable' }), h(A.ResultChip, { result: 'pass', lang: 'bn' }))`,
  },
  Value: {
    group: "Data", height: 64,
    readme: `# Value

A number with its unit: tabular digits, the unit in \`ink-soft\` at 85% size, never wrapped.

- **The consumer provides** the formatted number as \`children\`, plus \`unit\` (after) or \`prefix\` (before, e.g. \`৳\`).
- Use it in tables, stats and sentences so units always look the same.`,
    body: `h('div', { className: 'row', style: { gap: 24, fontSize: 'var(--fs-lg)' } },
      h(A.Value, { unit: 'm' }, '1.20'), h(A.Value, { unit: 'm²' }, '234'), h(A.Value, { unit: 'kPa' }, '100'), h(A.Value, { prefix: '৳' }, '2,40,00,000'))`,
  },
  SegmentedControl: {
    group: "Actions", height: 64,
    readme: `# SegmentedControl

Pick one of two to five options, shown side by side (a radio group). The chosen item lifts onto \`surface\` with \`shadow-sm\`; arrow keys move the choice.

- **Use** for settings and view switches (theme, language, units, camera view).
- **The consumer provides** \`options\` (\`{value, label}\`), \`value\`, \`onChange\` and an \`aria-label\` naming the choice.
- For switching between sections of content, use Tabs.`,
    body: `h(function () { var s = React.useState('system'); return h(A.SegmentedControl, { 'aria-label': 'Theme', value: s[0], onChange: s[1], options: [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }] }); })`,
  },
  Tabs: {
    group: "Actions", height: 64,
    readme: `# Tabs

Switches between sections of one screen: a \`surface-2\` track (\`r-md\`, 3px padding, \`line\` border) of tabs; the active tab lifts onto \`surface\` with \`shadow-sm\`.

- **The consumer provides** \`items\` (\`{id, label}\`), the current \`value\` and \`onChange\`.
- Under 900px the track scrolls sideways in one row instead of wrapping.
- In the app this is CSS-only (\`.tabs\`, \`.tab\`, \`.tab--active\`); this component wraps the same classes.`,
    body: `h(function () { var s = React.useState('all'); return h(A.Tabs, { 'aria-label': 'Filter', value: s[0], onChange: s[1], items: [{ id: 'all', label: 'All (18)' }, { id: 'fail', label: 'Fails (3)' }, { id: 'pass', label: 'Passes (14)' }, { id: 'nc', label: 'Not checked (1)' }] }); })`,
  },
  Slider: {
    group: "Actions", height: 64,
    readme: `# Slider

A 4px range track filled in \`primary\` over \`surface-3\`, with a 16px \`surface\` thumb ringed in \`primary\`.

- **The consumer provides** \`value\`, \`min\`/\`max\`/\`step\`, \`onChange\` and an \`aria-label\`; \`children\` render beside it (show the live value with its unit).
- In the app this is the \`.slider\` class on a native range input; the fill width is set inline.`,
    body: `h(function () { var s = React.useState(6); return h('div', { style: { maxWidth: 360 } }, h(A.Slider, { 'aria-label': 'Storeys', value: s[0], min: 2, max: 10, onChange: s[1] }, h(A.Value, { unit: 'storeys' }, String(s[0])))); })`,
  },
  Modal: {
    group: "Feedback", height: 220,
    readme: `# Modal

A dialog over a dimmed backdrop: \`surface\` panel, \`line\` border, \`r-lg\`, \`shadow-lg\`, max 640px wide, \`s-5\` padding, an 18px/600 title and a right-aligned footer.

- **The consumer provides** \`title\`, \`children\`, optional \`footer\` (a soft Cancel, then the action) and \`onClose\` (backdrop click and ✕ call it).
- \`inline\` renders the panel without the backdrop (documentation and previews).`,
    body: `h('div', { style: { maxWidth: 460 } }, h(A.Modal, { inline: true, title: 'Delete this project?', footer: h(F, null, h(A.Button, null, 'Cancel'), h(A.Button, { variant: 'danger' }, 'Delete project')) }, h('p', { className: 'muted' }, '"Mirpur house" will be removed from this device. This can\\'t be undone.')))`,
  },
  EmptyState: {
    group: "Feedback", height: 190,
    readme: `# EmptyState

An empty area that invites the next step: a title, one sentence and usually one action, on a dashed \`line-strong\` panel.

- **The consumer provides** \`title\` (names the space: "Start your first project"), \`children\` (what it is for), an optional Lucide \`icon\` and an \`action\` (one Button).
- Write an invitation, not an apology.`,
    body: `h('div', { style: { maxWidth: 440 } }, h(A.EmptyState, { title: 'Start your first project', action: h(A.Button, { variant: 'primary' }, 'New project') }, 'Enter the plot size and road width, and the app sets up the phases for you.'))`,
  },
  Toast: {
    group: "Feedback", height: 84,
    css: ".toast-region{position:static;align-items:flex-start}",
    readme: `# Toast

A short confirmation bottom-right: \`ink\` panel with \`paper\` text, \`r-md\`, \`shadow-lg\`, announced politely to screen readers.

- **Use** after an action that has no other visible result ("Project saved", "BOQ exported"). Keep it to one short sentence; add one ghost-style action at most ("Undo").
- **The consumer provides** \`children\` and an optional \`action\`; showing and hiding it is theirs.`,
    body: `h(A.Toast, { action: h('button', { type: 'button', style: { color: 'inherit', fontWeight: 600, padding: '2px 6px' } }, 'Undo') }, 'Project deleted')`,
  },
  Dot: {
    group: "Data", height: 56,
    readme: `# Dot

An 8px round marker in a tone's base colour, for legends and list rows.

- **The consumer provides** \`tone\` and always puts a text label beside it: colour alone never carries meaning.`,
    body: `h('div', { className: 'row', style: { gap: 16 } }, ['primary', 'sage', 'amber', 'blush', 'sky', 'neutral'].map(function (t) { return h('span', { key: t, className: 'row', style: { gap: 6 } }, h(A.Dot, { tone: t }), t); }))`,
  },
  StatusBadge: {
    group: "Data", height: 60,
    readme: `# StatusBadge

A Badge whose tone comes from a phase's design status: not started → faint, gathering info → sky, drafted → lavender, designed → sage, needs update → amber.

- **The consumer provides** \`status\` and the localised \`label\`; the tone is never chosen by hand.
- Change the mapping only in \`statusTone\` (\`src/theme/tokens.ts\`).`,
    body: `h('div', { className: 'row' },
      h(A.StatusBadge, { status: 'not_started', label: 'Not started' }), h(A.StatusBadge, { status: 'gathering_info', label: 'Gathering info' }),
      h(A.StatusBadge, { status: 'drafted', label: 'Drafted' }), h(A.StatusBadge, { status: 'designed', label: 'Designed' }), h(A.StatusBadge, { status: 'stale', label: 'Needs update' }))`,
  },
  StatusDot: {
    group: "Data", height: 56,
    readme: `# StatusDot

An 8px status marker toned by \`statusTone\` and announced as "Status: …" to screen readers.

- **The consumer provides** \`status\`; put the status word beside it in lists.`,
    body: `h('div', { className: 'row', style: { gap: 16 } }, ['not_started', 'gathering_info', 'drafted', 'designed', 'stale'].map(function (s) { return h('span', { key: s, className: 'row', style: { gap: 6 } }, h(A.StatusDot, { status: s }), s.replace('_', ' ')); }))`,
  },
};

for (const [name, c] of Object.entries(C)) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), c.readme + "\n");
  fs.writeFileSync(
    path.join(dir, "preview.html"),
    `<!-- @dsCard group="${c.group}" height=${c.height} -->
<!doctype html>
<html>
<head><meta charset="utf-8"><style>body{background:var(--paper);padding:16px;}${c.css || ""}</style></head>
<body>
<div id="root"></div>
<script>
  var A = window.ArchRes, h = React.createElement, F = React.Fragment;
  function App() {
    return ${c.body};
  }
  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
</script>
</body>
</html>
`,
  );
}
// Hand-written docs (brand book, cover, types, logo notes) are kept in static/ and copied over.
fs.cpSync(path.join(__dirname, "static", "project"), path.join(__dirname, "out", "project"), { recursive: true });
console.log("components:", Object.keys(C).length);
