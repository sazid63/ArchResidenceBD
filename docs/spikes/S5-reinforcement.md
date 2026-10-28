# S5 — FreeCAD-Reinforcement scripting: real rebar + BBS, headless

**Status:** done 2026-10-17 · **Verdict: yes** — column/beam/footing reinforcement is fully scriptable headless with the FreeCAD-Reinforcement presets, produces deterministic geometry, and exports a Bar Bending Schedule (SVG) in ~50 ms; no new dependencies (the addon is LGPL-2.1 and already listed for engine-side bundling).

**Question.** Can rebar for a column, a beam and a footing be created fully scripted (no GUI) from our element model, with extractable BBS data for the BOQ — and do the numbers hold up against independent checks (counts, lengths, weight)?

**Tested build.** FreeCAD `1.1.4` — `freecadcmd.exe` at `C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe`, `QT_QPA_PLATFORM=offscreen`. Addon [FreeCAD-Reinforcement](https://github.com/amrit3701/FreeCAD-Reinforcement) at commit `9f424ac` (cloned to `data/spikes/s5/`, gitignored).

## Method

- `tools/spikes/s5/rebar_bbs.py` runs inside `freecadcmd` on one fresh document with three concrete members: **C1** column 300×300×2700 (two-ties-six-mains preset), **B1** beam 3000×300×450 (two-legged preset), **F1** footing 1500×1500×500 (mesh + starter preset) — realistic diameters/spacings from the RAJUK pack's usual range (Ø16/Ø12/Ø8, @150).
- Explicit marks (`C1-D16-P1` …) are stamped on every set (the addon's default `Mark` = the type string, which makes BBS rows meaningless).
- Steel is measured from geometry: each rebar `Shape` is a compound of **swept solids**, so length = `Shape.Volume / (π/4·d²)` (edge sums are meaningless — a 2942 mm bar reads 801 mm).
- BBS via the addon's `getBarBendingSchedule(output_file=...)`; the SVG is checked for every mark.
- Determinism: the script was run twice back-to-back and `steel`/`checks`/inventory entries compared verbatim.
- Range checks + steel-weight check run in-script; exit code 0 = all pass.

## Results (run 2026-10-17, `data/downloads/s5/run.json`)

| Element | created | reinforcement produced |
|---|---|---|
| C1 column | 303 ms | 6 × Ø16 × 2700 mm = 16.2 m mains; 2 tie sets × 19 ties Ø8 = 28.2 m (rings 128.7 × 222.7 mm, spread z 38.6 → 2628) |
| B1 beam | 376 ms | 4 × Ø16 × 3000 mm = 12 m (top+bottom); 4 × Ø12 × 3000 mm = 12 m (sides); 21 stirrups Ø8 = 28.3 m (over x 39 → 2944) |
| F1 footing | 234 ms | parallel + cross mesh, 22 × Ø12 = 30.8 m at 40 mm cover; 5 starter ties Ø8 = 6.2 m; 4 × Ø16 starter bars = 0.9 m (436 mm dowels, stop at footing top — see note) |

- **15 rebar objects** total, all marked; BBS SVG **43,706 bytes in 52.7 ms**, all 8 marks present (table + shape cut list); whole script (3 members + inventory + BBS + checks) **1.56 s**.
- **Cross-check, two independent computations:** geometry math gives **110.0 kg / 135.5 m**; the addon's BBS table gives **112 kg / 141 m** — **1.8 % (weight) / 4 % (length) agreement**, the difference being the BBS per-piece lengths being centerline idealisations rounded to whole meters.

| Ø | BBS total | geometry total | BBS kg | geometry kg |
|---|---|---|---|---|
| 8 | 68 m | 62.8 m | 27 | 24.8 |
| 12 | 43 m | 42.8 m | 38 | 38.0 |
| 16 | 30 m | 29.9 m | 47 | 47.3 |
| Σ | 141 m | 135.5 m | 112 | 110.0 |

- **Determinism:** second run → `steel`, `checks` and per-object inventory **byte-identical** (timings excluded). Optimisation/QA law (plan §9) holds for this stage.
- BBS shape sketches reflect the true bar dims (2700 mains, 3000 beam bars, 1400 mesh bars, 436 dowels) and the SVG contains **zero engine/addon/brand strings** (checked) — safe for NativeCAD documents per ADR-0004; our title block layers on top (S3 approach).

## Gotchas (the real output of this spike)

1. **The selected face defines the whole build** (the big one). Rings/bars are drawn in the selected face's plane, and the distribution spreads along its normal with the amount = structure extent projected on that normal. Members must be handed their **cross-section** face: column → bottom/top face (normal along Z), beam → an end face (normal along its length), footing → a side face. A wrong face produces *silently plausible but wrong* steel — we measured 600 mm "main bars" and tie rings standing vertically across the width before switching.
2. Face-search helpers (`getFacenameforRebar`, `getFacenamesforFootingReinforcement`, `getFacenamesforBeamReinforcement`) use integer cross-product tests and leave their result **unassigned** when no face matches → `UnboundLocalError` deep inside `onChanged`; FreeCAD prints it and carries on, so the object silently ends up empty. The footing helper additionally requires a **horizontal** selected normal (a side face), else it can never resolve.
3. **Headless stubs are mandatory** in `freecadcmd`: a fake `DraftGui` module with a no-op `todo` (the footing path does `from DraftGui import todo`; importing the real one builds a Qt toolbar and crashes), and a console replacement for `PySide.QtGui.QMessageBox` (the addon's `showWarning` hard-aborts headless, exit −1073740791).
4. `BentAngle`/`BentFactor` are `App::PropertyInteger` — ints only (`TypeError` otherwise).
5. Bar lengths honour the top/bottom offset parameters: we passed 0 → bars run the **full** member length (2700/3000 mm, no end cover). Realistic detailing passes covers/offsets — a W2.x policy decision.
6. Footing starter bars ("column rebars"): with default column-spacing parameters the Ø16 dowels stop at the footing top; the column footprint/placement parameters (`column_*_spacing`, amounts) control the footing ↔ column layout — needs a proper pass with real values in W2.x.
7. BBS `Length in m/piece` is rounded to whole meters by default (436 mm dowels show as "0 m"); **counts are reliable, per-piece lengths are not** — our BOQ will use its own geometry math, with the BBS as the document artifact.

## Carry-forward to W2.x / W0.9

- Our reinforcement layer is a **thin deterministic wrapper**: element → anchor + face (same cross-section convention, computed from the element axis), explicit cover/offset policy, marks from BOQ numbering, warnings surfaced as data (never Qt dialogs), fresh document per job (S4 worker protocol), structured JSON out.
- Steel math stays ours (`volume / section`, testable); the addon BBS remains the **independent cross-check** and the drawing artifact (unbranded; our title block).
- Bundle: addon LGPL-2.1, engine-side only, already in `docs/licenses/THIRD_PARTY.md`; no UI surface, consistent with ADR-0004.

## Reproduce

```
git clone https://github.com/amrit3701/FreeCAD-Reinforcement.git data/spikes/s5/FreeCAD-Reinforcement   # 9f424ac
$env:QT_QPA_PLATFORM = 'offscreen'
& 'C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe' tools\spikes\s5\rebar_bbs.py
# outputs: data/downloads/s5/{frame.FCStd,run.json,bbs.svg}   (run.json: checks must all be true)
# diagnostics: tools\spikes\s5\probe_objects.py (dumps object internals from the FCStd)
# committed evidence copy of the BBS: docs/spikes/assets/S5-bbs.svg
```
