# ADR-0001 — Internal build target; launch formalities deferred

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Owner

## Context

The frozen plan (v1.5) targets commercial v1.0, including outside-engineer validation (P0 recruitment; P3/P6 review loops) and a real-user pilot (P6), plus productization formalities (installer signing, updates, publication).

The owner re-scoped the immediate goal: deliver a complete **internal build** — the full app running on the owner's + agent's machines, with all testing and stress testing performed internally. Engineer validation, pilot, and commercial formalities move to a separate **Launch Plan** executed later.

## Decision

1. The current roadmap (P0–P5) targets an **internal build** ("Build 1") instead of commercial v1.0.
2. Outside-engineer activities (W0.6 recruitment; engineer review/sign-off loops) are **deferred to the Launch Plan**.
3. The **P6 pilot** is deferred to the Launch Plan.
4. **P5 is slimmed**: packaged app running cleanly on our machines; release/update/signing/publication formalities defer.
5. **Quality gates stay** — owned internally: CI, execution-verified loops, evals, and a closing **internal stress sprint** before Build 1.
6. The **engineer review pack remains an artifact** we still generate, so later validation stays cheap.
7. Outputs are labeled *"engineer validation pending — Launch Plan"* where relevant. Nothing is falsified; the Deviation Register and honesty rules are unchanged.

## Consequences

- Estimated time to Build 1: **~5.5–7 months** (vs 7.5–9.5 to commercial v1.0); first end-to-end walking skeleton ~3 months.
- The Launch Plan will cover: engineer validation round, pilot/UAT, installer polish + signing, updates, docs, model publication, legal/ToS.
- W0.6 is removed from the P0 board (deferred, not cancelled).
