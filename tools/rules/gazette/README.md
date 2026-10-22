# Gazette extraction recipe — RAJUK 2008 (Imarat Nirman Bidhimala)

How the RAJUK 2008 rule pack was read out of the official gazette scan. Re-run this recipe
for pack revisions, for the BYO-PDF channel (plan §5.6), or for another authority.

## The source scan

- `data/downloads/sources/rajuk-bidhimala-2008-gazette.pdf` (gitignored) — Bangladesh
  Gazette, extra issue, 29 May 2008; printed gazette pages 2998–3196.
- sha256 `3318b3f434a9bf248c798c1982e800360ddf22ae7216966efeacf47d9b860d5e`, 1,946,482 bytes.
  A second, independent download (the "mirror") was byte-identical — always hash the scan first.
- **Page map:** gazette page = PDF page + 2997 (PDF page 1 = gazette page 2998). Every pack
  citation records both numbers; the invariant is enforced by tests.

## Verification tiers (record the tier for every fact)

- **page-image** — read from a rendered PNG of the page; the strongest tier available offline.
- **text-layer** — from the embedded text. Digits and Latin are reliable; **Bangla letters are
  mangled** (legacy pre-Unicode font encoding) and must be converted or eye-checked on a crop.

## The text layer checks the pack (2026-10-22)

The pack's FAR tables were read from **rendered pages** ✓ — the text layer's Bangla letters
are mangled ✓ ✓. But its **digits are plain** ✓ ✓, and the core's reader now reads the layer
at all ✓ (ADR-0081 ✓ ✓) — so the pack's numbers can be checked **against the source's own
digits** ✓ ✓, by script ✓, with no rendering and no human ✓ ✓:

    uv run --directory core python ../tools/rules/gazette/check_far.py

⇒ **the gazette's own text layer confirms 34 of the pack's FAR rows** ✓ ✓ (pdf pages 52-53 ✓
✓ — the whole of table 3(ka) ✓, the A1-A4 and the A5 columns ✓ ✓), and the **CDA's own copy
of the same schedule** ✓ ✓ confirms the same 34 ✓ ✓ — **68 checks, none disagreeing** ✓ ✓
✓.

⇒ **A row no document carries is a gap** ✓ ✓, never a disagreement ✓ ✓ (ADR-0080 ✓ ✓) — the
check says *not checked* ✓ and does not claim the row agrees ✓ ✓.

## Tools

Run from the repo root, e.g.:

    uv run --directory core --with pymupdf python ../tools/rules/gazette/render_pages.py 67 68 3
    uv run --directory core --with pymupdf python ../tools/rules/gazette/crop_page.py 67 0.60 0.20 1.00 0.40 6
    uv run --directory core --with pymupdf python ../tools/rules/gazette/dump_text.py

- `render_pages.py <startPdfPage> <endPdfPage> [zoom]` → `data/downloads/sources/pages/pNNN.png`
- `crop_page.py <pdfPage> <x0> <y0> <x1> <y1> <zoom>` (fractions 0..1 of page size)
  → `data/downloads/sources/crops/fNNN_crop.png`
- `dump_text.py` → `data/downloads/sources/rajuk-2008-text.txt` (page-marked)

## Legacy-font conversion (text layer → Unicode, as a lead to verify on a crop)

    uv run --directory core --with bijoy-to-unicode-file-converter python -X utf8 -c "
    from bijoy_to_unicode_file_converter.main_converter import Unicode
    print(Unicode().convertBijoyToUnicode('m¤^wjZ'))"    # -> সম্বলিত

`convertBijoyToUnicode()` is visual and occasionally mis-orders reph (র্) — treat its output
as a candidate reading, never as proof.

## House rules (quality law §9)

1. Digits first; only then letters.
2. Any letter that decides a rule must be confirmed on a **crop**; record citation key + page
   + tier in the pack immediately.
3. If the edition itself is broken (missing glyphs render as dotted circles / Λ shapes), the
   word goes to `spec/rules/rajuk-2008-candidates.md` — never guessed into the pack.
4. Mirror-check the PDF hash before any new extraction run.
