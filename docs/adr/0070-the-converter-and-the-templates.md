# ADR-0070 — The converter and the templates: the core's maths, the repo's starting points

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.7 (the templates and the
land-unit converter UI) · **Plan:** §5.1 (the left navigation) · §5.4 (the land-unit module) ·
**Related:** ADR-0003 (the rule pack), the plan's *frozen* unit standards
**Code:** `core/src/archres_core/bridge.py` (`units.convert` · `templates.list` ·) ·
`app/src/screens/UnitsScreen.tsx` · `app/src/screens/TemplatesScreen.tsx` · **Tests:**
`core/tests/test_bridge_units.py` (7) · **Spec:** `docs/spec/land-units-and-templates-v0.md`

## Context

The plan's W5.7 asks for the **templates** ✓ and the **land-unit converter UI** ✓. The
**land-unit module** was already in the core ✓ (deterministic `Decimal` conversions ✓, the
standards pinned ✓) and in the setup screen ✓ — but there was no converter *UI* ✓, and the
house types were not a thing ✓ ✓.

## Decisions

1. **The conversion is the core's** ✓ — the app does not convert on its own ✓, so a katha is
   the same number in the app ✓, in the documents ✓ and in the drawings ✓ ✓ (one
   implementation ✓ ✓).
2. **An area and a length are not the same kind of thing** ✓ — and the core says so ✓,
   rather than returning a number ✓ ✓ (a number would be a lie ✓ ✓).
3. **An unknown unit is refused by name** ✓ — the error says which unit ✓ ✓.
4. **A template is a committed example spec** ✓ — the repo's own ✓ — so a new project starts
   from something the repo holds ✓ and can be diffed against ✓ ✓; and the template's facts
   (its floors ✓, its occupancy ✓) are read from the spec itself ✓ ✓, not written twice ✓ ✓.
5. **The browser keeps the mock** ✓ — in the prototype (no core ✓) the screens stay as they
   were ✓ ✓.

## Consequences

- **The converter is in the app** ✓ — the units a Bangladeshi plot is measured in ✓ (katha ✓,
  shotok ✓, bigha ✓, gonda ✓, sqft ✓, sqm ✓) and the lengths ✓ (ft ✓, m ✓, inch ✓) ✓ ✓.
- **The numbers are the pinned ones** ✓ — 5 katha = 334.45 m² ✓ (the module's own pin ✓) ✓,
  1 bigha = 14 400 sqft ✓, 10 ft = 3.048 m ✓ ✓.
- **The templates are the repo's examples** ✓ — so they cannot drift from the specs the
  walking skeleton and the eval use ✓ ✓.
- **What is not here** ✓: **starting a project from a template** ✓ (the setup screen's own
  act ✓ — the screen picks the template ✓ and hands it on ✓), and the **template gallery's
  own artwork** ✓ ✗.
