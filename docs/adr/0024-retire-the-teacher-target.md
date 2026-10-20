# ADR-0024 — The teacher target is retired; the teacher becomes a parked offline tool

**Date:** 2026-10-21 · **Status:** accepted · **Owner decision:** 2026-10-21 (path (a))
**Plan:** `docs/plan/ArchResidenceBD-Plan-v1.5.md` §7 (amended to v1.6) · **Related:** ADR-0009
(scripts first), ADR-0020 (the teacher review and the shortfall), ADR-0015 (the eval gate)
**Code (parked, not deleted):** `core/src/archres_core/training/teacher.py` ·
`tools/training/teacher_augment.py` · **Data (candidate only):**
`data/training/teacher-review/` · `data/training/sft-v1/`

## Context

Plan §7 set two training data sources: scripted generation for structure (numbers, geometry,
templates) **plus** a teacher model for natural-language variety, with a **~0.5M-token target**
and a local Qwen3-8B Q4 teacher.

The measurement (ADR-0020) showed the target was not a tuning problem:

- The teacher paraphrases **questions**. The corpus has 88 train-side ask records, so 1,496
  calls (88 × 17 variants) produced **111 unique** paraphrases and 1,385 duplicates. Seed-only
  variants collapse to about one distinct paraphrase per question; more GPU passes reproduce the
  same text.
- The reviewed subset (61 records, 50 rejected with reasons) trained a candidate that **tied the
  scripted model** on the W1.9 gate: 42/60 against 43/60, fixing no case and breaking one. The
  W1.9 suite scores parse answers, so ask-paraphrase quality is invisible to the gate - the
  teacher could not be shown to add anything, and the shortfall (292,442 tokens) was
  unclosable by construction.
- The teacher was never a product dependency: it is an offline tool, never shipped, and the
  fleet's chat model is trained on the scripted corpus alone.

The owner was asked how the leftover should be handled and chose **(a): retire it properly** -
the plan's target is dropped, the tooling is parked, and the number stops haunting the board.

## Decisions

1. **The plan's ~0.5M-token teacher target is retired** (plan v1.6, §7). The scripted dataset
   (~197k tokens) plus the reviewed candidate set is the training data as it stands; no work is
   owed against a target the corpus cannot reach.
2. **The teacher is parked, not deleted.** The harness, the prompt, the verifier path and the
   111-decision review ledger stay in the repository: they are the *provenance* of the
   measurement, and deleting them would make the recorded result unreproducible. Nothing runs
   them - no build, no release, no fleet member depends on them.
3. **The 61 reviewed records stay a candidate dataset** (`sft-v1`) with no role in the fleet.
   The shipped chat model is trained on the scripted corpus only; the candidate is not promoted
   and is not scheduled to be.
4. **Re-entry needs three things, and an owner decision.** Teacher data may be used again only
   if (a) the target is *measurable* - a gated ask-phrasing suite, or a parse/explain target the
   W1.9 suite can see; (b) the corpus is not one seed set / one macro; and (c) the owner
   approves the new scope. Until then the teacher stays parked.
5. **The finding is kept, the target is dropped.** Nothing about the measurement is softened: the
   teacher produced 111 unique paraphrases, its one trained round tied the scripted model, and
   the shortfall was real. The board's "open gaps" lose the teacher row; the other gaps
   (20 unmeasured questions, 8 pack provisions, 3 un-ingested references, the repair corpus's
   single macro, the `LawDesk` seam, the human spot-check) stay exactly as they were.
6. **The lesson is recorded where it belongs.** A teacher that only rephrases what it was given
   cannot scale a corpus, and a data source that the eval gate cannot see cannot be shown to
   help. The next data decision must start from *what the gate can measure*.

## Consequences

- The phase's honest position is: one scripted corpus, one fine-tuned chat model measured
  against it, no teacher-shaped debt. The plan no longer carries a target that was never
  reachable.
- The park costs nothing: the code is small, tested and documented, and it is the receipt for
  the decision.
- W2 (the 3D phase) inherits no teacher work; its data needs are the spec-driven generators,
  which are the other half of §7 and are working.
- If a future phase wants natural-language variety, the entry conditions are written down, so
  the question is "what can the gate see?" rather than "how many tokens can we reach?".
