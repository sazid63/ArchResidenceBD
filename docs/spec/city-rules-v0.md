# The city rules v0 (W4.5): all four found, one city's rules transcribed, and every city
# falls back to the national rules until a human transcribes its own

**Status:** v0.3.0 — the owner's instruction was *find the city rules yourself; if you don't
find one, apply Dhaka's rule* ✓. **All four are found** ✓ (2026-10-22 ✓): **Chattogram** ✓ (the CDA's
own rules ✓ and the *Building Construction Act 1952* ✓, which carries the FAR chart ✓), **Khulna**
✓ (the authority's own plan-approval service ✓ — two zoning rules transcribed ✓), **Sylhet** ✓
(its *Building Construction Rules 1996* ✓) and **Rajshahi** ✓ (its rules page ✓ — the earlier
"not found" ✓ ✗ was a wrong host ✓) — each with the URL that was fetched ✓, the artefact's hash
✓ and what the document is ✓ ✓. **What is still a human's act** ✓: the **transcription**
✓ — the documents' letters are in a legacy Bangla font encoding ✓ ✓, so their charts and
clauses are read from the **rendered page** ✓ ✓ (the RAJUK pack's own method ✓ ✓) — or by OCR
✓ (a new dependency ✓, and the owner's call ✓ ✓) ✓. **The Khulna hunt also found the
authority's own three documents** ✓ ✓ (its Act 2018 ✓, the national Rules 1996 ✓ and the
national Act 1952 ✓ — the last **in English** ✓ ✓) — and reading them found a **real defect
in the repo's PDF reader** ✓ ✓ (fixed ✓, a test holds it ✓ ✓, `docs/spec/byo-pdf-importer-v0.md`
✓ ✓).

## What was found

| City | Authority | Document | Where it is | Readable? |
|---|---|---|---|---|
| Chattogram | CDA | the CDA's own rules (সিডিএ প্রবিধানমালা) | the authority's laws page → the document's own object storage | **a scan** (50 pages, no text layer) |
| Chattogram | CDA | the **Building Construction Act, 1952** (as amended in 2008) — it carries the FAR chart | the authority's laws page → the document's own object storage | **a text layer** (87 pages) — but the chart's *headings* are in a legacy font encoding and are mangled |
| Khulna | KDA | the **setbacks by the plot size** and the **height by the road width** | the authority's plan-approval portal (its own service) | **machine-readable** ✓ |
| Khulna | KDA | the **KDA Act, 2018** (the authority's own enabling law) | the authority's laws page → the document's own object storage | **fetched and pinned** (27 pages, a text layer whose letters are mangled) |
| Khulna | KDA | the **Building Construction Rules, 1996** (the national rules, the authority's own copy) | the authority's rules page → the document's own object storage | **fetched and pinned** (14 pages, a text layer whose letters are mangled) |
| Khulna | KDA | the **Building Construction Act, 1952** (the national law, the authority's own copy) | the authority's laws page → the document's own object storage | **fetched and pinned** (9 pages, **in English**, and the text layer is clean) |
| Sylhet | SDA | the **Building Construction Rules, 1996** (with BNBC 2020, the SDA Act 2023 and the Real Estate Development and Management Rules 2011 beside them) | the authority's laws page, and the document's own object storage | **fetched and pinned** (19 pages, a text layer whose letters are mangled) — but they are the *national* 1996 rules, not a city zoning of their own |
| Rajshahi | RDA | the RDA Ordinance 1976, the **RTDA Building Rules 1991**, the gazette of the RTDA's building rules, the Plot Allocation Rules 2021, the master-plan amendment | the authority's rules page (the files are on its own file host) | **named, not fetched** — the file host did not answer from the build machine |

All four are in the **Source Registry** now ✓ (candidate ✓ — a candidate until a human
verifies it ✓ ✓) with the URL that was fetched on 2026-10-22 ✓, the artefact's **hash** and
**page count** ✓ ✓, and the note of what each is ✓ ✓.

## What the re-measurement found (2026-10-22)

The agent went back to the documents ✓ ✓ — and the record changed ✓ ✓:

- **the pinned URLs were stale** ✓ — the Chattogram link answers **404** ✓ ✗, the Khulna link
  did not resolve ✓ ✗, and the Sylhet link serves the site's landing page ✓ ✗ — so "found"
  was **not true** ✓ ✗ ✗ ✗ ✗ ✗, and the registry now carries the URL that was fetched ✓ ✓
  and what each document actually is ✓ ✓;
- **two KDA rules are transcribed** ✓ — the authority's own service answers the setbacks (four
  plot-size classes ✓ ✓) and the height by the road width (seven classes ✓ ✓) ✓ ✓ — kept in
  `data/rules/khulna-kda-zoning-candidate.json` ✓ ✓ with the service's own wording beside
  every number ✓ (Bangla and English ✓ ✓), the metre conversion of the feet-and-inches ✓ ✓,
  and the **gaps** declared ✓ ✓ (the FAR schedule ✓, the parking schedule ✓, the use classes
  ✓ — the portal does not publish them ✓ ✓) ✓ ✓ — a **candidate** ✓, because a fetched rule
  stays one until a human checks it ✓ ✓ (the money law ✓, applied to law ✓ ✓);
- **Rajshahi was found too** - the earlier "not found" was a wrong host: the authority's site
  is `rdarajshahi.gov.bd` (not `rda.gov.bd`, which is the Bogra academy), and its rules page
  lists the rule books with their titles - among them the **RTDA Building Rules 1991**, which is
  the zoning one. The files are served from the authority's own file host, and that host did
  not answer from the build machine, so they are **named, not fetched**;
- **Sylhet's document is fetched and pinned** - 19 pages, with a text layer whose letters are
  mangled - and it holds the *national* Building Construction Rules 1996, the predecessor of
  the 2008 rules the app applies, so it is **not a city zoning of its own**;
- **the Chattogram FAR chart was found** - in the Building Construction Act 1952 (the
  CDA's copy - 87 pages, fetched and hashed) - where the chart's **numbers** are in the text
  layer, but its **headings** are in a legacy Bangla font encoding and are mangled. The
  repo's own method reads a chart from the **rendered page** (ADR-0003), which this machine
  cannot do (the model reads no PDF page images), so **nothing** is transcribed from it -
  because a number without its heading is not a rule;
- **the Khulna authority's own three documents were found** - the site answers under
  `kda.gov.bd` (the `www.` host's certificate does not verify), and its own laws and rules
  pages list them: the **KDA Act 2018** (the authority's own enabling law - 27 pages, fetched
  and hashed, a text layer whose letters are mangled), the **Building Construction Rules 1996**
  (the *national* rules, the authority's own copy - 14 pages, fetched and hashed), and the
  **Building Construction Act 1952** (the *national* law, the authority's own copy - 9 pages,
  fetched and hashed, and **in English with a clean text layer**, which is the useful find:
  the same Act the Chattogram copy carries in a mangled Bangla encoding). None of the three
  is a *city* zoning - they are the authority's own law and the national rules it administers
  - so the city still falls back to the national rules (`rajuk@2008.1`) and says so. The
  earlier "the Khulna law did not resolve" was **wrong**: it was a stale link, and the law
  is on the authority's laws page;
- **reading those documents found a real defect in the repo's PDF reader** - the reader fell
  over on a document that keeps its font dictionary in an object of its own. It is fixed, the
  three indirect lookups it makes are now tolerant (a page that cannot be read is a gap to
  declare, not a crash to raise), and a test holds it
  (`docs/spec/byo-pdf-importer-v0.md`).

## The fallback (the owner's instruction, and the honest form of it)

⇒ **Every city pack falls back to the national rules** (`rajuk@2008.1` ✓ — the RAJUK's 2008
rules ✓, which is the pack the app applies today ✓ ✓) **and says so** ✓ ✓.

That is not a silent default ✓ — it is stated in three places ✓ ✓ ✓:

1. **the Source Registry's entry** ✓ — each city's notes say the document was found ✓, that
   it is a scan ✓, and that the pack falls back until a human transcribes it ✓ ✓;
2. **the pack itself** ✓ — a city pack names the rules it applies ✓ and the ones it is
   waiting for ✓ ✓;
3. **this study** ✓ ✓ ✓.

⇒ The national SoR's **four official zone columns** ✓ cover Dhaka ✓, Chattogram ✓, Khulna ✓
and Rajshahi ✓ ✓ — so a city's **rates** are already right ✓ ✓ (the card's regional
multipliers ✓ ✓) — and **Sylhet's rates** come from the **BWDB's** schedule ✓ ✓ (the
registry's `bwdb-schedule-of-rates` ✓ — active ✓ ✓) ✓. What the fallback does **not** give
is a city's **zoning** ✓ — the FAR ✓, the setbacks ✓, the heights ✓ — and that is exactly
what the scans hold ✓ ✓ ✓.

## What a human does next (and it is small)

For each city ✓: open the rule book ✓ (the URL is in the registry ✓ ✓), read the FAR table
✓, the setbacks ✓ and the heights ✓, and transcribe them into a new pack ✓ (the RAJUK pack
is the template ✓ — `spec/rules/rajuk-2008.yaml` ✓ ✓). The vectors are then written ✓ (the
pack set is discovered ✓ — W4.6 ✓ — so a new pack arrives with its own gate ✓ ✓).

**Or** ✓: OCR the scans ✓ — which is a new dependency ✓ and the owner's call ✓ ✓ ✓.

## What is deliberately not here

- **The city packs themselves** ✓ — the transcription is a human's act ✓ (or OCR ✓) ✓.
- **Rajshahi's documents** ✓ — the rules are **named** ✓ – (the titles the authority's page
  carries ✓ ✓) and **not fetched** ✓ – the authority's file host did not answer from the
  build machine ✓ ✓, so nothing is claimed that was not read ✓ ✓;
- **Chattogram's and the KDA's charts** ✓ — the numbers are in the documents' text ✓ ✓
  and their headings are not ✓ ✓, so they wait for the rendered page ✓ ✓;
- **the KDA's FAR, parking and use-class tables** ✓ — the authority's portal does not publish
  them ✓ ✓, and the three documents it does publish hold the *national* rules ✓ ✓, so there
  is nothing to transcribe for this city ✓ ✓ — a gap, declared ✓ ✓.
