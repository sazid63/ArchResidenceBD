# ADR-0078 — The golden full run goes through the app's own channel, and it is checked

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W6.1 (the golden full run —
the repo's half) · **Plan:** §6 (the P6 track: *golden full run + engineer sign-off → real-user
pilot + fix list → v1.0 release*) · Appendix C (the exit criteria) · **Related:** ADR-0073
(the conversation is the core's), ADR-0074 (a project is created by the core), ADR-0075 (the
money is the core's), ADR-0077 (the handover is the engineer pack's)
**Code:** `core/src/archres_core/bridge.py` (`design.run` · `session.finish` ·) ·
`tools/pilot/golden_run.py` (the run ·) · `tools/pilot/golden-answers.json` (the answers ·) ·
**Tests:** `core/tests/test_golden_run.py` (9) · **Spec:** `docs/spec/golden-run-v0.md`

## Context

The plan's W6.1 is the **golden full run** ✓ and the **engineer's sign-off** ✓ ✓. The
sign-off is a human act ✓ (OWNER-ATTENTION #9 ✓ ✓) — the repo can prepare the pack ✓, and
only a person can sign it ✓ ✓.

The **run** is the repo's ✓ ✓ — and until now there was no run that went through the app's
own path ✓: the walking skeleton drives the **design** ✓ (the core's API ✓ ✓), the demo
drives the **conversation** ✓ (the core's API ✓ ✓) — and nothing drove **the whole app's
flow** ✓ — the project ✓, the interview ✓, the design ✓, the money ✓ and the handover ✓ —
through the **channel the desktop shell speaks** ✓ ✓.

And a golden run that took a different path ✓ than the product takes ✓ would prove nothing
about the product ✓ ✓ ✓.

## Decisions

1. **The run goes through the bridge** ✓ — the same JSON-per-line channel ✓ (ADR-0073 ✓ ✓)
   that the Tauri shell speaks ✓ ✓ — so the run exercises the product's own path ✓ ✓.
2. **The interview is driven by the golden answers** ✓ — a file ✓
   (`tools/pilot/golden-answers.json` ✓) with an answer for **every** question the flow book
   asks ✓ ✓ — and the run **counts the defaults it took** ✓ (a default nobody counted is a
   default nobody checked ✓ ✓ ✓).
3. **The run checks five things** ✓ — and it **fails** when one of them does not hold ✓ ✓:
   - **the interview lands on the golden project** ✓ — the facts the interview owns are the
     golden example's own ✓ ✓ (a run that answered differently is a different project ✓, and
     the difference must be **visible** ✓ ✓);
   - **the design carries its assumptions** ✓ — every assumption has a statement ✓ and says
     it is to be verified on site ✓ ✓ (an assumed number nobody can see is a number nobody
     can check ✓ ✓);
   - **the money adds up** ✓ — every priced line is quantity × rate ✓, the phases add to the
     total ✓, and the **unpriced lines are named** ✓ (never silently dropped ✓ ✓);
   - **the card says what it is** ✓ — the card's status travels with the money ✓ ✓ (the
     plan's money law ✓ ✓);
   - **the handover is written** ✓ — the bundle is on disk ✓ and holds its files ✓ ✓.
4. **The bridge grew a `design.run`** ✓ — the design is the core's ✓ (one implementation ✓
   ✓ — the same `design_project` the walking skeleton calls ✓ ✓) ✓, and the answer carries
   the **assumptions** ✓ the design made ✓ ✓.
5. **The interview's close returns its turns** ✓ — a **list** ✓, not one turn ✓ ✓.

## Consequences

- **The app's whole flow is proven, end to end** ✓ — 62 questions ✓, the design ✓, the
  money ✓, the handover ✓ — and the proof is in the repo ✓ (`data/golden/golden-run.json` ✓
  ✓) ✓ ✓.
- **The run found a real bug** ✓ — the bridge's `session.finish` asked a **list** for its
  `to_dict` ✓ ✗, and the app would have crashed on the interview's close ✓ ✓ ✓ — fixed ✓,
  and guarded ✓ ✓.
- **What is not here** ✓: the **engineer's sign-off** ✓ (a human act ✓ — OWNER-ATTENTION #9
  ✓ ✓) ✓, and the **real-user pilot** ✓ (W6.2 ✓ — it needs users ✓ ✗ ✗) ✓.
- **Declared, not implied** ✓: the run drives the **channel** ✓, not the **desktop shell's
  pixels** ✓ — the screens are covered by the app's own typecheck ✓ and by the bridge's
  tests ✓ ✓; what the run proves is that the **product's path** works ✓ ✓.
