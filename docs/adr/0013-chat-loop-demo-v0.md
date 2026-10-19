# ADR-0013 — Chat-loop demo v0: scenarios as data, stock model, unit-reporting escalation

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.12 defined by plan Appendix C)

## Context

W1.12 had to demonstrate the brain end to end: a dummy project interviewed in BN and EN on top of the real spec store, orchestrator and model fleet. Four points needed a decision:

1. **What "demo" means now.** The app UI does not exist (P2); a chat transcript in a terminal is the honest surface. The demo also has to be repeatable and inspectable, not a one-off script.
2. **Where the model is required.** W1.12 formally needs W1.6 (Chat SFT), which has not run. Plan §4 explicitly allows shipping on the stock base model, and we have the real router.
3. **What the model is asked to do on escalation.** Live testing exposed a contract flaw: the instruction told the model to convert to the canonical unit, and the stock 4B converted "সাড়ে তিন কাঠা" into `9 m²`. Arithmetic belongs to scripts, not the model.
4. **How to keep the demo honest.** Questions with no scripted answer must not stall, be silently assumed, or loop on a rejected answer.

## Decision

1. **A scenario is data, not code.** `{name, title{en,bn}, language, flows, spec, answers, maxTurns, notes}`; answers are keyed by question id, optionally `id@storey` for per-floor overrides, with four forms: text, choice id, skip, default. Unknown ids/flows/keys and bad shapes are load errors. Committed scenarios live in `tools/demo/scenarios/`; the demo spec sits beside them as `tools/demo/scenarios/demo-project.json` (two storeys, blank answers) so that adding it cannot shift the frozen example set that pins the training dataset.
2. **The runner drives the real `Session`.** `DemoRunner` prompts, answers, falls back, escalates, finishes and commits exactly like the app will. Missing **essential** answers are errors before they can stall; every other unanswered question uses its authored fallback; a rejected answer is reported after its second rejection instead of looping; an escalation with no model attached stops with a clear message.
3. **Escalation reports the user's unit; the app converts.** `ESCALATION_INSTRUCTION` and the context contract now say "do not convert units - the app converts to {unit}". This removes model arithmetic from the critical path. A valid-but-wrong reading remains possible on stock models (`confidence: low` is the signal); W1.6/W1.9 own the quality gate. The demo scenario therefore does not depend on model-parsed values.
4. **Stock base is acceptable for the demo.** The plan's fallback (ship on untrained base) makes the demo independent of Kaggle scheduling; the same artifacts will be re-run after W1.6 without changing the runner.
5. **Artifacts are the deliverable.** Every run writes `spec.json`, `transcript.json`, `coverage.json`, `summary.json` plus the revision store. Exit code is 0 only when the interview completed with no open essential questions.

## Consequences

- Verified runs: BN and EN both completed **69 coverage steps / 63 writing turns**, two authored fallbacks (prices, soil), no open essentials, 63 revisions, ~2.3 s each without a model; the live fleet run warmed chat/embed/rerank in 5.9 s and completed in 2.6 s. A live escalation probe returned valid JSON and a low-confidence write, but misread a Bengali fractional quantity — recorded as a model-quality finding, not hidden.
- Scenarios are reusable eval fixtures: W1.9 can score the same projects, and the artifact set is a deterministic record for review.
- The demo spec adds a fourth validated example, so the training manifest pins change; the dataset is rebuilt and pinned as a review event.
- Costs accepted: no UI, no interactive typing yet, no model-generated question phrasing; the demo's model use is limited to preload and escalation probes.
