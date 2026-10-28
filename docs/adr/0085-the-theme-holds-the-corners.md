# ADR-0085 — The theme's tokens hold the corners, and the UI guard holds that too

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.6 (the theme and the
i18n guard) · **Plan:** §9 (the quality gates: the UI review gate · *"soft theme; no
sharp edges"*) · **Related:** ADR-0074 (the app's screens read the core), ADR-0069 (the
design tokens)
**Code:** `app/src/cad/workspace.css` (the radii) · `tools/ci/ui_guard.py` (the guard)
**Spec:** `docs/design/design-tokens-v0.md`

## Context

The plan's UI review gate says every new screen is checked against the design tokens v0
— **soft theme; no sharp edges** · and the tokens file says it plainly: *"Every
corner is rounded; radius 0 never appears"*.

The guard held the theme for **colours** ✓ ✓ — a hard-coded colour in a screen is a
place the theme does not reach ✓ ✓ ✓ — and it held the **i18n** ✓ ✓ · but
not the **radii** ✓ ✓ · and the CAD workspace wrote three of its own ✓ ✓ ·
`20px` ✓ ✓, `12px` ✓ ✓ and `10px` ✓ ✓ · outside the tokens ✓ ✓ ✓.

⇒ A radius written outside the tokens is a place the theme does not reach ✓ ✓ · the
same hole the colour rule closed ✓ ✓ · and the plan's gate was not enforced ✓ ✓
✓.

## Decisions

1. **Every radius comes from the tokens** ✓ ✓ — `var(--r-*)` ✓ ✓ · and the
   workspace's three become the theme's own soft radii ✓ ✓ ✓.
2. **The UI guard holds it** ✓ ✓ — a `border-radius` outside the tokens is a
   problem ✓ ✓ · the same way a colour outside them is ✓ ✓ · so the
   gate cannot lapse ✓ ✓ ✓.

## Consequences

- **The plan's UI gate is enforced, not just written** ✓ ✓ — the gate said *no sharp
  edges* ✓ ✓ and nothing measured it ✓ ✓ · now something does ✓ ✓ ✓.
- **The theme reaches the CAD workspace** ✓ ✓ — the workspace is a screen of the
  app ✓ ✓ · so it is under the same law as the rest ✓ ✓ ✓.
- **What is deliberately not here** ✓ ✓ — the **documents'** own styling ✓ ✓
  (the drawings ✓ ✓ and the PDFs ✓ ✓ carry the CAD's style ✓ ✓ · the
  plan's UI gate is about the app's screens ✓ ✓) ✓ ✓.
