# The spec-decoding verdict v0 (W4.8): rejected, and the fleet says so

**Status:** v0.1.0 — the plan's speculative decoding is rejected on the evidence of spike S2, the
plan is amended to say so, and the fleet refuses a draft.
**Code:** `core/src/archres_core/serving/fleet.py` (the guards) ·
`core/tests/test_spec_decoding_verdict.py` (4 tests) ·
**Decision record:** ADR-0054 · **Plan:** §5.9 and §7 (amended to v1.6.2) ·
**Evidence:** spike S2 (`docs/spikes/S2-serve.md`)

## What the spike measured

| Configuration | Throughput | Draft acceptance | Greedy output |
|---|---|---|---|
| no speculation (the reference) | **57.98 tok/s** — | — | the reference |
| draft, CPU | 5.01 tok/s | 7.6 % | **diverged** |
| draft, GPU | 16.43 tok/s | 8.3 % | **diverged** |
| draft, GPU, q8 KV | 15.76 tok/s | 7.9 % | **diverged** |
| n-gram (no draft model) | 57.45 tok/s | — | identical |

Three findings, and the third is the one that decides it:

1. **~8 % acceptance** — a 16-token drafting budget yields ~2.3 usable tokens per event — so the
   draft does nearly all the work twice.
2. **3.5–11x slower** and **+1.5 GB VRAM** on a 6 GB card that must hold one model at a time.
3. **The greedy outputs changed.** The plan called speculative decoding *"lossless by
   construction"* — and the measurement says it is not: every draft configuration produced a
   different answer from the no-draft baseline.

The **n-gram** variant is the only one that kept the outputs identical — and it bought **nothing**
(57.45 against 57.98 tok/s). So there is no parameterization that helps: the draft is rejected
outright, and the n-gram variant is not worth carrying.

## The verdict, and the two halves

**The plan is amended (v1.6.2).** §5.9 and §7 now record the rejection and the evidence —
because a plan that says "lossless by construction" will be read as permission to add the draft
back. The rest of the plan stays frozen.

**The fleet refuses a draft.** The loader rejects:

- a **draft role** in the registry — *"a draft model is not in the fleet — speculative
  decoding was rejected on the evidence of spike S2 (ADR-0054): it was not lossless and it was
  slower"*;
- any **spec-draft flag** on a route (`--spec-draft*`, `--draft-max`, `--spec-type`) — the same
  error, with the same reason.

So the verdict is not a sentence a config edit can undo — and the error teaches whoever hits
it why.

## The measured output (2026-10-21)

- The **committed fleet** loads — four roles ✓, no draft ✓.
- A registry with a **draft role is refused** ✓, and so is one with a **spec-draft flag** ✓.
- The **plan's two claims** are amended ✓, and a test holds that they keep saying *rejected* ✓
  (the version history may quote the old claim while explaining it was wrong — the check is on
  the claims themselves ··).

## What is deliberately not here

- **The n-gram variant is not carried** ✓ — it is lossless and pointless ✓ (57.45 against
  57.98 tok/s ✓), and a flag that does nothing is a flag someone will debug for a year ✓.
- **The spike's own benchmark tool stays** ✓ (`tools/spikes/s2/bench.py` — it is how a
  *re-measurement* would be run — the registry's note says so ✓).
- **Nothing is removed from the registry** ✓ — the draft was never in it ✓ ✓; the exclusion was
  already named ✓, and now it is enforced ··.

## Checks

```powershell
uv run --directory core pytest -q tests/test_spec_decoding_verdict.py   # 4 tests
uv run --directory core python ../tools/serving/fleet.py --check
```
