# ADR-0054 — Speculative decoding is rejected: the spike measured it, and it was neither lossless nor faster

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W4.8 (the spec-decoding
verdict) · **Plan:** §5.9 and §7 (amended to v1.6.2) · **Related:** ADR-0006 (the
interface freeze), spike S2 (`docs/spikes/S2-serve.md`)
**Code:** `core/src/archres_core/serving/fleet.py` (the guards) ·
`core/tests/test_spec_decoding_verdict.py` (4 tests) ·
**Spec:** `docs/spec/spec-decoding-verdict-v0.md`

## Context

The plan (v1.5, owner-approved and frozen) says two things about speculative decoding:

- §5.9, the runtime stack: *"speculative decoding (Qwen3-0.6B draft for Chat; **lossless** —
  pilot in P1)"*;
- §7: *"Speculative decoding: **lossless by construction** (P1 pilot)."*

**Spike S2 ran that pilot** (`docs/spikes/S2-serve.md`) and measured the opposite of "lossless":
draft-model acceptance **~8 %** (7.6 % on CPU, 8.3 % on GPU), **3.5–11x slower** (16.43 tok/s
against 57.98), **+1.5 GB VRAM**, and — the decisive finding — **the greedy outputs diverged**
from the no-draft baseline in every draft configuration. The n-gram variant, the only one that
kept the outputs identical, bought **nothing** (57.45 tok/s against 57.98).

So the plan's claim is false, and a plan that says "lossless by construction" is a plan somebody
will read as permission to add the draft back.

## Decisions

1. **The verdict is reject.** Not "adopt", and not "parameterize": the measured draft is slower,
   it costs VRAM, and it changes the outputs. A feature that changes what the model says and
   makes it slower is not a feature — it is a different product with a different answer
   (ADR-0024 retired the teacher on the same grounds: the work did not buy what it cost) ·.
2. **The plan is amended (v1.6.2).** §5.9 and §7 record the verdict and the evidence, and the
   version history says why the old claim was wrong — so the plan cannot be read as permission
   ··. The plan stays frozen otherwise ··.
3. **The fleet refuses a draft, so the verdict cannot be undone by a config edit.** The loader
   rejects a **draft role** and any **spec-draft flag** (`--spec-draft*`, `--draft-max`,
   `--spec-type`), and the error names the evidence (S2) and the decision (ADR-0054) — so
   whoever hits it learns why, instead of finding a rule with no reason ··. A verdict that
   lives only in a document is a verdict one config edit undoes ··.
4. **The registry keeps the exclusion named.** `spec/models/registry.json` already records the
   deliberate exclusion in its notes ("do not re-add without a new measurement") — and the new
   guard is what makes that note enforceable rather than advisory ··.

## Consequences

- The **plan is true** — its runtime stack and its inference line now say what was measured
  ··, and a test holds that they keep saying it ··.
- The **fleet is the four roles** — chat, repair, embed, rerank — and a draft cannot be
  added to it, by role or by flag ··.
- The **error teaches**: it says *speculative decoding was rejected on the evidence of spike S2 —
  it was not lossless and it was slower* ··.
- **A re-measurement would be a new spike**, not a config change — and the registry's note
  already says so ··.
