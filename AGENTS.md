# Agent instructions — ArchResidenceBD

Read first:

1. `docs/plan/ArchResidenceBD-Plan-v1.5.md` — the plan of record (frozen). Sections §1–§2 are law.
2. `docs/work/P0.md` — the current phase board; work one package at a time.
3. `docs/adr/` — decisions already taken; add an ADR for new ones.

Working rules:

- **$0 budget. One app. Offline-first.** No paid services, no new model members, no new external dependencies without owner sign-off.
- **Scripts first, AI last-mile.** Deterministic Python does math/geometry/rules/BOQ; models phrase, parse, explain, repair.
- **Quality law (plan §9):** identical outputs under optimization, never silent coverage gaps, unverified content is a candidate.
- Keep changes small and verifiable; every work package ends with its stated "done when" check.
- Windows dev machine; LF via `.gitattributes`; **uv** for Python, **pnpm** for JS.
