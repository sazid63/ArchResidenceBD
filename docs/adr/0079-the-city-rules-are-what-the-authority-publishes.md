# ADR-0079 — The city rules are what the authority publishes, and a fetched rule is a candidate

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W4.5 (the city packs — the
repo's half) · **Plan:** §5.10 (the source registry) · §5.6 (the law system) · Appendix C
(the exit criteria) · **Related:** ADR-0003 (the rule packs), ADR-0075 (the money is the
core's — the money law)
**Code:** `spec/sources/registry.yaml` (the four city entries + four new) ·
`data/rules/khulna-kda-zoning-candidate.json` (the transcribed rules) ·
`core/src/archres_core/pdf_text.py` (the reader's fix) ·
**Tests:** `core/tests/test_city_rules.py` (13) · `core/tests/test_pdf_text.py` (7) ·
**Spec:** `docs/spec/city-rules-v0.md` · `docs/spec/byo-pdf-importer-v0.md`

## Context

W4.5 is the **city rule packs** — Chattogram, then Khulna, Rajshahi and Sylhet (each
independent) — and it was open because the **transcription** was blocked: the three
documents that were found are **scans** (no text layer), so the repo's reader could not read
them.

And when the agent went back to the documents on 2026-10-22, two things turned out:

1. **the pinned URLs were stale** — the Chattogram link answers **404**, the Khulna link did
   not resolve, and the Sylhet link serves the site's landing page — so "found" was **not
   true**;
2. **the Khulna rules are published as data** — the authority's own plan-approval portal
   answers two of its zoning rules through its own service (the setbacks by the plot size,
   and the building height by the road width) — so those two **can** be transcribed, without
   OCR and without a new dependency.

And the Chattogram **FAR chart** was found — in the *Building Construction Act 1952* (the
CDA's own copy — 87 pages) — whose text layer carries the chart's **numbers** but whose
**headings** are in a legacy Bangla font encoding and are mangled.

## Decisions

1. **The registry's entries are measured, not assumed** — every entry now carries the URL
   that was fetched on 2026-10-22, the artefact's **hash** and **page count**, and what the
   document actually is ✓ — and the Chattogram entry no longer points at a 404 ✓.
2. **A fetched rule is a candidate** — the two KDA rules are kept with the service's own
   wording (Bangla and English) beside every number, in
   `data/rules/khulna-kda-zoning-candidate.json` ✓ — a **candidate**, because the money law
   (a fetched number is a candidate until a human activates it) applies to law as much as to
   prices ✓ ✓.
3. **The gaps are declared, not filled** — the candidate names the FAR schedule, the parking
   schedule and the use classes as **open** ✓ — the portal does not publish them ✓ ✓, and a
   gap is never a guess ✓ ✓.
4. **A number without its heading is not a rule** — the Chattogram FAR chart's numbers are
   readable in the text layer ✓ ✓, but its headings are not ✓ ✓, and the repo's own method
   reads a chart from the **rendered page** (ADR-0003 ✓ ✓) — which this machine cannot do
   ✓ (the model reads no PDF page images ✓ ✓) — so **nothing** is transcribed from it yet ✓
   ✓, and the city falls back to the national rules (`rajuk@2008.1`) ✓ and says so ✓ ✓.
5. **Every entry names what it really has** - the Sylhet document is **fetched and pinned**
   (19 pages, hashed) and the entry says it is the *national* 1996 rules rather than a city
   zoning - and the Rajshahi entry names the authority's rule books (the earlier "not found"
   was a wrong host) and says plainly that its file host **did not answer** from the build
   machine, so nothing is claimed that was not fetched.
6. **The KDA's own three documents are found and pinned** - the authority's site answers
   under `kda.gov.bd` (the `www.` host's certificate does not verify), and its laws and rules
   pages list them: the **KDA Act 2018** (its own enabling law, 27 pages), the **Building
   Construction Rules 1996** (the *national* rules, 14 pages) and the **Building Construction
   Act 1952** (the *national* law, 9 pages - and in **English**, with a clean text layer, which
   is the useful find). None of the three is a *city* zoning, so the city still falls back to
   the national rules - but the earlier "the Khulna law did not resolve" was **wrong**, and a
   stale link is corrected rather than kept.

## Consequences

- **The city's zoning is now real data** — the Khulna setbacks (four plot-size classes) and
  the height by the road width (seven classes) ✓ ✓ — with their provenance ✓ ✓.
- **The registry is true** — a source that answers 404 is not a found source ✓ ✓, and the
  registry now says what each document is ✓ ✓.
- **What is not here** — a **city rule pack** ✓ (the schema needs the FAR tables ✓ and the
  KDA's FAR is not published ✓ ✓), the **Chattogram chart's values** ✓ (the rendered-page
  read ✓ — a human's read ✓, or OCR ✓, and the owner's call ✓ ✓), **Rajshahi's**
  documents ✓ (named ✓, not fetched ✓ — the file host did not answer ✓ ✓), and the **card's activation** ✓ (a human act ✓ —
  OWNER-ATTENTION #8 ✓ ✓).
- **The fallback stands** — every city falls back to the national rules ✓ and says so ✓ ✓.
- **The reader now reads a document it could not read** — the KDA's Act 2018 put the repo's
  PDF reader down (it called `.find` on a match, not on the bytes), and the three indirect
  lookups the reader makes are now tolerant ✓ — a page that cannot be read is a **gap to
  declare** ✓, not a crash to raise ✓ (ADR-0080 ✓ ✓).
