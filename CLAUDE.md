# ArchResidenceBD v3 (branch `v3`)
Bilingual EN/BN Dhaka app: plot → plan → 3D → structure → RAJUK/BNBC → BOQ → drawings. React 19, TS, Vite 8, Tauri.

Read `docs/handover/NEXT.md` first. Plan: `docs/audit/production-readiness-2026-11.md`. Do what the owner names.
Find code: `node floorplan/query.mjs find "<words>"`, then grep + read line ranges. Never read whole `parametricBuildingGenerator.ts`, `NativeCadScreen.tsx`, `i18n.tsx`. Skip old docs (KNOWLEDGE_BASE, MODEL_CARD, docs/plan, docs/work).

Settled: no AI · Monsoon indigo tokens (`src/theme/tokens.css`) · RAJUK 2008; BNBC/DAP only with citation, else "not checked" · original plans only · Windows+web · Dhaka only.

Rules: test every behaviour change · cite regulations or mark "assumption" · integer mm · colours via tokens · UI text EN+BN · work: `npx vitest run <path>`, `tsc --noEmit`; before commit: `npm run verify` · commit on `v3`, never push unless asked · reply ≤5 lines.

Windows: no `python3` (use node) · files CRLF · stop `vite preview` before `npm ci`.
