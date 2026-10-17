# S3 — TechDraw headless automation (PDF/DXF, no GUI)

**Question.** Can the drawing pipeline run fully headless — FreeCAD `freecadcmd` turns a model into a
real drawing sheet (views + annotation + title block) and exports **PDF + DXF** — fast enough and
stably enough to become a job-runner step, without a GUI process to babysit?

**Verdict.** **Headless: yes — with one forced design change.** Views project and export without any
GUI (SVG fragments + DXF); the PDF export that works is **FreeCAD's own bundled Qt**
(`QSvgRenderer` → `QPdfWriter`, offscreen) rendering a composer-built sheet. The forced change:
**native TechDraw dimensions are unusable headless** — every `DrawViewDimension` fails with
`DVD::getDimValue … 2D references are corrupt (5)` in console mode. Annotation values (and the whole
annotation layer) therefore come from Python, computed from the model geometry — which is exactly the
plan's "scripts first, GUI last" anyway. End-to-end sheet: **~0.9 s wall per `freecadcmd` process**;
`page.svg` / `page.dxf` / raster preview are **byte-identical across runs** (PDF differs only in
`/CreationDate`).

**Tested build.** FreeCAD `1.1.4` (`1.1.4R20260928`, `(HEAD detached at 4fd3bf320)`) — `freecadcmd.exe`,
console mode · Python 3.11.14 (bundled) · PySide6/Qt **6.8.3** (bundled) · template
`ISO/A4_Landscape_ISO5457_advanced.svg` · font `osifont-lgpl3fe.ttf`.

**Machine.** Same Windows dev machine as S2 (16 GB RAM floor reference); no GPU use in this spike.
Cold process launch included in all wall-clock numbers.

**Method.** Two committed scripts (no ad-hoc state): `tools/spikes/s3/techdraw_headless.py` builds a
5-solid foundation model (2 pads + 2 columns + tie beam, 3400×1200×3000 mm), two projected views on an
A4 landscape sheet at 1:30, fills 12 title-block fields, composes the sheet, writes SVG/PDF/DXF and a
180 dpi preview, and self-checks (SVG parses, ≥100 ink samples, PDF header + `%%EOF`).
`check_view_orientation.py` renders an asymmetric model in four front/top × flip/noflip variants to
pin the fragment convention visually. Determinism: 3+ fresh runs, SHA-256 per output. DXF verified
numerically (entity census + line bounding box). PDF difference localized by byte diff.

## 1. What works headless (measured)

| Stage | Time (in-process) | Artifact |
|---|---|---|
| Model: 5 solids, fuse + `removeSplitter` | 25–190 ms (first call incl. warm-up) | `Part::Feature` |
| Page + 2 views (`DrawViewPart`, 1:30) recompute | 25–60 ms | projected geometry |
| SVG fragments (`TechDraw.viewPartAsSvg` per view) | 1–3 ms | 1151 / 959 chars |
| DXF (`TechDraw.writeDXFPage`) | 2–8 ms | 11.9 KB, 36 `LINE` entities |
| Compose sheet (template + fragments + annotation layer) | ~14 ms | `page.svg` 13.7 KB |
| Raster preview (`QSvgRenderer` → `QImage`, 180 dpi) | 185–330 ms | `preview_page.png` |
| PDF (`QSvgRenderer` → `QPdfWriter`, 300 dpi, offscreen) | 3–130 ms | `page.pdf` 506 KB (osifont embedded) |
| **Total per process (wall)** | **860–1000 ms** (3 runs: 925 / 874 / 860) | |

The finished sheet (ISO 5457 frame, filled title block, two annotated views, 3.40 m / 3.00 m / 1.20 m
dimensions) is `data/downloads/s3/preview_page.png` — visually verified; the front view renders
upright with columns over pads.

## 2. What does NOT work headless (with evidence, each one a trap)

1. **Native dimensions.** `DrawViewDimension` accepts `References2D` silently — even a
   nonexistent name read back unchanged (`('Edge999',)`!) — and `getRawValue()` stays `0.0` for
   every reference combination tried (single `Edge1..12`, vertex pairs, edge pairs) with the log
   line `DVD::getDimValue - <name> - 2D references are corrupt (5)`. Dimension resolution needs the
   GUI edge map built at paint time. **Consequence:** annotation values must be computed in Python
   and drawn by the composer.
2. **The GUI module.** `TechDrawGui` refuses: `ImportError: Cannot load Gui module in console
   application` — so the GUI's page-SVG/PDF export paths are out; `ViewObject` is `None` on every
   object.
3. **No page-level writers in the console module face.** `dir(TechDraw)` exposes 23 names; there is
   `viewPartAsSvg` / `viewPartAsDxf` / `projectToSVG` / `projectToDXF` / `writeDXFPage` /
   `writeDXFView` — and no `writeSVGPage` / `writePDFPage`. PDF is *our* composition + Qt.
4. **`writeDXFPage` is geometry-only.** Numeric census of `page.dxf`: 36 `LINE` entities, bbox
   `(28.33, 75.00) → (271.67, 175.00)` — **exactly** the two view footprints on the page, nothing
   of the frame/title block/text/dimensions (the other ~1500 DXF lines are boilerplate tables).
   The DXF is a CAD-interchange geometry layer; the annotated sheet lives in PDF/SVG.
5. **PDF has no Qt read-back here.** `QtPdf` is not bundled in FreeCAD's PySide6, so the PDF cannot
   be re-rastered with the same toolchain; verification is: identical draw-ops SVG raster to PNG +
   PDF header/EOF/size checks. (Carry-forward below.)

## 3. The pipeline this spike freezes (W2.5 starting point)

