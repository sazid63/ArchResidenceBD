# The BBS final v0 (W3.4): the bar schedule as the engineer's two documents

**Status:** v0.1.0 — the schedule is **xlsx + PDF** ✓: the editable workbook an engineer
reorders and re-prices, and the printable form an engineer signs.
**Code:** `core/src/archres_core/documents/xlsx.py` (the workbook writer) ·
`core/src/archres_core/documents/pdf.py` (the text PDF writer) ·
`core/src/archres_core/documents/bbs.py` (the rendering) · `tools/documents/render_bbs.py`
(build/check) · `core/tests/test_documents_bbs.py` (6 tests) · **Artefacts:**
`data/documents/bar-schedule.{xlsx,pdf}` + the manifest · **Decision record:** ADR-0040
**Depends on:** W2.4 (the schedule as data) · **Plan:** §6 ("BBS final - marks, cutting
lengths, shapes, xlsx/PDF") · §2.5 (provenance) · §9 (no silent gaps)

## What it is

W2.4 wrote the bar schedule as **data** ✓ — the marks ✓, the members ✓, the shapes ✓, the
lengths ✓, the weights ✓, validated against the frozen `bbs.schema.json` ✓. The plan asks for
the two forms an engineer actually uses ✓, and this is them ✓.

**The workbook** (`bar-schedule.xlsx`, 5,147 B ✓) has four sheets ✓:

| Sheet | What it holds |
|---|---|
| **Title block** | the project, the drawing number, the issue date, the **candidate - not for construction** status ✓, and the note that the schedule is data ✓ |
| **Schedule** | every mark: the mark ✓, the member ✓, the role ✓, the shape ✓, the diameter ✓, the count ✓, the length ✓ and the weight ✓ |
| **Totals** | the bar count ✓, the total weight ✓, the weight per diameter ✓ and the density ✓ |
| **Assumptions** | the authored assumptions (the diameters ✓, the cover ✓, the laps ✓) and why ✓ |

**The PDF** (`bar-schedule.pdf`, 7,493 B ✓, 3 pages ✓) is the printable form ✓: the title
block ✓, the schedule over as many pages as it needs ✓, and the totals with the assumptions ✓
on the last page ✓.

## The laws

1. **The documents carry the data, not a second opinion.** Every number in the workbook and the
   PDF is the schedule's own number ✓ — the lengths ✓, the weights ✓ and the totals ✓ are the
   ones the engine measured and the BBS computed ✓, never recomputed here ✓.
2. **The assumptions travel with the document.** A schedule whose numbers appear without their
   assumptions is a document nobody can check ✓ — so the assumptions have their own sheet ✓
   and their own page ✓.
3. **The numbers stay numbers.** In the workbook, a length is a number and not text ✓ — a
   spreadsheet can sum the column ✓, which a CSV-with-an-xlsx-name never could ✓.
4. **The document says it is a candidate.** The title block carries the same status the drawing
   sheet carries ✓ — nothing an engineer signs is silently final ✓.

## The writers (no new dependency)

An xlsx is a zip of XML ✓ and a text PDF needs only the built-in Helvetica faces ✓ — so both
are written with the standard library ✓. The workbook writer **checks its own output** ✓ (the
zip reads back ✓ and the required parts are there ✓) and the PDF writer checks that what came
out is a PDF ✓.

**What these writers are not:** the drawing set's PDF comes from the engine ✓ (W3.3 ✓), where the
vector geometry lives ✓ — a drawing printed from a text writer would be a lie about what the
document is ✓. And the **Bangla** is the browser's job ✓ (the plan prints the Bangla reports
through HTML→print-PDF ✓ "for correct glyph shaping" ✓) — the built-in PDF faces have no
Bengali ✓, so a Bangla PDF from this writer would be unreadable ✓. The writer writes what it
can write correctly ✓.

## The measured output (2026-10-21)

`tools/documents/render_bbs.py` renders the schedule of the example project ✓: **297 bars ✓,
278.9998 kg** ✓ (the same numbers the walking skeleton measured ✓ — 279.0 kg scheduled against
278.8 kg measured ✓), a **5,147 byte** workbook ✓ and a **7,493 byte** PDF ✓.

## What is deliberately not here

- **A drawing of the reinforcement** ✓ — the rebar is in the model ✓, and a rebar *drawing* is
  its own sheet ✓ (W3.3's set carries the structure, not the bars ✓).
- **The bar schedule's *shapes* drawn** ✓ — the shape is named ✓ ("straight" ✓), not drawn ✓.
- **The cutting list's bend deductions** ✓ — the lengths are the BBS's ✓ (the centreline ✓ plus
  the laps ✓ as the assumptions say ✓).
- **Bangla** ✓ — the workbook and the PDF are the English engineering documents ✓ (the plan's
  "English labels per BD industry norm" ✓); the Bangla reports are P3's HTML→print-PDF ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_documents_bbs.py    # 6 tests
uv run --directory core python ../tools/documents/render_bbs.py --check
```
