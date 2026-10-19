# ADR-0009 — Training data v0: committed scripted dataset, language law, candidate-only teacher

- **Status:** Accepted
- **Date:** 2026-10-19
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.5 defined by plan Appendix C)
- **Supersedes/amends:** none (ADR-0002 still governs the Building Spec; this ADR covers training artifacts)

## Context

W1.5 is the long pole of P1: the training set must be reproducible from frozen artifacts, the sloppy-input class must be deterministic enough to test, and teacher-generated prose must not acquire the status of ground truth. The first implementation pass exposed four decisions the plan does not spell out:

1. **Where the dataset lives and whether it is committed.** The pipeline generates JSONL; a generated file can drift from its generator, and a large binary blob in git is hard to review.
2. **What `lang` means** when a Bangla user says an English proper noun or types Bangla digits in an English sentence. A naive script check rejected 25 legitimate records.
3. **How much teacher output is trusted.** The plan wants teacher augmentation for natural-language variety (plan §7) but the quality law says unverified content is a candidate (§9).
4. **Where unit conversions live** and what to do about `kani`, which the plan lists but no authoritative factor is pinned.

The rule engine's citations, numbers and register entries are already machine-checkable; the dataset should reuse them rather than inventing a parallel truth.

## Decision

1. **Scripted dataset is a committed generated artifact.** `data/training/chat-v0/{dataset.jsonl,sample.jsonl,manifest.json}` is built by `tools/training/build_chat_dataset.py`, canonical JSONL (sorted, compact, UTF-8, LF), with a manifest that pins the flow book, rule pack, SFT schema, example specs, generator version and prompt version plus per-file sha256. CI runs the CLI with `--check`; a stale or missing artifact fails. The builder refuses duplicate record ids, and refuses to emit any record that fails verification. Teacher candidates live outside this tree and are gitignored.
2. **Language law.** `lang` is the conversation language. For `interview.parse` the verifier checks the **user's turn** (proper nouns and quoted values do not change the conversation language); for narration tasks it checks the assistant's answer. Bengali digits are numerals, not a script switch. `mixed` requires both Bengali and Latin letters. This keeps legitimate Bangla/English mixed input in the dataset instead of silently discarding it.
3. **Teacher output is candidate-only.** The teacher rephrases **questions only** in v0; it cannot change labels, numbers, citations or register entries. Every teacher record is `status: candidate`; the deterministic verifier checks schema/labels/language, but no code path auto-promotes it. The W1.6 eval/human gate owns promotion. The full teacher batch (plan §7's ~0.5M-token target) is generated in W1.6; the committed scripted set is ~197k tokens.
4. **Numbers verification is engine-derived.** `allowedNumbers` for explain/override records is computed from the verdict facts and register payload, normalized to the same two-decimal display form the prose uses. It is never derived from the answer, so an invented number cannot allow-list itself. Citations must resolve against the pinned pack; register JSON must equal the engine's `register_ops` entry.
5. **Units are centralized.** `archres_core.units` owns every land/length conversion and the English/Bangla unit words. `kani` is deliberately absent until an authoritative factor is pinned; the plan's mention is recorded as a known gap, not filled with a guess.

## Consequences

- Any change to the flow book, pack, schema or examples invalidates the pins; the fix is to rebuild the dataset and review the diff, not to hand-edit JSONL. Counts are pinned in `test_training_pipeline.py` so a data change is visible in review.
- W1.4 can consume question ids, pointers and option ids directly from the flow book; the dataset's choice labels remain option ids until the question engine maps them to spec values.
- W1.6 must record its train/validation split and teacher promotion decisions in its own manifest; this ADR deliberately leaves those to the SFT round.
- W1.7 adds repair records additively (`kind: repair` already reserved in the schema) without changing the chat manifest.
- Costs accepted: the committed dataset is ~1.4 MB and grows with the flow book; `--check` rebuilds in memory (≈1 s) rather than hashing only; teacher prose remains unverified until W1.6.
