# The RFT repair round v0 (W4.2): the engine judges the fix

**Status:** v0.1.0 — the repair model is asked to fix a broken macro, and a fix is kept only
when the CAD engine says it works.
**Code:** `core/src/archres_core/training/rft.py` (`judge_repair` · `read_code`) ·
`tools/training/rft_round.py` (the CLI, now task-aware) · **Tests:**
`core/tests/test_rft_round.py` (18) · **Decision record:** ADR-0058 · **Plan:** §7 (the
training data), §6 (the P4 track)

## What it was

W4.2 is the same loop as W4.1, for the **repair** model — and the board was explicit that
the two are *one mechanism*. But the repair task's truth is not the parse task's truth: a
parse answer is judged against **labels**, and a repair answer is a **macro** — and the
question is whether it *works*, which is not a question about the text.

## What it is now

- **A fix is judged by the engine, not by its appearance** ·. There is more than one way to
  repair a macro ·, so "does it look like the known-good one" would be the wrong question ·
  — the right one is whether the macro **runs** and the case's expectations hold · ·. The
  truth is the **engine's verdict** (the real CAD engine ·, the same case the scripted fix
  had to pass ·) ·, and the verifier is **injected** — the tests use a fake ·, the tool uses
  the real engine · ·.
- **The engine's verdict is the only judge** · — a fix that fails is dropped with the
  engine's own words (the check and its message ·) ·, the same shape as the chat round's
  reasons · ·.
- **A fenced macro is unwrapped** · — the models fence their code ·, and the engine must
  not be asked to run the fence · ·.
- **The failure's truth does not change** · — the record keeps the scripted labels (the
  case ·, the error type ·, the failure code ·) ·; the *fix* is what the model produced ·.
- **The holdout is never read** ·, the same as the chat round · (ADR-0015) ·.
- **One mechanism, two judges** · — the round takes a judge · and the CLI takes a task ·,
  so the second round is not a second implementation ·.

## The measured output (2026-10-21)

- A **fenced macro** is unwrapped ·, and an answer with no code is dropped as *unreadable*
  ·.
- A fix the engine **verifies** is kept ·, and the payload says which case it ran against ·
  — and a fix that **fails** is dropped with the engine's own message ·.
- The **round** keeps only the fixes that work · — of two samples, the working one is kept
  and the broken one is dropped · — and the kept fix becomes a training record whose
  assistant turn is the model's own macro ·, whose source says `rft` ·, whose check is
  named (`rft.case` ·), whose labels are still the scripted failure ·, and which **validates
  against the SFT schema** · ·.
- The **CLI** takes the task (`--task repair.fix` ·) and the engine (`--engine` ·) ·, and
  the repair task's records come from the repair split's **training side** ·.

## What is deliberately not here

- **The round's execution and the retrain** — the owner's machine and environment ·, as in
  W4.1 ·.
- **Rounding the explain and override tasks** — their answer shapes need their own judges ·
  —.

## Checks

```powershell
uv run --directory core pytest -q tests/test_rft_round.py
uv run --directory core python ../tools/training/rft_round.py --task repair.fix --samples 4
```
