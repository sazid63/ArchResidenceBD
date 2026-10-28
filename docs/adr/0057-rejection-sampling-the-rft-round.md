# ADR-0057 — Rejection sampling: the model learns from its own answers that the truth verified

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W4.1 (the RFT Chat round) ·
**Plan:** §7 (the training data) · §6 (the P4 track) · **Related:** ADR-0024 (the teacher is
parked), ADR-0015 (the frozen split), ADR-0053 (the eval gates)
**Code:** `core/src/archres_core/training/rft.py` (the round) ·
`core/src/archres_core/agent/client.py` (`read_json_object` — the model's reply, read once) ·
`tools/training/rft_round.py` (the CLI) · `spec/schemas/sft-record.schema.json` (v0.3.0) ·
**Tests:** `core/tests/test_rft_round.py` (12) · **Spec:** `docs/spec/rft-round-v0.md`

## Context

The plan's W4.1 is **sample → verify → retrain**: the fleet answers, the answers are checked,
and the good ones become training data. The teacher is **parked** (ADR-0024 — it only
rephrased the questions it was given), so the training data is the **scripted** generator's
(plan §7) — and the eval gates say why a round is worth running: the chat model parses
**32 of 60** cases correctly (0.533) against the scripted truth, and the parse task is the
one the gates measure (ADR-0053).

What did not exist: any way to take the fleet's own answers and turn the good ones into
training data.

## Decisions

1. **The truth is the scripted labels — never the model's opinion.** The judge reads the
   record's `labels` (the generator wrote them) and the model's own JSON; it never reads the
   prose · ·. A model that is *confidently* wrong is dropped, and the reason says which label
   differed and how · ·.
2. **The model never sees the answer.** The prompt carries the system and the user turn
   only · — the truth is used to judge, never to prompt · — or the round would teach the
   model to echo the dataset instead of to parse · ·.
3. **A kept answer becomes a training record** — the scripted question and the scripted
   labels stay, and the assistant's turn is the **model's own words** · ·. That is the point
   of rejection sampling: the model learns from answers it can already produce · ·.
4. **A dropped sample is evidence, not waste.** The ledger holds every sample and the reason
   it was dropped · — the reasons are what the next round reads · ·, and the counts say how
   many *records* ended with a kept answer (not just how many samples survived) · ·.
5. **The holdout is never read.** The round samples `data/training/sft-v1/train.jsonl` · — the
   holdout file is not opened · — so it cannot be trained on by accident (ADR-0015) · ·.
6. **A round is a measurement, not a derivation — so there is no `--check`.** The model's
   answers are not a function of the input ·, so there is nothing to compare afterwards · ·
   — the **ledger** is the record · ·, and the freshness law keeps covering the artifacts
   that *are* derived (the scripted dataset, the split, the eval case set) · ·.
7. **The provenance is in the schema.** `source.kind: "rft"` (the SFT schema, v0.3.0) · —
   so an RFT record can never be mistaken for a scripted one · ·, and the round's own check
   is named in the record (`verifyChecks: ["rft.truth"]`) · ·.
8. **The round runs where the models are.** The model artifacts are not in the repo ·, so the
   owner runs the round on the machine that has them · — and the tool says so plainly when
   the fleet is not answering · ·, and it **refuses to write a round of unreachable samples**
   · — that is a broken environment, not a round · ·.

## Consequences

- **The plan's RFT loop now exists** ·: the model is trained on its own answers that the
  scripted truth verified · ·.
- **The chat model can improve without a teacher** · — the labels are the generator's ·, and
  the model only contributes phrasing · ·.
- **The ledger is the evidence** · — and the **eval gates** (ADR-0053) are what say whether
  the retrained model is actually better · ·, on the same holdout · ·.
- **The schema moved to v0.3.0** ·, so the dataset manifests were rebuilt · — the records
  themselves did not change · (the enum only gained a value) · ·.
