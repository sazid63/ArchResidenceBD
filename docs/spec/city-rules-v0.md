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
| Chattogram | CDA | *Imarat Nirman Niyomaboli* (the building construction rules) · and the FAR chart | `cda.gov.bd/download/rulesand regulations/…` · and `cda.gov.bd/download/far.pdf` | **a scan** |
| Khulna | KDA | the authority's law (the building rules) | `kda.gov.bd/wp-content/uploads/2018/03/KDA-Law.pdf` | **a scan** |
| Sylhet | SDA | the **Building Construction Rules, 1996** (with BNBC 2020, the SDA Act 2023 and the Real Estate Development and Management Rules 2011 beside them) | `sda.gov.bd/pages/files/…` | **a scan** |
| Rajshahi | RDA | — | — | **not found** |

All four are in the **Source Registry** now ✓ (candidate ✓ — a candidate until a human
verifies it ✓ ✓) with their URLs ✓ and the note of what each is ✓ ✓.

## Why the documents could not be transcribed

The repo's PDF reader reads **text** PDFs ✓ — it does not OCR ✓ (that would be a new
dependency ✓, and the $0 law is the owner's call ✓ ✓). Measured on the fetched files ✓:

```
chattogram-building-rules         7,696,189 B    6 pages      0 chars  a scan
chattogram-far                     8,493,682 B    6 pages      0 chars  a scan
chattogram-standard-far-chart        282,276 B    1 page       0 chars  a scan
khulna-kda-law                    3,686,358 B   21 pages      0 chars  a scan
```

⇒ A city pack **cannot** be built from its own rules by the machine ✓ — the FAR table ✓,
the setbacks ✓ and the heights ✓ are in those scans ✓ ✓.

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
