# ADR-0015 — Eval harness v0: cases from pinned sources, a split frozen before training, gates that can only move on purpose

**Date:** 2026-10-20 · **Status:** accepted · **Work package:** W1.9
**Spec:** `docs/spec/eval-harness-v0.md` · **Code:** `archres_core.eval`, `archres_core.agent.law`
**Data:** `data/eval/chat-v0/`

## Context

W1.12 closed the demo loop on the stock base model and immediately exposed the problem this
package exists to solve: the demo "worked", a live probe showed the 4B misreading a Bengali
fraction, and there was no number that would have caught it. The plan's quality law (§9) says
identical outputs under optimisation, never silent coverage gaps, and unverified content is a
candidate. None of that is enforceable without a frozen question set, a frozen split and a
recorded baseline.

Constraints:

- **$0, offline, one app.** CI has no GPU and no llama-swap. A gate that needs a warm 4B is a
  gate nobody runs.
- **SFT is next.** W1.6/W1.7 are about to train on `data/training/chat-v0/`. The eval split must
  be frozen **by source question id before** any paraphrase is generated, or variants of one
  question land on both sides and the score is meaningless.
- **No new dependencies**, no paid eval service, no hosted benchmark.
- Windows dev machine; every CLI must survive a cp1252 console.

## Decisions

1. **Cases are data, generated, and checked in CI.** `cases.jsonl` is compiled from the rule
   pack, the scripted dataset, the flow book, the demo scenarios and one hand-written file
   (`authored.yaml`). Build is byte-stable; `--check` fails on drift. A change to any input is
   therefore a visible review event ("this is what we now measure"), not a silent edit.
   Compiling happens from sources, so a case never has two homes.
2. **The split is frozen by hashed source id, not by a run-time random draw.**
   `sha256(f"{seed}:{key}")[0] < 96`, seed 20261020, key = question id or scenario stem.
   `build_cases.py --init-split` writes it once; a plain build **fails without it**, so a clone
   cannot re-split by accident. Deterministic machinery (`rule.vector`, `register`) is declared
   `engine` instead of pretending to measure generalisation; `rag` is always `holdout` because
   nothing about retrieval was trained.
3. **Deterministic suites are gated at 1.0; the model suite is gated at the recorded stock
   baseline.** A model that scores below the base model fails CI. Floors are recorded numbers
   with the model, date and count in `gates.json`; moving one is a reviewed act, not a tweak.
4. **`parse` measures the parser's safety contract, not its agreement with the dataset.** The
   dataset's parse labels are the *assisted-path* target (fuzzy labels, topicality, phrasing),
   so gating equality would demand work that belongs to the model seam. What is gated:
   `neverStalled` = 1.0 and `agreement:clean` = 1.0. Everything else is reported per input kind
   as a visible deferral — that is the headroom `model.parse` has to close, and it is visible
   rather than averaged away.
5. **A model case passes only when the decision *and* the accepted value are right.** Accepting
   the wrong value is the one failure that reaches the user as a clean confirmation, so it can
   never count as a pass. Recorded replies are committed (`replies/<model>.jsonl`, sha pinned
   in the manifest) because CI cannot start a fleet; re-recording is a deliberate commit.
6. **A gap is either a scored expectation or a reported probe — never a deletion.** A
   `declared_gap` case asserts the desk stops at the gap document. A question the corpus cannot
   answer is a `coverage_probe`: run, reported with its status and top hit, never gated, because
   *no honest expectation exists yet* — the corpus holds no staircase-width, parapet-height,
   concrete-grade or lift-count provision, and the desk's gap path only fires when a gap
   document matches. Recording it every run keeps the hole visible.
7. **`LawDesk` is the chat seam, and the gap is declared.** `agent.law.LawDesk` turns a
   `SearchResult` into one of three honest outcomes (`retrieved` with citations,
   `declared_gap`, `not_found`) with hand-authored BN/EN refusals, and the reply language follows
   the *question*, never the retrieved documents. It is **not** wired into the W1.10 `Session`
   turn loop: doing that is chat-shell work (P2), and half-wiring a law dispatch would be a
   silent capability claim. The `rag` suite therefore measures the desk, and both the spec and
   this ADR say so.
8. **The harness may find defects outside its own package, and they are fixed at the source.**
   It found 6 `affirm_sloppy` training records that labelled "yes" as `false`; the operator kept
   the base value. Fixed in `training/mutations.py` (the operator now returns `value: True` and
   the verifier recomputes from it), the dataset was rebuilt under a new sha, and a regression
   test pins it. Weakening the eval comparison instead would have preserved a lie that W1.6 was
   about to learn.

## Consequences

- The numeric baseline for W1.6/W1.7 now exists (`gates.json`), and a regression is a red CI.
- `parse` will keep reporting ~0.72 agreement until W1.4 closes its gaps; that is a known,
  listed number, not a hidden one.
- `model.parse` is a 60-case holdout sample scored from a committed reply file — it detects
  direction and regressions, not a generalisation claim.
- The recorded baseline is one model at one moment; a new model needs a new reply file and a
  new floor, committed together.
- The coverage probes will look "wrong" on every run until the corpus grows. That is the
  point: they are the visible edge of what this app can currently claim.
