# The RFT round v0 (W4.1): sample → verify → keep

**Status:** v0.1.0 — the fleet is asked the scripted questions, every answer is checked
against the scripted truth, and the answers that agree become training data.
**Code:** `core/src/archres_core/training/rft.py` · `tools/training/rft_round.py` (the CLI) ·
`core/src/archres_core/agent/client.py` (`read_json_object` — the model's reply, read once) ·
**Tests:** `core/tests/test_rft_round.py` (12) · **Decision record:** ADR-0057 · **Plan:** §7
(the training data), §6 (the P4 track)

## What it was

The plan's W4.1 is **sample → verify → retrain**. The teacher is parked (ADR-0024), so the
training data is the **scripted** generator's — and the eval gates say why a round is worth
running: the chat model parses **32 of 60** cases correctly (0.533) against the scripted
truth, and the parse task is the one the gates measure.

What did not exist: any way to take the fleet's own answers and turn the good ones into
training data.

## What it is now

- **The truth is the scripted labels — never the model's opinion.** The judge reads the
  record's `labels` and the model's own JSON, and never the prose ·. A confidently wrong
  answer is dropped, and the reason says which label differed and how ·.
- **The model never sees the answer.** The prompt carries the system and the user turn
  only · — or the round would teach the model to echo the dataset ·.
- **A kept answer becomes a training record** — the scripted question and labels stay, and
  the assistant's turn is the **model's own words** ·. That is the point of rejection
  sampling ·.
- **A dropped sample is evidence.** The ledger holds every sample and the reason it was
  dropped ·, and the counts say how many *records* ended with a kept answer ·.
- **The holdout is never read** — the round samples the training side only ·, so the
  holdout cannot be trained on by accident (ADR-0015) ·.
- **A round is a measurement, not a derivation — so there is no `--check`** ·. The model's
  answers are not a function of the input ·; the ledger is the record ·.
- **The provenance is in the schema** — `source.kind: "rft"` (v0.3.0) ·, and the round's own
  check is named in the record (`verifyChecks: ["rft.truth"]`) ·.

## The measured output (2026-10-21)

- An answer that agrees with the truth is **kept** ·; one whose decision differs is
  **dropped with the reason** ·; an unreadable answer is dropped as *unreadable* ·; a number
  within a hair of the truth is the same number ·, and a number that is not, is not ·.
- The model **never sees the truth** — the prompt is the system and the user turn · (the
  test checks the prompt, not just the result) ·.
- A kept sample becomes a training record whose assistant turn is the model's own answer ·
  , whose labels are the scripted truth · , whose source says `rft` · , and which **validates
  against the SFT schema** · ·.
- A dropped sample becomes **no record** · — and a fleet that is down makes every sample
  *unreachable* ·, so a broken environment cannot look like a model that was wrong ·.
- The **CLI** refuses to write a round when every sample was unreachable · — that is a
  broken environment, not a round · — and it samples the training side only ·.

## What is deliberately not here

- **The round's own execution** — the model artifacts are not in the repo, so the owner runs
  the round on the machine that has them ·; the tool says so plainly when the fleet is not
  answering ·.
- **The retrain itself** — the training run is the owner's environment (W1.6's round was a
  Kaggle T4) ·; what is here is the data the round produces · and the eval gates that say
  whether the new model is better · (ADR-0053) ·.
- **Rounding the other tasks** — the judge reads the parse task's truth (a pointer, a
  decision and a value) ·; the explain and override tasks have a different answer shape and
  would need their own judge ·.

## Checks

```powershell
uv run --directory core pytest -q tests/test_rft_round.py
uv run --directory core python ../tools/training/rft_round.py --round r1 --samples 4
```
