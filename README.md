# ArchResidenceBD

An offline-first Windows desktop app that acts as an AI civil engineer for Bangladeshi residential buildings: chat-driven phase planning → compliant-by-default design → per-phase 3D models that federate into one building → drawings + BBS + BOQ (live prices; materials + labour + machinery) + deviation register.

**Status:** P1 — Brain v0 (started 2026-10-18; spec, rule, training-data and question engines done; orchestrator next).
**Plan of record:** [`docs/plan/ArchResidenceBD-Plan-v1.5.md`](docs/plan/ArchResidenceBD-Plan-v1.5.md)
**Current board:** [`docs/work/P1.md`](docs/work/P1.md)

## Repo layout

| Path | Purpose |
|---|---|
| `app/` | Desktop shell — Tauri + React (shell decided by spike S1), design tokens v0 |
| `core/` | Python engines: Building Spec, rules, geometry, BOQ, drawings, orchestration |
| `cad/` | FreeCAD addon + worker pool (the NativeCAD engine layer) |
| `spec/` | Building Spec source of truth (JSON Schema v0.1.0) + examples; generated models are committed |
| `docs/` | Plan, ADRs, work boards, licences |
| `data/` | Rule packs, Source Registry data, fixtures (large files ignored) |
| `models/` | Fleet training notebooks + Kaggle pipeline + eval artifacts |
| `tools/` | Dev/CI scripts |

## Conventions

- Monorepo: **uv** (Python) + **pnpm** (JS/TS).
- Every significant decision gets an ADR in `docs/adr/`.
- Work follows the WBS (plan Appendix C) — the current phase board lives in `docs/work/`.
- **$0 budget:** free tools, free tiers, open weights only; anything that breaks this needs owner sign-off.
- **Quality law (plan §9):** identical outputs under optimization, never silent coverage gaps, unverified content is a candidate.
