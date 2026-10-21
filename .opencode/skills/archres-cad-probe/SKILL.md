---
name: ArchResidenceBD CAD probe
description: Build and measure a CAD package in ArchResidenceBD the repo's way - design, macro, worker pool, live probe, committed artefacts, offline --check - and avoid the engine traps the repo has already hit. Use when adding or changing a geometry generator, a drawing, a mesh, a phase file, or a probe under tools/cad and core/src/archres_core/cad and design.
---

# A CAD package in this repo

**The engine does the geometry; the repo's code decides what geometry.** Never a hand-written
macro for a product feature: a demo script that bypasses the generator is how a product's
geometry stops being the product's.

## The pattern

1. **Design** — a pure function in `core/src/archres_core/design/` that turns the Building
   Spec into numbers (footings, columns, beams, rebar, views, dimensions). No engine imports.
2. **Macro** — the design rendered as a **string** the engine runs
   (`design/drawing.py`, `design/drawing_set_macro.py`). The macro is written to a
   `candidate.py` and run with `runpy`, so it must be **self-contained**: it imports the engine
   and the standard library, and nothing from this repo.
3. **Worker pool** — `core/src/archres_core/cad/pool.py` (`WorkerPool`, `WorkerConfig`): two
   isolated workers, a watchdog, a restart, deadlines. `launcher.py` runs the job;
   `launch_contract.py` holds the frozen job protocol and the boot script
   (`cad/boot/nativecad_boot.py`, the theme `cad/boot/nativecad.qss`).
4. **Live probe** — `tools/cad/<thing>_probe.py --engine "<freecadcmd>"` runs the job twice and
   compares the outputs.
5. **Committed artefacts** — what the probe measured is written into `data/cad/generated/…`.
6. **Offline `--check`** — the same probe with `--check` re-derives the artefacts (no engine)
   and compares them with the committed ones. This is a CI step, so a stale artefact fails CI.

The engine lives at `C:/1_SAJID/CE tools/FreeCAD/bin/freecadcmd.exe` (headless). The GUI
binary `freecad.exe` is for the boot probe only (it is the one that can show a window).

## The traps this repo has already hit

- **A macro is a non-raw string.** `"\n"` inside the template becomes a real newline and the
  generated macro will not parse. **Double the escape** (`"\\n"`) or make the template raw.
- **The macro cannot import the repo.** Pass everything it needs in the payload.
- **TechDraw in headless mode** needs the Qt application brought up before it will render a
  page, and the SVG is written before the PDF — the PDF is rendered from the SVG.
- **CID fonts** use 2-byte character codes, and a font with **no ToUnicode map** cannot be
  searched for its text — so the Bangla rendering is checked by rendering, not by grepping.
- **Object names are sanitised** by the engine, so a name with a space or a slash comes back
  different; compare by identity, not by the name you asked for.
- **The DXF header carries the engine's own name** — `TechDraw.writeDXFPage` stamps it. The
  generator strips it (`design/drawing.py`, `design/drawing_set_macro.py`) and the probe asserts
  **two** things: the name is gone, **and the file is still a DXF** (its `HEADER`/`ENTITIES`
  sections, entities present). **A strip that breaks the file is worse than the leak it hides.**

## The laws the CAD half obeys

- **Measured, not asserted.** The probe measures the geometry the engine built and compares it
  with the design that described it; a probe that only checks "the job returned ok" is not a
  probe.
- **Identical outputs under optimization.** Two runs must give byte-identical SVG and DXF (the
  PDF is exempt: it carries a `/CreationDate`).
- **Incremental ≡ full rebuild.** `tools/cad/equivalence_probe.py` guards it; a change to a
  generator must keep it true.
- **Never a silent gap.** A phase the engine did not build is named in the report, not implied.
- **The weekly `cad-execution` job** runs the committed CAD cases in CI; a package that changes
  the geometry must keep those cases green.
