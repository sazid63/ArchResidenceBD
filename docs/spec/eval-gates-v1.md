# The eval gates v0.1 (W4.3): the golden project, the plan's numbers, and a human gate that waits visibly

**Status:** v0.1.0 — the plan's v1 eval gates are live: the **BOQ within ±8%** of the
committed reference, the **CAD execution success above 90%**, and the **drawings
engineer-checked** (a human act — named and pending, never silently passed).
**Code:** `core/src/archres_core/eval/run.py` (the golden suite · the two-sided gate · the
pending gate) · `tools/eval/run_eval.py` · `tools/cad/verify.py` (the CAD rate gate) ·
`core/tests/test_eval_gates_v1.py` (7 tests) ·
**Artefacts:** `data/eval/chat-v0/gates.json` · `data/eval/chat-v0/engineer-check.json` ·
**Decision record:** ADR-0053
**Depends on:** W1.9 (the eval harness), W2.10 (the walking skeleton), W3.5 (the BOQ) ·
**Plan:** §7 (*eval gates: golden projects - BOQ within ±8%, CAD execution success >90%, drawings
engineer-checked*) · §6 (the BOQ's live prices) · §9 (no silent gaps)

## What it was

The harness ran and gated — seven suites, twelve gates, all green — but the plan's **v1** gates
did not exist — and the form the gate file used could not express them:

- **"BOQ within ±8%"** is a **band** (a deviation that is neither too big nor too small) — and the
  gate's form was *"value ≥ floor"* · a one-sided floor · which cannot say "within 8%" ··.
- **"CAD execution success >90%"** is a **rate** over a set of cases — and nothing measured one —
  the CI ran the CAD cases and failed on the first bad one — an all-or-nothing verdict that
  happens to be stricter — but is not the number the plan names ··.
- **"drawings engineer-checked"** is a **human act** — the repo cannot do it, and pretending
  otherwise would be a false gate —·.

## The three gates now

| Gate | How it is measured | Where |
|---|---|---|
| **the BOQ within ±8%** | the app's **own path** on the golden project (the spec → the foundation → the floor → the rebar → the takeoff → the priced BOQ), compared with the committed reference BOQ · the **deviation** is the metric · the gate carries the band | `eval/run.py:run_golden_suite` · the `golden/boqDeviationPct` gate |
| **the CAD execution success >90%** | the CAD execution-verify harness's report · the **success rate** is the metric · the gate fails the build below the floor | `tools/cad/verify.py --gate-min-success-rate` · the CI's engine job |
| **the drawings engineer-checked** | the record `data/eval/chat-v0/engineer-check.json` — who checked, when, and what they saw | the `golden/engineerCheckSigned` gate |

**The band.** A gate may now carry a **floor**, a **ceiling**, or both — so "within 8%" is
expressible · and a gate with neither is an error ··.

**The pending gate.** The engineer's check waits on a human — so the gate is marked
**pending** · it is *named* (with the owner's item number ✓), it is reported as
`[PENDING (owner item #9)]` ✓, it does **not** stop the build ·, and it is **not** a pass
✓ — the report's `ok` ignores pending gates but lists them ✓✓. Plan §9: *explicit,
user-visible state — never silent* ✓. When the owner signs the record, the gate becomes a
real floor and it fails like any other ✓.

## The measured output (2026-10-21)

- The **golden project** runs in the harness — 716 cases (715 frozen + the golden run) — and the
  app's BOQ is **154,276.09 BDT** against the reference's **154,276.09 BDT** — a deviation of
  **0.000%** — inside the plan's 8% ··.
- The **gate can fail** — a 12 m frontage (more footings) moves the BOQ to **177,333.36 BDT**,
  a **14.95%** deviation, and the 8% gate **fails** · (a test holds that ✓).
- The **CAD rate gate** reads the report and judges the rate — at 0.9 with two of three cases
  passed it exits 1 ✓, at 0.5 it exits 0 ✓ (a test holds that ✓).
- The **engineer's check** reports **PENDING (owner item #9)** — named ✓, visible ✓, not a
  pass ✓, and not blocking the build ✓.

## What is deliberately not here

- **The engineer's check is not done** — it is the owner's ✓ (OWNER-ATTENTION #9 ✓) and the
  record says so ··.
- **The golden project is one project** — the plan says "golden projects" (plural ✓); v0 has the
  one the repo's artefacts are built from ·· and the suite takes the project as an input,
  so more are a data change ✓✓.
- **The CAD rate is measured over the committed cases** — the plan's ">90%" is about the app's
  CAD path in production ✓, which the golden full run (W6.1 ✓) measures ✓✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_eval_gates_v1.py   # 7 tests
uv run --directory core python ../tools/eval/run_eval.py
```
