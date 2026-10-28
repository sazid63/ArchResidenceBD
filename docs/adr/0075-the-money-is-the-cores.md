# ADR-0075 — The money is the core's, and the card it came from is named

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the shell's last
wiring) · **Plan:** §4 (the shell) · §5.6 (the law system) · the plan's money law (a fetched
number is a candidate until a human activates it ·) · **Related:** ADR-0073 (the conversation
is the core's), ADR-0074 (the project is the core's)
**Code:** `core/src/archres_core/bridge.py` (`boq.build` ·) · `app/src/screens/BoqScreen.tsx`
(the money screen ·) · **Tests:** `core/tests/test_bridge_boq.py` (4) · **Spec:**
`docs/spec/desktop-shell-v0.md`

## Context

The BOQ screen showed a **mock** BOQ ✓ — invented numbers ✓ ✓. For a commercial app the
BOQ is the product's output ✓ — the thing the user shows the engineer ✓ and the thing the
bank lends against ✓ ✓.

And the plan's money law is sharp ✓: a fetched number is a **candidate** until a human
activates it ✓ (OWNER-ATTENTION #8 ✓ ✓) ✓.

## Decisions

1. **The money is the core's** ✓ — the **project's own spec** ✓ (the store's tip ✓) is
   designed ✓ and priced ✓ ✓; the app never computes a rate ✓ ✓.
2. **The card the money came from is named** ✓ — its id ✓, its status ✓, its region ✓ and
   its effective date ✓ ✓ — so the app shows **where the money came from** ✓ ✓.
3. **A candidate card says so in the app** ✓ — the screen carries a note ✓ (the money law
   ✓ ✓) ✓, because a number nobody has acknowledged should not look like a settled one ✓ ✓.
4. **The arithmetic holds** ✓ — the total is the sum of the priced lines ✓ (the BOQ tool's
   own check ✓) ✓ ✓.

## Consequences

- **The app's output is real** ✓ — the BOQ the user shows the engineer is the one the core
  built ✓ ✓.
- **The money's status is visible** ✓ — not hidden behind a total ✓ ✓.
- **What is not here** ✓: the **activation** of the card ✓ (the owner's act ✓ ✓), and the
  **live cost meter** on this screen ✓ (the mock's meter ✓ — the core's §3.8 work is in the
  BOQ document ✓, and the screen's meter is the next wiring ✓ ✓).
