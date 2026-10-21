# The live cost meter v0 (W3.8): what a change costs, in ৳, in Bangla numerals

**Status:** v0.1.0 — the project's cost moves as the design changes, and every change shows
its ৳ delta.
**Code:** `core/src/archres_core/design/cost_meter.py` (the delta) ·
`core/src/archres_core/bengali.py` (the numbers — the one implementation ✓) ·
`app/src/screens/BoqScreen.tsx` (the meter on the BOQ screen ✓) ·
`core/tests/test_cost_meter.py` (8 tests) ·
**Decision record:** ADR-0047
**Depends on:** W3.5 (the BOQ document ✓), W2.7 (the price service ✓), W2.11 (the incremental
build ✓) · **Plan:** §8 (*live cost meter: every change shows its ৳ delta, enabled by the
incremental BOQ*) · §6 (the BOQ's live prices ✓) · §1 (Bangla + English ✓)

## What it is

The meter takes **two BOQ documents** — the one before the change ✓ and the one after ✓ — and
says what moved ✓: line by line ✓, per phase ✓, and in total ✓.

- **The scope is the change.** The incremental build (W2.11 ✓) says which phases it rebuilt ✓;
  the meter shows the delta of those phases ✓ and **names the phases it did not rebuild** ✓ ✓.
  A meter that shows the whole project's cost after every change is not a meter, it is a
  total ✓ ✓.
- **The numbers are in the reader's script.** ৳ ১২৫,০০০ ✓ — the Bangla digits ✓, the taka sign ✓,
  and the **sign says which way the money moved** ✓ (a delta without a sign lies ✓ ✓).
- **A line that moved but has no price says so.** An unpriced line's amount does not move ✓,
  and the meter says that the quantity may have ✓ — a flat amount must not pass for "no
  change" ✓ ✓.

## Where the numbers are written

The **core owns the rule** ✓ — `archres_core/bengali.py` is the one implementation of the
Bangla numbers ✓ ✓, and the compliance report's own digit table now uses it ✓ (it had a copy ✓,
and two copies of one rule is how a rule drifts ✓ ✓). The app's screen has its own formatter ✓
(TypeScript and Python cannot share one ✓), and it follows the same rule ✓ ✓.

## The measured output (2026-10-21, `two-storey-residential`)

- The meter's numbers come from the BOQ ✓ — **119,599.70 BDT** for the example ✓ — and a
  **wider frontage** (12 m instead of 10 m ✓) means another footing ✓, and the meter says what
  that costs ✓.
- The **app's screen** shows the total ✓, the change ✓, the "before" ✓ and "after" ✓, and the
  lines that moved ✓ — in the reader's script ✓ ✓.

## What is deliberately not here

- **The meter's own document** ✓ — the plan's §6 lists no cost-meter document ✓, so v0 renders
  none ✓ (the meter is a **view** ✓ — the app's BOQ screen ✓ ✓).
- **The app's live wiring** ✓ — the app is still the W0.2 prototype with mock data ✓; the meter
  is wired to the mock's "before" quantities ✓, and the real call comes with the backend ✓ ✓.
- **A taka→dollar or taka→USD view** ✗ — the meter counts in the BOQ's currency ✓ (BDT ✓) ✓.

## What the meter's test found

The test needed a design change that moves the quantities ✓, and it found that **the foundation
ignores the spec's footing depth** ✓: the example's foundation phase carries
`"footingDepthM": 1.5` ✓ and the design builds a **300 mm** footing ✓ — because it reads
`/phases/foundation/data/footingDepthMm` (millimetres ✓) and the spec carries `footingDepthM`
(metres ✓). The spec's value is **silently ignored** ✓ ✓. The fix is **W2.2's** ✓ and it
**moves the numbers** ✓ (the foundation's volumes ✓, the BOQ ✓, the walking skeleton's
5.45175 m³ ✓ and every document that quotes them ✓), so it is **its own package** ✓ — recorded
on the board ✓, not slipped in here ✓ ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_cost_meter.py     # 8 tests
pnpm --dir app typecheck                                        # the screen compiles
```