1. **Geometry** — `Part` solids from our scripts (mm, z-up).
2. **Views** — `TechDraw::DrawViewPart` per view on a `DrawPage`, `ScaleType=Custom`, explicit
   `X/Y`; recompute — fully headless.
3. **Geometry fragments** — `TechDraw.viewPartAsSvg(view)` per view; fragments are
   **screen-space (y down)** and centred on the view → composer translates only
   (`check_view_orientation.py` re-proves this).
4. **Annotation layer — ours.** Values come from the model (never hand-typed):
   ISO-style dimension lines with slash ticks + centred text, view captions; drawn in page mm.
   (Native dims stay out of the loop until FreeCAD makes them console-safe.)
5. **Sheet composition** — the template SVG's own coordinate system (`viewBox 0 0 297 210`, mm);
   annotation lines in a `matrix(1,0,0,-1,0,210)` group, text as top-level elements (no mirrored
   glyphs). Title-block fields filled by replacing the `freecad:editable` defaults (12 fields,
   asserted-found); for W2.5 generalize to parsing `freecad:editable` attributes.
6. **PDF** — `QSvgRenderer(composed)` → `QPdfWriter` A4 landscape, 300 dpi, `QT_QPA_PLATFORM=offscreen`,
   osifont registered with `QFontDatabase` first. No external binaries, no new dependencies
   (PySide6 already ships inside FreeCAD).
7. **DXF** — `TechDraw.writeDXFPage` (geometry at page positions).
8. **Self-checks in the script** — SVG parses; ink count > threshold (blank-page guard); PDF valid;
   DXF written. The script fails loudly instead of emitting a quiet empty sheet.

## 4. Determinism

3 fresh runs, SHA-256 of outputs:

| Output | run 1 | run 2 | run 3 | stable |
|---|---|---|---|---|
| `page.svg` | `D4BADF6C277675E6…` | same | same | **byte-identical** |
| `page.dxf` | `BF53A327A7FD4ABD…` | same | same | **byte-identical** |
| `preview_page.png` | `9B348130D6C0A3B5…` | same | same | **byte-identical** |
| `page.pdf` | `4448F3F6242F7DB4…` | differs | differs | 506,112 B both; **123 differing bytes, first at offset 107** |

The PDF difference is the embedded metadata timestamp — two runs:
`/CreationDate (D:20261017172058+06'00')` vs `(D:20261017172116+06'00')`; nothing else differs.
So: content-deterministic; PDF **bytes** need normalization (carry-forward) if we ever hash PDFs in
quality gates.

## 5. Findings that cost re-runs (consolidated)

1. Native dims corrupt headless (§2.1) — discovered by brute-forcing reference names after the first
   `getRawValue() == 0.0`.
2. **Template units are millimetres, not pixels.** `viewBox="0 0 297 210"` while
   `QSvgRenderer.defaultSize()` says 1052×744 (90 dpi). First composition placed content at
   px-scale coordinates (620, 219) → far outside the viewBox → silently blank preview. Compose in
   viewBox units.
3. **Fragment orientation is y-down** (screen space). With a `scale(1,-1)` the front view renders
   upside down (pads up, columns hanging). Proven by the 4-variant orientation check.
4. **`view.X`/`view.Y` are quantities** — first crash: `Quantity::operator -(): Unit mismatch in
   minus operation`; convert via `getValueAs("mm")`.
5. **The default template is an empty sheet** (519 B, no frame). Use the ISO 5457 templates; title
   block lives at x 107–287, y_svg 152–200 and drives the layout budget.
6. **osifont must be registered with Qt** or sheet text loses the drawing font (in the unregistered
   test even label glyphs rendered as boxes).
7. **`freecadcmd` console duplication is a capture artifact** — a file-append counter proves the
   script body runs exactly once (`RUNS=1`); use `*>` redirection when output matters.

## 6. Carry-forward (W2.5 TechDraw v0 → W3.3 full drawing set)

- **Annotation layer v1**: proper ISO dimension styling (arrows vs slash ticks, text offsets),
  leaders, view labels, centre lines; all values derived from the model/BOQ — none hand-typed.
- **Title block data model**: parse `freecad:editable` fields generically; feed from project
  metadata (name, author, date, scale, drawing number, revision) instead of string replacement.
- **PDF byte-reproducibility**: normalize `/CreationDate` post-write (or accept content hashes).
- **PDF visual regression**: rasterize `page.pdf` for comparison once a PDF rasterizer is available
  (QtPdf if bundled, else pdftoppm); today the SVG raster is the visual reference.
- **DXF annotations**: decide whether the DXF deliverable needs dimension/text entities (our own
  DXF writer or a post-pass) or whether geometry-only DXF + annotated PDF is the accepted split.
  (W3.3 "full drawing set" should settle this.)
- **Views to test in W2.5**: `DrawViewSection` headless (untested here), hidden-line style
  (`HardHidden`), centre marks, multi-sheet/multi-page PDFs, A3 sheets.
- **Batch behaviour**: N sheets in one `freecadcmd` run vs one process per sheet (startup is
  ~0.3–0.6 s of the ~0.9 s) — measure in W2.5 with the real drawing set.

## Reproduce

```powershell
# from the repo root; outputs go to data/downloads/s3/ (gitignored)
$env:QT_QPA_PLATFORM='offscreen'
$fc = "C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe"
& $fc tools\spikes\s3\techdraw_headless.py          # ~0.9 s; ends with S3_SPIKE_OK
& $fc tools\spikes\s3\check_view_orientation.py     # ends with ORIENTATION_CHECK_OK
```

Raw evidence (gitignored): `data/downloads/s3/` — `page.svg`, `page.pdf`, `page.dxf`,
`preview_page.png`, `orientation_check.png`, `run.json` (per-stage timings, sizes, ink samples).
Scripts: `tools/spikes/s3/` (see its `README.md` for the gotcha list).
