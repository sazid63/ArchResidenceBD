# ADR-0066 — An update is pinned to exact versions, and it refuses three things

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.4 (the updates) ·
**Plan:** §5.10 (the source registry) · §6 (the P5 track) · **Related:** ADR-0062 (the
manifest), ADR-0024 (the teacher is parked), the plan's *no new model members* decision
**Code:** `core/src/archres_core/updates.py` (the plan) · `tools/install/check_updates.py` (the
CLI) · **Tests:** `core/tests/test_updates.py` (14) · **Spec:** `docs/spec/updates-v0.md`

## Context

An update moves four things — the **app**, the **models**, the **rules** and the **prices** —
and each carries a version. The plan's §5.10 law says a fetched thing carries its
provenance, and the repo's own laws say three things about what an update may do:

- the **money law**: a price card that is a **candidate** stays a candidate until a human
  activates it (OWNER-ATTENTION #8);
- the **law does not move backwards**: a rule pack's version *is* the law the app applies;
- the **roster is fixed**: the plan's decision is no new model members without the owner's
  sign-off.

Nothing in the repo made an update obey them, because nothing in the repo planned an
update.

## Decisions

1. **An update is a plan first** ✓ — it says what each channel would change ✓ and what it
   refuses ✓, and it changes nothing until the plan is read ✓ ✓.
2. **Every change is pinned** ✓ — the plan carries the **exact version** each channel moves
   to ✓, so an update is a specific act ✓ and not "whatever is newest" ✓ ✓.
3. **A candidate price card stays a candidate** ✓ — the update **refuses** the activation ✓
   and says why ✓ ("activating a price card is a human act, not an update's" ✓) ✓ — and a
   newer **candidate** may still replace an older candidate ✓ (it is still a candidate ✓) ✓.
4. **The law does not move backwards** ✓ — an offered version **older** than the installed
   one is refused ✓ ✓, and a **pre-release is older than the release** ✓ ✓.
5. **The roster is fixed** ✓ — an update that adds or removes a model is refused ✓, and it
   is refused **at any version** ✓ (a roster can change without the version moving ✓) ✓.
6. **The installed side is read from the artefacts** ✓ — the app's version ✓, the model
   registry ✓, the rule packs ✓ and the rate cards ✓ — so the plan is about *this*
   installation ✓ ✓.

## Consequences

- **The money law survives an update** ✓ — the prices channel is refused ✓, and the card
  stays a candidate ✓ ✓.
- **A downgrade cannot happen by accident** ✓ — it is refused with the reason ✓ ✓.
- **The fleet's roster cannot change by accident** ✓ ✓.
- **What is not here** ✓: the **fetch** of an update ✓ (the downloader's job ✓ — and the
  pieces it fetches are checked ✓ ADR-0064 ✓), the **app's own update act** ✓ (the shell's
  ✓), and the **update service** ✓ (the owner's ✓ — where the offers come from ✓ ✓).
