# Spike S3 — TechDraw headless automation (PDF/DXF without GUI babysitting)

**Question:** can FreeCAD produce a real drawing sheet — model → views → annotation → **PDF + DXF** —
fully headless via `freecadcmd` (no GUI process to babysit), deterministically enough to run from the
app's job runner?

**Verdict (2026-10-17):** **yes, with one design change.** Views project and export headless
(SVG fragments + DXF); PDF works via FreeCAD's **bundled Qt** (`QSvgRenderer` → `QPdfWriter`,
offscreen). **Native TechDraw dimensions do not work headless** (`2D references are corrupt (5)`) —
the annotation layer is computed by us from the model geometry and drawn by the composer.
Full evidence: `docs/spikes/S3-techdraw.md`.

## Pinned artifacts

| Piece | Version | Detail |
|---|---|---|
| FreeCAD / `freecadcmd` | 1.1.4 build 20260928 (`4fd3bf320`) | `C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe` |
| Python (inside FreeCAD) | 3.11.14 | ships with the build |
| PySide6 / Qt | 6.8.3 | bundled with FreeCAD; `QtPdf` **not** bundled |
| Sheet template | `ISO/A4_Landscape_ISO5457_advanced.svg` | from `data\Mod\TechDraw\Templates\` (viewBox `0 0 297 210` = **mm**) |
| Font | `osifont-lgpl3fe.ttf` | `data\Mod\TechDraw\Resources\fonts\`; must be registered with Qt |

Everything lands in `data/downloads/s3/` (gitignored — rendered outputs never enter git).

## Run

```powershell
$env:QT_QPA_PLATFORM='offscreen'
$fc = "C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe"
& $fc tools\spikes\s3\techdraw_headless.py          # full sheet pipeline + self-checks
& $fc tools\spikes\s3\check_view_orientation.py     # re-verifies the fragment orientation convention
```

Outputs (`data/downloads/s3/`): `page.svg` (composed sheet, the rendered source of truth),
`page.pdf` (vector, 300 dpi), `page.dxf` (view geometry), `preview_page.png`, `orientation_check.png`,
`run.json` (timings + sizes). The script exits non-zero if the sheet renders blank or the PDF is
invalid.

## Build notes (learned the hard way)

- **Native dimensions are GUI-only** in console mode — do not plan on `DrawViewDimension` values;
  compute annotation values from the model and draw them (the composer does; W2.5 will).
- **The template's user units are millimetres** (`viewBox="0 0 297 210"`), while
  `QSvgRenderer.defaultSize()` reports 1052×744 px (90 dpi). Composing in px coordinates silently
  renders a blank page — always compose in viewBox units.
- **`TechDraw.viewPartAsSvg()` fragments are already screen-space (y down).** Adding
  `scale(1,-1)` renders everything upside down; `check_view_orientation.py` proves the convention
  and should be re-run after FreeCAD/Qt upgrades.
- **`view.X` / `view.Y` are `PropertyDistance` quantities** — arithmetic with plain floats raises
  `Unit mismatch`; convert with `getValueAs("mm")`.
- **`writeDXFPage()` exports view geometry only** (LINE entities at their page positions — no
  template frame, no title block, no text, no dimensions). Treat the DXF as the CAD-interchange
  geometry layer and the PDF/SVG as the annotated sheet.
- **PDF bytes are not reproducible** (`/CreationDate` differs each run); content is:
  `page.svg`, `page.dxf` and the raster preview are byte-identical across runs.
- Register `osifont` via `QFontDatabase.addApplicationFont` before rendering, or sheet text falls
  back to a default font.
- **Branding:** everything user-facing (drawing title blocks included) carries **NativeCAD** —
  the engine name stays off every product surface; required notices live only on the app's
  Licences screen (ADR-0004), and internal docs keep it for provenance.
  The pipeline enforces it: the template's engine XML plumbing and the DXF's engine banner are
  scrubbed, the script hard-asserts the composed sheet and DXF carry no engine token, and
  `tools/ci/brand_guard.py` guards `app/` in CI.
- `freecadcmd` runs a script **exactly once**; duplicated console output under PowerShell `2>&1`
  is a capture artifact (verified with a file-append run counter). Redirect with `*>` and read the
  file when in doubt.
