# ADR-0017 — Repair SFT v0: mutate the known-good macro, execute the failure, normalise the trace

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W1.7
**Spec:** `docs/spec/training-data-v0.md` (repair section) · **Code:** `archres_core.training.repair`
**Data:** `data/training/repair-v0/` · **Harness:** `docs/spec/cad-verify-v0.md` (W1.8)

## Context

Archie-Repair-4B (plan §6) repairs NativeCAD scripts from execution errors. It is trained
English-only on code plus traces, and it is the member that makes the CAD loop closed: a
candidate fails, the verifier names the broken expectation, the repair model returns a corrected
macro, the harness re-executes it.

W1.8 made the failure real and structured: `result.json` carries `errorCode`, `errorType`,
`message`, full `traceback`, `frames` (file, line, source), and the verifier adds one failure row
per broken expectation. W1.7 turns that into training records.

Constraints:

- **$0, offline.** Kaggle's free GPU is the training venue; the corpus is built on the dev
  machine's FreeCAD. No paid annotation, no model-generated labels.
- **Scripts first.** A hand-written "here is a bug and its fix" pair is unverified content. The
  substrate must come from code that was executed.
- **Never falsify.** A record may only exist if the broken macro actually failed the way the
  record says, and the fixed macro actually passes the same case.
- **Portability.** Training data must not embed one machine's temp paths, timings or engine build
  strings; the same record must mean the same thing on Kaggle.
- **Declared scope.** Round 1 is a small, honest corpus. Breadth is a later reviewed corpus, not
  a silent edit.

## Decisions

1. **Bugs are deterministic mutations of the known-good candidate.** Each mutation is one exact
   text replacement in `tools/cad/candidates/geometry_build.py`, with an expected failure kind.
   `apply_mutation` refuses a source that no longer contains exactly one occurrence: a drifted
   candidate is an error, never a silently invented bug. The target of every record is the
   known-good macro, not something a model wrote.
2. **A record exists only after execution proves both sides.** The builder runs the mutated macro
   in FreeCAD and demands the declared failure (exception type, or the named measured check). It
   then runs the known-good macro on the same case **twice** and demands identical verdict
   signatures and identical artifact trees. A mutation that stops reproducing fails the build;
   nothing is dropped quietly.
3. **Two failure kinds are first-class: exceptions and measured rejections.** Four mutations
   raise (`NameError`, `ValueError`, `KeyError`, `AttributeError`); two build the wrong geometry
   and are rejected by the verifier (`objects[Pad_1].volumeM3`, `totals.volumeM3`). A repair model
   that only learns to fix crashes cannot fix a wrong volume, and the CAD loop needs both.
4. **Traces are normalised at capture time.** A record carries the exception type, message, the
   deepest candidate line and source, the candidate frames (basename `candidate.py`, line,
   source) and a short rendered trace. Machine paths, timings, engine build strings and the raw
   traceback stay in the workdir as evidence, never in the record. The verifier rejects any
   record that leaks an absolute path.
5. **The record shape is additive in the SFT schema.** `kind: repair`, `task: repair.fix`,
   `lang: code`, `difficulty: broken`, labels `{caseId, errorType, failureCode[, check]}`. The
   schema goes to v0.2.0 and accepts the v0.1.0 chat records unchanged; chat data is not rebuilt
   for a W1.7 addition.
6. **The prompt carries the contract, not just the code.** The user message contains the case id,
   params, the harness expectations and the trace; the system prompt says to return the complete
   macro as plain Python and to change only what the failure requires. A repair that fixes the
   crash by changing the expected geometry is not a repair.
7. **The corpus is pinned and replayed.** `manifest.json` pins the case file, the target
   candidate and the schema by sha256, records the FreeCAD version and the counts. `--check`
   verifies the offline contract (schema, mutation relationship, case facts, canonical bytes,
   pins) on every push; `--check --engine` re-executes everything and demands a byte-identical
   dataset, weekly and on demand.
8. **Repair data is a separate corpus, not part of the chat SFT split.** `data/training/repair-v0/`
   feeds Archie-Repair only. Mixing a code-repair target into the chat adapter would blur two
   task contracts the plan keeps separate.
9. **Round 1 is six mutations and says so.** It proves the pipeline (four exception classes, two
   measured bugs, deterministic replay), not the breadth of CAD failure space. New mutations are
   a new reviewed corpus with a recorded build.

## Consequences

- W1.7's training run starts from data that cannot contain a fictional bug: every pair was
  executed, and the fix passes the same case twice.
- A change to `geometry_build.py`, the case file or the schema makes the corpus visibly stale
  (pin/`--check` failure) instead of silently invalidating the training set.
- Trace normalisation keeps the corpus portable, but it also means the model never sees the full
  raw traceback. That is deliberate: the raw traceback adds machine paths and library frames, not
  repair signal. The workdir keeps the full evidence for humans.
- The corpus is engine-version sensitive where FreeCAD's exception text is; the manifest records
  the version and the weekly replay makes a drift a red check, not a surprise.
- Six records are substrate, not a trained model. No claim about repair accuracy exists until the
  W1.7 run is evaluated against the holdout CAD cases (W1.8's suite plus new cases).
