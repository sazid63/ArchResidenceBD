# app — desktop UI (W0.2 prototype)

React + TypeScript + Vite prototype of the ArchResidenceBD shell. The final desktop shell (Tauri vs Electron) is decided by spike **S1**; this package holds the same UI either way.

## Run

```powershell
pnpm install     # first time (repo-root workspace)
pnpm dev         # http://localhost:5173
pnpm build       # tsc --noEmit && vite build
```

## What's inside (W0.2)

- **Design tokens v0** — `src/theme/tokens.css` (CSS variables, light + dark) + `src/theme/tokens.ts` (meaning-coded tones). Corner policy: no sharp edges anywhere. Documented in `docs/design/design-tokens-v0.md`.
- **UI kit** — `src/ui/kit.tsx` / `kit.css`: Card, Button, Chip, Badge, StatusBadge, Dot, StatusDot, Callout, Stat, PageHeader.
- **Sidebar shell** — `src/layout/`: Projects → Project Setup → Phase ▾ → Design ▾ → BOQ → Documents ▾, phase color-dots + status dots, footer BN/EN + theme toggles.
- **Six screens** — Projects, Project Setup, Phase chat, Design, BOQ, Documents (`src/screens/`).
- **Mock data** — `src/data/mock.ts`, mirrors `spec/examples/two-storey-residential.json` (Mirpur Duplex) so the prototype and spec tell one story.
- **i18n** — `src/i18n.tsx`: typed BN/EN dictionaries (TS enforces completeness); Bangla digits by manual mapping — never MT.

Generated spec types live at `src/spec.gen.ts` (from W0.3 codegen — never hand-edit).

## Conventions

- All colors come from tokens — never hard-code hex values in components.
- Every new component must pass the corner-policy checklist (`docs/design/design-tokens-v0.md`).
- Keep changes consistent with the warm, soft theme; check both light and dark.
