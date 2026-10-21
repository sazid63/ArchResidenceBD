# The names and the brand law v0 (W2.13 follow-up): what a user sees, and what they must not

**Status:** v0.1.0 — the product's surfaces carry **ArchResidenceBD** and **NativeCAD** and
nothing else; the upstream project's name is out of every document the app ships.
**Code:** `core/src/archres_core/cad/brand.py` (the one implementation of the check) ·
`tools/ci/brand_guard.py` (the CI guard, now over the shippable documents too) ·
`core/tests/test_cad_brand.py` (9 tests) · **Decision record:** ADR-0044
**Depends on:** W2.5 (the sheet), W2.13 (the full-CAD tab), W3.3 (the drawing set), W3.7 (the
handoff) · **Plan:** §3 (NativeCAD is the CAD; no engine name in branding, UI copy or generated
documents) · §5.3 · ADR-0004 (the branding and attribution policy)

## The names

| | Name | Where the user meets it |
|---|---|---|
| The software | **ArchResidenceBD** | the app ✓, the project ✓, the BOQ ✓, the BBS ✓, the reports ✓, the pack ✓ |
| The CAD inside it | **NativeCAD** | the CAD tab ✓, the drawing set ✓, the DXF header ✓, the sheet's PDF ✓ |
| The engine underneath | *(the upstream project)* | nowhere a user can reach ✓ — bundled ✓, unmodified ✓, invisible ✓ |

**Locally hosted AI agents make the 3D building models** ✓ — the fleet runs on the machine ✓
(no cloud ✓), and the design button drives the build ✓.

## The law, and the one implementation of it

`archres_core.cad.brand` is the **single** place that knows the rule ✓, so the CI guard ✓ and
the live probes ✓ cannot drift apart ✓ — a generator that forgets to strip its output is
caught by the same law that scans the committed documents ✓ ✓.

The guard now scans the **shippable set** ✓ — the drawing set ✓, the documents ✓, the
compliance reports ✓, the prices ✓ and **the engineer pack's contents** ✓ — instead of trusting
each generator to police itself ✓ (the assumption the DXF leak slipped through ✓ ✓).

## What was wrong, and what each fix was

| Defect | Fix |
|---|---|
| The **DXF header** carried the upstream name ✓ (the DXF writer stamps it ✓) — and the DXF ships ✓ | the generator strips it ✓ → the probes assert it ✓ **and that the file is still a readable DXF** ✓ (the `HEADER`/`ENTITIES` sections ✓, geometry present ✓) — a strip that breaks the file is worse than the leak ✓ |
| The **engine pack was missing the DXFs** ✓ | they travel now ✓ (the PDF ✓, each sheet's SVG ✓ **and its DXF** ✓) — an engineer's handoff without the CAD ✗ is half a handoff ✓ |
| The **W2.5 sheet** called the first floor **"GROUND FLOOR PLAN"** ✓ — a drawing that mislabels itself ✗ | the label and the title follow the storey the design carries ✓ ("FLOOR 1 PLAN" ✓, "Foundation + Floor 1" ✓) |
| The **documents had no product name** ✓ | each names the product that made it ✓: the drawings say **NativeCAD** ✓, the BOQ/BBS/reports say **ArchResidenceBD** ✓ — each with the build ✓ |
| The **boot report** recorded the engine's **machine path** ✓ | it records the engine's name ✓ and says it is development evidence ✓ |

## The measured output (2026-10-21)

- The **brand guard** is clean over **67 files** ✓ (the app ✓, the drawing set ✓, the documents ✓,
  the compliance reports ✓, the prices ✓ and the pack's 17 parts ✓).
- The **DXF header** now reads "NativeCAD (ArchResidenceBD)" ✓ with its structure intact ✓
  (6 sections ✓, 106 entities ✓).
- The **drawing set probe** passes ✓ — 3 sheets ✓ — and the **sheet probe** asserts the same ✓.
- The **engine pack** is 1,596,617 B across **17 parts** ✓ (the DXFs among them ✓) and the
  bundle still imports back ✓.
- The **BBS and BOQ PDFs** carry "ArchResidenceBD 0.0.0" ✓ — the app's name and the build ✓.

## What is deliberately not here

- **The licence notices** ✓ — the owner's ✓ (P5's W5.1 ✓). This package is about **branding**
  ✓, not about licensing ✓ ✓.
- **A version in the DXF header** ✓ — the sheet's title block already carries the revision and
  the date ✓; a version in the DXF would be a second place for the same fact ✓, and two places
  to disagree ✓.

## Checks

```powershell
python tools/ci/brand_guard.py                    # the guard over the shippable set
uv run --directory core pytest -q tests/test_cad_brand.py
```
