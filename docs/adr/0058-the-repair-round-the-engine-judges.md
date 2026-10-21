# ADR-0058 — The repair round: a fix is kept when the engine says it works

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W4.2 (the RFT Repair round) ·
**Plan:** §7 (the training data) · §6 (the P4 track) · **Related:** ADR-0057 (the chat
round), ADR-0024 (the teacher is parked), ADR-0015 (the frozen split)
**Code:** `core/src/archres_core/training/rft.py` (the repair judge · `read_code`) ·
`tools/training/rft_round.py` (the CLI, now task-aware) · **Tests:**
`core/tests/test_rft_round.py` (18) · **Spec:** `docs/spec/rft-repair-round-v0.md`

## Context

W4.2 is the same loop as W4.1, for the **repair** model: sample → verify → retrain. The
board was explicit that the two are *one mechanism* — so the mechanism was not written
twice.

But the repair task's truth is not the parse task's truth. A parse answer is judged against
**labels** (the generator wrote them). A repair answer is a **macro**, and the question is
whether it *works* — which is not a question about the text.

## Decisions

1. **A fix is judged by the engine, not by its appearance.** There is more than one way to
   repair a macro ·, so "does the fix look like the known-good one" would be the wrong
   question · — the right question is whether the macro **runs** and the case's
   expectations hold · ·. So the truth here is the **engine's verdict** (the real CAD
   engine ·, the same case the scripted fix had to pass ·) ·, and the verifier is
   **injected** — the tests use a fake ·, the tool uses the real engine · ·.
2. **The engine's verdict is the only judge.** A fix that fails is dropped with the
   engine's own words (the check and its message ·) — the same shape as the chat round's
   reasons · ·, so the ledger reads the same way for both · ·.
3. **A fenced macro is unwrapped.** The models fence their code ·, and the engine must not
   be asked to run the fence · — so the answer is unwrapped before it runs · ·.
4. **The failure's truth does not change.** The record keeps the scripted labels (the case
   ·, the error type ·, the failure code ·) · — the *fix* is what the model produced ·, not
   what went wrong · ·.
5. **The holdout is never read** ·, the same as the chat round · — the repair split's
   training side only · · (ADR-0015) ·.
6. **One mechanism, two judges** · — the round takes a judge ·, and the CLI takes a task ·
   — so the second round is not a second implementation · ·.

## Consequences

- **The repair model can be trained on its own working fixes** · — which is the point of
  the round · ·, and it is the first training data for the repair family that the model
  produced itself · ·.
- **A fix that does not work cannot enter the data** · — the engine says so · ·, and the
  reason is written down · ·.
- **The ledger reads the same way for both rounds** · — sampled ·, kept ·, dropped ·, and
  the reasons · ·.
- **What is not here** ·: the round's execution and the retrain (the owner's machine and
  environment ·, as in W4.1 ·) ·, and rounding the explain and override tasks (their answer
  shapes need their own judges ·) ·.
