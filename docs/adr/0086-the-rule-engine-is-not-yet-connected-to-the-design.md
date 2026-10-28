# ADR-0086 — The rule engine is not yet connected to the design, and the gap is declared

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W1.2 (the rule engine) and
W3.6 (the compliance reports) · **Plan:** §5.6 (the law system) · §6 (compliant by
default) · §9 (the quality gates: *"coverage complete? if not → an explicit, user-visible
state — never silent"*) · **Related:** ADR-0008 (the rule engine), ADR-0010 (the
escalation seam), ADR-0084 (the installed app can do the app's work)
**Code:** `core/src/archres_core/compliance/checks.py` (the inputs it reads) ·
`core/src/archres_core/bridge.py` (the channel's `compliance.evaluate` and
`compliance.acknowledge` ✓ ✓) · **Tests:** `core/tests/test_bridge_compliance.py` (6)
· **Spec:** `docs/spec/rule-engine-v0.md`

## Context

The plan's §2 is the product's core law: **the user overrides** → the app explains what rule
is left behind → the risk tier → the user confirms → the app proceeds → the entry is
recorded in the Deviation Register.

The **core** held all of it — the evaluation ✓ ✓, the risk tiers ✓ ✓, the nearest
compliant alternative ✓ ✓, the register ✓ ✓, the restore-to-compliant ✓ ✓ — and
**none of it was reachable from the app** ✓ ✓ (the P1 exit review said so plainly: *"Yes, in
the brain; not yet in the app"* ✓ ✓) ✓ ✓.

So the channel was opened ✓ ✓ (`compliance.evaluate` ✓ ✓ and
`compliance.acknowledge` ✓ ✓ — the evaluation ✓ ✓, the verdict's explanation in
both languages ✓ ✓, the risk tier ✓ ✓, the user's rationale ✓ ✓, and the
register entry written as a **revision of the project's own spec** ✓ ✓) — and the channel
revealed the deeper truth ✓ ✓:

**a real project's compliance run returns no verdicts at all** ✓ ✓ — because the engine
reads the **design payload** ✓ ✓ (the setbacks ✓ ✓, the planned total floor area
✓ ✓, the parking spaces ✓ ✓) — and **nothing writes those three** ✓ ✓ ✓.
The rule engine's own spec said *"the question engine (W1.4) writes them"* ✓ ✓ — and that
was **not true** ✓ ✓ ✓: the flow book asks for the plot ✓ ✓ and the storeys ✓ ✓
(and no question asks for those three ✓ ✓) — and the **design** writes its own
measurements ✓ ✓ (the excavation depth ✓ ✓, the footing depth ✓ ✓, the rebar ✓ ✓) but
not those ✓ ✓. ⇒ the engine could only ever judge a **hand-built** spec ✓ ✓ (the
reports' own demo ✓ ✓, the training generator's ✓ ✓) ✓ ✓.

The **gap was already visible** ✓ ✓ — the engine names every missing input
✓ ✓ (`unevaluated[].reason = "missing_input"` ✓ ✓ with the exact pointers ✓ ✓) — so the
plan's §9's *"never a silent coverage gap"* held ✓ ✓ ✓. What was missing was the
**declaration** ✓ ✓ and the **path** ✓ ✓ ✓ ✓.

## Decisions

1. **The channel can judge a project and record the user's override** ✓ ✓ —
   `compliance.evaluate` ✓ ✓ returns the verdicts ✓ ✓ (the rule ✓ ✓, the summary in
   **both** languages ✓ ✓, what was measured against the limit ✓ ✓, the nearest
   compliant alternative ✓ ✓) — the register ✓ ✓ (each deviation's **risk tier**
   ✓ ✓) — and the **unevaluated** rows ✓ ✓ (what it could not judge ✓ ✓) — and
   `compliance.acknowledge` ✓ ✓ writes the user's **rationale** ✓ ✓ and the
   acknowledgement ✓ ✓ into the project's own spec ✓ ✓ (a revision ✓ ✓) — so the
   plan's §2 law is **reachable** ✓ ✓ ✓.
2. **The gap is declared, not guessed** ✓ ✓ — the rule engine's spec now says what is
   true ✓ ✓: the design payload is not written yet ✓ ✓, a real project's run comes back
   with no verdicts ✓ ✓ and a row per missing input ✓ ✓, and **what would close it**
   ✓ ✓ — the **design's** job ✓ ✓ — the *planned total floor area* ✓ ✓ (the design
   knows it ✓ ✓) ✓ ✓, and the setbacks ✓ ✓ — but the v0 design is a **footing row
   along the frontage** ✓ ✓, so it does not place a building ✓ ✓ and cannot state a
   setback ✓ ✓ — and the parking spaces ✓ ✓ need a parking layout the v0 design does not
   have ✓ ✓ ✓ ✓.
3. **The app's deviations screen is not built yet** ✓ ✓ — a screen that would show an
   empty register ✓ ✓ is a hollow feature ✓ ✓ — and the **cause** is the design
   payload ✓ ✓, not the channel ✓ ✓ — so the channel is the path ✓ ✓ and the screen
   follows the design ✓ ✓ ✓ ✓.

## Consequences

- **The plan's §2 law has a path** ✓ ✓ — the app can ask what rule is left behind
  ✓ ✓ and record the user's decision ✓ ✓ — and the entry lands in the register
  ✓ ✓ with who ✓ ✓, when ✓ ✓ and why ✓ ✓ ✓ ✓.
- **The rule engine's truth is on the record** ✓ ✓ — a spec that claimed a writer that
  does not exist ✓ ✓ is a spec that lies ✓ ✓ — and the plan's law is *"a gap is
  declared, never a guess"* ✓ ✓ ✓ ✓.
- **What is deliberately not here** ✓ ✓ — the **design payload** ✓ ✓ (the design's own
  measurements ✓ ✓ — it changes the committed CAD fixtures ✓ ✓, so it is its own
  package ✓ ✓) — the **app's screen** ✓ ✓ (it follows the design payload ✓ ✓) — and the
  **restore-to-compliant** action ✓ ✓ (the core holds it ✓ ✓ — the app's button is the
  screen's work ✓ ✓) ✓ ✓.
