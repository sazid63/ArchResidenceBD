# ArchResidenceBD v3 (branch `v3`)

Bilingual EN/BN app: Dhaka plot → floor plan → 3D → structure → RAJUK/BNBC checks → BOQ → drawings. React 19 + TS + Vite 8, Tauri shell, all logic in the browser.

Your task: one ticket. Read only your section: `grep -n -A14 "^## <ID>" docs/handover/TICKETS.md`. Background only if the ticket needs it: `docs/BUILD_PLAN.md`.

Settled (don't revisit): no AI models · Civic style, Monsoon indigo tokens (`src/theme/tokens.css`) · RAJUK 2008 now; BNBC/DAP values only with citations, else "not checked" · original plans only · Windows + web · Dhaka only.

Map: `src/plans` grid floor plans (fit, geometry, validate, render, library) · `src/model` project format v3, migration, store · `src/cad` v2 engines (generator 2,174 lines still makes the 3D; structural/compliance/rebar known-wrong) · `src/engine/projectState.ts` v2 store the UI still uses · `src/ui/kit.tsx` components. Old reports in `docs/` (audits, KNOWLEDGE_BASE, MODEL_CARD, docs/plan, docs/work) are outdated: skip.

Rules:
- Grep, then read line ranges. Never read whole `parametricBuildingGenerator.ts`, `NativeCadScreen.tsx`, `i18n.tsx`.
- `npx vitest run <path>` while working; `npm run verify` once before commit (+ `npm run audit:mesh`, `test:exporters`, `build` if 3D/exports touched).
- Every behaviour change gets a test. Regulation values cited or flagged "assumption". Lengths integer mm. Colours via tokens. UI text EN + BN.
- No screenshots unless UI changed (headless Edge: `msedge --headless=new --screenshot=<png> --window-size=1280,860 <url>`).
- Commit on `v3` (with the attribution line your session gives you); mark the ticket `done <hash>`; don't push unless asked. Reply in ≤ 5 lines.

Windows: `python3` hangs (use node) · files are CRLF (scripted edits must normalise `\r\n`) · stop any `vite preview` before `npm ci`.
