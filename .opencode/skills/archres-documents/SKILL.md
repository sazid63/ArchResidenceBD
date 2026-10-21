---
name: ArchResidenceBD documents
description: Write the documents ArchResidenceBD ships - the bar schedule, the bill of quantities, the compliance reports and the engineer handoff pack - with the repo's own writers, its brand law and its no-falsification rules. Use when changing anything under core/src/archres_core/documents, tools/documents, tools/compliance, or the handoff pack.
---

# The documents the app ships

**xlsx + PDF, both of them, every time.** The plan's deliverables (§6): the BBS and the BOQ
each exist as an editable workbook and a printable form. One of the two is not "the document".

## The writers (stdlib only, no new dependency)

- `core/src/archres_core/documents/xlsx.py` — an xlsx is a **zip of XML**, so the standard
  library can write one. It writes **real cells** (numbers stay numbers, so a spreadsheet can
  sum them ✓; strings stay strings ✓), a **sheet per table** ✓ with the column widths set ✓,
  and it **verifies its own zip** when it is done — a workbook that is not a valid zip is a
  broken deliverable, and that is a `DocumentError`, never a silent gap.
- `core/src/archres_core/documents/pdf.py` — a small vector PDF writer; the producer line
  names the product that made the file.
- `core/src/archres_core/documents/{bbs,boq}.py` — the two schedules' content.
- `core/src/archres_core/documents/pack.py` — the engineer review pack and the project bundle.

## The rules

1. **Each document names the product that made it.** The **drawings** are the CAD's
   ("NativeCAD <build>"); the **BOQ, the BBS and the reports** are the app's ("ArchResidenceBD
   <build>"). The version comes from `app/package.json` — one build, one version, everywhere.
2. **The upstream project's name must not appear in any shipped document** (ADR-0004). The
   check is `archres_core.cad.brand` — the **one** implementation, used by the CI guard and the
   live probes alike. The guard's scope is the **shippable set**: the drawing set, the documents,
   the compliance reports, the prices, and the **contents of the pack**.
3. **The candidate status travels.** Every document an engineer receives says it is a
   **candidate — not for construction**, until a human activates the price card.
4. **The pack carries what was measured, not a re-render** — the committed documents, so the
   pack cannot contain a number the repository does not have.
5. **The pack is verifiable** — the manifest carries the sha256 of every part, and the import
   refuses a bundle whose parts do not match. A handoff that arrives changed **says so**.
6. **The bundle is round-trippable** — what goes in comes back (the spec, the deviations, the
   outputs).
7. **No hand-maintained totals in the prose.** A document's prose carries the structural facts
   (the sheets, the pages, the parts, the taka, the kilograms); the byte counts live in the
   CI's output, because they drift.

## The tools

`tools/documents/render_bbs.py`, `render_boq.py`, `render_pack.py` (each with `--write` and
`--check`), `tools/compliance/render_reports.py`, and `tools/boq/build_boq.py` (the takeoff the
BOQ document is priced from). The Bangla rendering has its own guard
(`tools/ci/bangla_render_guard.py`) — the Bangla is **rendered**, not grepped, because a font
with no ToUnicode map cannot be searched for its text.

## The laws

- **Never falsify a document.** Unverified content is a candidate, and says so.
- **A document may not mislabel itself** — a sheet that shows the first floor and calls it the
  ground floor is a false document, and the no-falsification law applies to drawings exactly as
  it applies to prices.
- **Deterministic bytes.** The same input gives the same file (the archives are written with
  fixed timestamps), so a document can be compared, hashed and diffed.
- **Every amount re-derives** from the line's own quantity and rate — a number that cannot be
  recomputed by hand is not a number that goes to a client.
