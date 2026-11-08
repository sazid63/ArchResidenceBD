A plain, calm interface for designing homes in Bangladesh and checking them against the building codes: plot and phases, 3D model, structure, compliance, quantities and drawings. White surfaces, cool grey ink, soft 10–14px corners and one indigo accent. Two laws hold everywhere: **indigo means "you can act"**, and **green, amber and red only ever describe a result**.

## Content fundamentals

- **Bilingual, written by people.** Every string ships in English and Bangla. In Bangla mode numbers use Bangla digits (`৳ ২.৪ কোটি`, `৪ কাঠা`). Never machine-translate.
- **Sentence case** for every label, button, tab and title: "Fix layout", "Code compliance", "Your projects". No Title Case, no ALL CAPS.
- **Plain and exact.** Say what happens and what a number means: "Corridor is 0.76 m; RAJUK 2008 asks for at least 1.2 m." Avoid filler ("seamless", "powerful", "simply").
- **Never pretend.** A rule the app can't check yet shows *Not checked*, never a pass. Assumptions are labelled as assumptions, with the value used: "Soil report not provided — using an allowable bearing of 100 kPa (assumption)."
- **Cite the source.** Every code check names its document and clause (`RAJUK 2008 §46`, `BNBC 2020 Part 6`). Structural screens say they are screening-level, not a final design.
- Facts are joined with " · " (`4 storeys · 3.5 katha · 2 units/floor`). Currency is `৳`. Units follow the value in a quieter style (`1.20 m`).
- No emoji in the interface. Icons come from Lucide (see Iconography).

## Colour

- **Surfaces.** `paper` (white) is the page and `surface` the card: in light they are the same white, so cards are drawn with a 1px `line` border, not a tint. `surface-2` is the sidebar, hover fills and recessed tiles (stats, callouts, table headers); `surface-3` is pressed and stronger recess.
- **Ink.** `ink` for body and headings, `ink-soft` for secondary text and inactive navigation, `ink-faint` for captions, icons and section labels. All three meet 4.5:1 on `paper` and `surface-2` in every theme.
- **Primary: Monsoon indigo `#2e4fa3`** (light) / `#8ea6f0` (dark). Actions only: the primary button, the New project button, the focus ring, the slider fill and selected states. `primary-soft` tints the active nav row and selections with `primary-ink` text. Indigo is never used to say "good".
- **Results.** `ok` (green, alias of `sage`), `warn` (amber), `bad` (red, alias of `blush`) and `info` (blue, `sky`) each come as a trio: the base for dots and marks, `-soft` for fills, `-ink` for text on that fill. Use the semantic names in new code; ResultChip already does.
- **Categories.** `lavender` and `mint` are for categories that aren't results (cost types, chart series). Tone maps live in one place (`statusTone`, `phaseTone`, `costTone`), never chosen by hand:

| Status | not started | gathering info | drafted | designed | needs update |
|---|---|---|---|---|---|
| Tone | faint | sky | lavender | sage | amber |

| Cost type | material | labour | machinery | subcontract |
|---|---|---|---|---|
| Tone | sage | sky | amber | lavender |

- **Construction phases** have their own colours for the 3D colour-by-phase view, progress bars and charts: `phase-site` (earth), `phase-foundation` (concrete grey), `phase-floor` (indigo), `phase-roof` (amber), `phase-utility` (teal).
- **Themes.** Light, Dark (`data-theme="dark"`) and High contrast. "System" follows the operating system. Use tokens only: a hard-coded colour breaks the other themes. The 3D viewport reads `viewport-bg` and `viewport-ground`.
- Always pair colour with a word or icon: colour alone never carries meaning.
- Exported deliverables (BOQ spreadsheets, CAD drawings, IFC) follow industry conventions, not this palette.

## Type

- One family, two scripts: **Noto Sans** for Latin and **Noto Sans Bengali** for Bangla, self-hosted (the app works offline). Base `body` is 14px / 1.55; Bangla runs get 1.65 line-height and are never set below 14px.
- Headings are 600: `h1` 26px (page titles), `h2` 22px, `h3` 16px (card titles), `h4` 14px.
- `small` 13px for subtitles, tables, tabs and chips; `caption` 12px for stat labels, section labels and badges (600 on badges).
- Figures use the UI font with tabular digits (`stat-value`, 18px/600), so columns of numbers line up. The monospace stack is for real code and file names only.

## Shape, space and depth

- **Soft, not bubbly.** `r-md` 10px for buttons, inputs, nav rows, stats and callouts; `r-lg` 14px for cards, tables and modals; `r-sm` 6px for items inside a track; `r-pill` only for chips, badges, result chips and dots.
- **Borders separate, shadows lift.** Surfaces are divided by `line` hairlines. `shadow-sm` marks the active tab, `shadow-md` the hover on an interactive card, `shadow-lg` overlays (modal, toast, mobile drawer).
- Spacing runs `s-1` 4px → `s-12` 48px. Cards and modals pad `s-5`; pages pad `s-8`; rows gap `s-2`; stacks gap `s-4`.
- Under 900px the sidebar becomes a drawer, the page header stacks and tab rows scroll sideways. On touch, controls grow to 44px.

## Motion and states

- Quick and quiet: 120 ms (`--dur-fast`, press), 160 ms (`--dur`, hover and colour), 220 ms (`--dur-slow`), easing `cubic-bezier(0.22, 0.61, 0.36, 1)`. Everything switches off under `prefers-reduced-motion`.
- Hover: primary steps to `primary-hover`; soft and ghost buttons fill with `surface-2`; interactive cards darken their border to `line-strong` and take `shadow-md`. Press: buttons move down 1px. Disabled: 50% opacity.
- **Focus** is always visible: a 2px `primary` outline 2px outside the element; inputs swap it for a `primary` border plus a soft 3px ring.

## Iconography

- **Lucide** outline icons (lucide-react, ISC licence) at 15–17px with a 1.75 stroke, coloured by the text around them (`ink-faint` in navigation, `primary-ink` when active).
- Every icon sits next to a text label, or carries an `aria-label` when it stands alone (icon buttons).
- Floor plans, drawings and the 3D model are generated by the app, not icons.
- The app mark is a white building glyph on an indigo `r-md` tile in the sidebar; the installer and window icons are under **Logos**.
