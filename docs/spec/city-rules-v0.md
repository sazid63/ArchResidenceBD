# The city rules v0 (W4.5): three found, one not, and every city falls back to the
# national rules until a human transcribes its own

**Status:** v0.1.0 — the owner's instruction was *find the city rules yourself; if you don't
find one, apply Dhaka's rule* ✓. **Found:** Chattogram ✓, Khulna ✓ and Sylhet ✓ (their
authorities' rule books, with their URLs ✓ ✓). **Not found:** Rajshahi ✓ (the authority's
site did not resolve and no archived copy of its rules was found ✓ ✓). And every city's
rules are **scans** ✓ — no text layer ✓ — so the repo's reader cannot transcribe them ✓
(OCR is not in the repo's law ✓) ✓.

## What was found

| City | Authority | Document | Where it is | Readable? |
|---|---|---|---|---|
| Chattogram | CDA | the CDA's own rules (সিডিএ প্রবিধানমালা) | the authority's laws page → the document's own object storage | **a scan** (50 pages, no text layer) |
| Chattogram | CDA | the **Building Construction Act, 1952** (as amended in 2008) — it carries the FAR chart | the authority's laws page → the document's own object storage | **a text layer** (87 pages) — but the chart's *headings* are in a legacy font encoding and are mangled |
| Khulna | KDA | the **setbacks by the plot size** and the **height by the road width** | the authority's plan-approval portal (its own service) | **machine-readable** ✓ |
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
  because a number without its heading is not a rule.

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
- **Rajshahi's rules** ✓ — not found ✓ ✓; the URL goes in the registry when it is ✓ ✓.
