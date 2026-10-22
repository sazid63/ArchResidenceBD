# Design tokens v0 + corner policy (W0.2)

Status: **v0** (prototype). Source of truth: `app/src/theme/tokens.css` (CSS variables) + `app/src/theme/tokens.ts` (meaning-coded tone maps). Reference implementation of plan §5.1 (UI theme).

## Law

- **No sharp edges anywhere.** Every surface, control, image frame and panel is rounded. `border-radius: 0` ne
  **And it is measured** ✓ ✓ — the UI guard holds it ✓ ✓ — a `border-radius`
  written outside these tokens is a problem ✓ ✓ · the same way a colour outside them
  is ✓ ✓ · so the plan's UI review gate (*"soft theme; no sharp edges"*) cannot lapse
  ✓ ✓ ✓ (ADR-0085 ✓ ✓) ✓ ✓.ver appears in our UI. Minimum radius: `--r-sm` (8px).
- Soft warm palette — never pure white/black, never harsh shadows.
- Meaning-coded color: phase kinds, statuses and cost types get one pastel each, used consistently across sidebar, badges, chips, dots and charts.
- Honest boundaries: exported deliverables (Excel BOQ, CAD drawings) keep professional industry standards — this theme governs the app UI.

## Colors (light)

| Token | Value | Use |
|---|---|---|
| `--paper` | `#fbf6ef` | app background (warm cream) |
| `--surface` | `#fffdf9` | cards, panels |
| `--surface-2` | `#f4ede2` | recessed, hover |
| `--surface-3` | `#ece3d5` | stronger recess |
| `--ink` | `#3e3833` | primary text (warm charcoal, never black) |
| `--ink-soft` | `#6f6459` | secondary text |
| `--ink-faint` | `#9d9184` | hints, disabled |
| `--line` | `#e9dfd1` | dividers |
| `--primary` | `#e07856` | primary action (warm coral) |
| `--primary-hover` / `--primary-active` | `#d46a47` / `#c55e3c` | interaction states |
| `--primary-soft` / `--primary-ink` | `#fbe9e0` / `#a34b2b` | soft fills, on-soft text |
| `--on-primary` | `#fffaf6` | text on primary |

Pastels (each with `-soft` fill and `-ink` text): `--sky #7fb3d5` · `--sage #8fb58a` · `--lavender #a99bd0` · `--amber #dfa761` · `--blush #e2a0ab` · `--mint #7fc4b4`.

## Colors (dark)

Warm charcoal, applied via `:root[data-theme="dark"]`; persisted in `localStorage` key `archres-theme`.

| Token | Value |
|---|---|
| `--paper` | `#262119` |
| `--surface` / `--surface-2` / `--surface-3` | `#2e2820` / `#383129` / `#423a30` |
| `--ink` / `--ink-soft` / `--ink-faint` | `#f1e9dd` / `#c9bcab` / `#93887a` |
| `--line` | `#443c32` |
| `--primary` | `#e68a66` |
| `--on-primary` | `#2b2118` |

## Meaning-coded tones

| Meaning | Tone |
|---|---|
| Phase: site · foundation · floor · roof · common | amber · mint · sky · blush · lavender |
| Status: not started · gathering info · drafted · designed · stale | faint · sky · lavender · sage · amber |
| Cost: material · labour · machinery · subcontract | sage · sky · amber · lavender |

Mapping lives in `app/src/theme/tokens.ts` — the single place to change meaning colors.

## Geometry, type, motion

| Token set | Values |
|---|---|
| Radii | `--r-sm 8` · `--r-md 12` · `--r-lg 18` · `--r-xl 24` · `--r-pill 999px` |
| Spacing | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 (`--s-1` … `--s-12`) |
| Type | base 14px; sizes 12/13/14/16/18/22/28; line-height 1.55 |
| Fonts | `--font-ui`: Inter → Segoe UI Variable → Segoe UI → system-ui → Noto Sans Bengali → Nirmala UI (Inter/Bengali fonts bundled in P1; system stack in prototype) |
| Shadows | warm, diffuse: `--shadow-sm/md/lg` (rgba warm brown @ 5–16%, dark mode deeper) |
| Motion | 150–220 ms, `cubic-bezier(0.22, 0.61, 0.36, 1)` |

## Corner-policy checklist (apply to every new component)

- [ ] Outer container rounded (`--r-lg` or larger for panels)?
- [ ] Interactive controls pill or `--r-md`+?
- [ ] Inner elements nested with smaller radius (outer ≥ inner)?
- [ ] Focus ring rounded (`:focus-visible` uses `--r-md` outline)?
- [ ] Scrollbars rounded (global stylesheet handles)?
- [ ] No `border-radius: 0` anywhere; check gradients/shadows do not create hard edges.
- [ ] Dark mode checked (tokens only — never hard-coded colors).

## Running the prototype

```powershell
cd app
pnpm install        # first time
pnpm dev            # http://localhost:5173
pnpm build          # tsc --noEmit + vite build
```

- BN/EN toggle: bottom-left footer (Bangla digits via manual mapping — never MT).
- Theme toggle: footer; persisted in `localStorage`.
- Mock data mirrors `spec/examples/two-storey-residential.json` (Mirpur Duplex) — one consistent story.

## Verified (2026-10-17, W0.2 done-check)

Live browser session: all six screens render (Projects, Project Setup, Phase chat, Design, BOQ, Documents) · sidebar groups expand/collapse · steppers work · BN/EN flips all strings with Bangla digits (e.g. `৳ ৬৪০`) · light↔dark transitions cleanly (mid-transition sampled) · BOQ shows cost-type badges + deviation badge + grand total · Engineer Pack shows "Engineer validation pending — Launch Plan" · **zero console errors**.

## Known limits (v0)

- Fonts: system stack (Inter + Noto Sans Bengali bundled later).
- 3D preview is a placeholder (NativeCAD spike S6 feeds it).
- Tauri packaging after spike S1 (ADR); this package is the shared UI.
