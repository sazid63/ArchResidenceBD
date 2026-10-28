# The land units and the templates v0 (W5.7): the core's maths, the repo's starting points

**Status:** v0.1.0 — the app converts between land units with the core's own maths, and a
new project can start from a template the repo holds.
**Code:** `core/src/archres_core/bridge.py` (`units.convert` · `templates.list` ·) ·
`app/src/screens/UnitsScreen.tsx` · `app/src/screens/TemplatesScreen.tsx` · **Tests:**
`core/tests/test_bridge_units.py` (7) · **Decision record:** ADR-0070 · **Plan:** §5.1 (the
left navigation), §5.4 (the land-unit module)

## What it was

The plan's W5.7 asks for the **templates** and the **land-unit converter UI**. The
land-unit module was already in the core (deterministic `Decimal` conversions, the standards
pinned) and in the setup screen — but there was no converter *UI*, and the house types were
not a thing.

## What it is now

- **The conversion is the core's** — the app does not convert on its own, so a katha is the
  same number in the app, in the documents and in the drawings (one implementation).
- **An area and a length are not the same kind of thing** — and the core says so, rather
  than returning a number (a number would be a lie).
- **An unknown unit is refused by name** — the error says which unit.
- **A template is a committed example spec** — the repo's own — so a new project starts from
  something the repo holds and can be diffed against; and the template's facts (its floors,
  its occupancy) are read from the spec itself, not written twice.
- **The browser keeps the mock** — in the prototype (no core) the screens stay as they were.

## The measured output (2026-10-22)

The converter, through the channel the app uses:

```
   5 katha = 334.45094400 sqm (area)
   334.45 sqm = 4.999985887317453647252973518 katha (area)
   1 bigha = 14400 sqft (area)
   20 gonda = 66.89018880 sqm (area)
   10 ft = 3.0480 m (length)
   3 m = 9.842519685039370078740157480 ft (length)
```

(5 katha = 334.45 m² is the module's own **pinned** value ✓ — the standard the repo froze ✓
✓; and 1 bigha = 14 400 sqft ✓ ✓.)

The refusals:

```
   an area and a length are not the same kind of thing - convert one to the other first
   (a katha is an area, a foot is a length)
   unknown unit: 'banana'
   units.convert needs a target unit
```

And the templates — the repo's own examples:

```
   new-project                      Project 1                        floors 5
   three-storey-with-soil-report    Uttara Family House (internal test) floors 3
   two-storey-residential           Mirpur Duplex (internal test)    floors 2
```

## What is deliberately not here

- **Starting a project from a template** — the setup screen's own act; the screen picks the
  template and hands it on.
- **The gallery's artwork**.

## Checks

```powershell
uv run --directory core pytest -q tests/test_bridge_units.py
pnpm --dir app typecheck
```
