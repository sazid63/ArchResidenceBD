# RAJUK 2008 rule pack — open items (candidates)

Companion record for `spec/rules/rajuk-2008.yaml` (pack `rajuk@2008.1`, status `candidate`).
Referenced by the pack's `review.openItemsFile`; every item below is mirrored by an entry in the
pack's `gaps` array (open items only). Items marked **RESOLVED** are kept for the record — do not delete.

- Source of record: 2008 gazette PDF, sha256 `3318b3f434a9bf248c798c1982e800360ddf22ae7216966efeacf47d9b860d5e`.
- Gazette page = PDF page + 2997. Second copy ("mirror") verified byte-identical on 2026-10-17 (no independent witness).
- Verification tiers: `page-image` (letters and digits read from rendered page images) and `text-layer`
  (digits only — this PDF's text-layer letters come from broken legacy fonts and are never trusted directly).
- Legacy-font words are decoded with the Bijoy converter (recipe in `tools/rules/gazette/`).

## C1: §46(5)(ক) — roof/shed word — OPEN

- Where: gazette p. 3044–45 (PDF 47–48), §46(5)(ক) item; crops `f047_crop.png`, `f048_crop.png`.
- Issue: one word in the passage describing the permitted roofed structure (the sentence that also carries
  the “৫০% মাটি রাখিবার শর্ত মানিয়া” condition) could not be read with full certainty from the available render.
- Pack behaviour: the provision is written only to the extent readable; the uncertain word is not asserted.
- To resolve: engineer check against a clean print of the gazette.

## C2: §46(5)(ঙ) — canopy tail — RESOLVED (2026-10-17)

- Re-verified tail reading “...৮ মিটারের নিচে হইবে না” (cornice edge never below 8 m from ground level);
  the digit ৮ was checked on the page image (crop `f049_crop.png`).
- Used by provision `s46-5-items-3`.

## C3: Schedule 4 — flats up to 90 sqm, motorcycle/car condition word — OPEN

- Where: Schedule 4 notes, gazette p. 3070 (PDF 73).
- Issue: one word in the motorcycle/car parking condition for flats up to 90 sqm could not be read with certainty.
- Pack behaviour: parking note `s4-n-small-flat-word` carries the marker “see candidates C3”.
- To resolve: engineer check against a clean print.

## C4: Appendix 5 (definitions) — OPEN (not yet transcribed)

- The regulation's Appendix 5 carries definitions; it has not been transcribed.
- Why it matters: pack summaries use terms (open space, covered area, etc.) whose exact legal definitions
  should be cited once the rule engine (W1.2) starts interpreting them.
- To resolve: locate and transcribe Appendix 5; add a glossary citation layer to the pack.

## C5: §48(5)–(9) — subdivision items — RESOLVED (transcribed 2026-10-17)

- Sub-plot access; minimum 5 katha in planned areas; single-plot private road ≥ 3.65 m; non-residential ≥ 6 m;
  road area excluded from FAR; road > 33 m → rule 51(1); multi-plot road ≥ 6 m; private-developed areas per Rules 2004.
- Used by provision `s48-subdivision`.

## C6: §51(11) step granularity + §51(13)/(15) — PARTIALLY OPEN

- (11) The “+0.05 FAR per 0.30 m extra road width” bonus: the text does not state whether a partial step
  (< 0.30 m) earns a pro-rata bonus. Working reading: full steps only, capped at the next printed table step
  (also see §54(4) and §54(7)). Needs engineer confirmation.
- (13) Use change → lesser of the two use FARs; reading recorded (used by provision `s51-9-14-road-width`).
- (15) “নিম্নের ছক” (the lower table): the word was identified from sentence context, but the printed glyph for
  the ম্ন conjunct is missing from this edition (renders as a dotted circle). Reading is probable, not proven.
- To resolve: engineer confirmation for (11); second-edition check for (15).

## C7: §51(5)(ড)–(ন) — exclusions — RESOLVED (transcribed 2026-10-17)

- (ড)–(ন) transcribed from crops `p064_items.png`, `p065_items.png`, `p065_mid.png`, `f065_crop.png`.
- Used by provision `s51-4-5-exclusions`.

## C8: Post-2008 amendments — OPEN (research item)

- This pack encodes the 2008 text as printed. Later amendments (if any) that change FAR/coverage/setbacks
  are not yet researched.
- To resolve: obtain amendment gazette notifications and diff against this pack; amendments land as new
  pack revisions (pack id scheme `rajuk@2008.<n>` keeps the regime, increments revision).

## C9: 2025-12-14 DAP FAR reform — OPEN (primary source needed)

- The 2025 DAP FAR reform is tracked as metadata only; the primary DAP document has not been obtained and
  nothing from it is encoded.
- To resolve: obtain the DAP 2025 document; encode as a separate regime (e.g. `rajuk@2025.x`) or as an
  amendment set, on owner decision. Until then the app must surface that a newer regime may apply.

## C10: Two legacy-font glitch words (§52(2), §53(2)(ঙ)) — OPEN (readings derived)

- §52(2), gazette 3064 (PDF 67): text-layer span `¯^-¯^`. Printed glyphs are broken in this edition
  (render as Λ-shaped marks), but the text layer preserves the legacy encoding; per the conversion map
  (¯ = স্, ^ = ব) it decodes to **“স্ব-স্ব”**, which fits the “limits fixed by the respective authorities”
  idiom. Confidence: high.
- §53(2)(ঙ), gazette 3065 (PDF 68): span `¯^v_©` → স্+ব+া+থ+র্; most probable **“স্বার্থ”** (a reph
  re-order the converter misses), in the sentence “...জনগণের —— সুবিধাদি...”. Confidence: medium.
- Mirror PDF is byte-identical; confirmation needs a different scan/edition.
- Pack behaviour: neither word is asserted in provision text until confirmed.

## C11: §58 minimum space requirements — OPEN (scope decision recorded)

- §58 “ইমারতের পরিসরের ন্যূনতম চাহিদা” begins at gazette p. 3072+ (PDF 75+, crop `f075_crop.png`).
  Opening items read: habitable room ≥ 9.5 sqm and ≥ 2.5 m width, etc.
- Scope decision (pack v0 = FAR/BCR/setback/height + key rules): full transcription deferred; the
  room-dimension standards belong with the rule engine (W1.2), where they can actually be enforced.
- Not silent: listed in the pack's `gaps` and here.

## Resolved during verification (non-C notes)

- Footnote [১] (Type A unplanned-area uses): the words for restaurant, home for the elderly and hostel
  were read from crops `f053_crop.png`, `f054_crop.png`; the pack's footnote text stands.
- The 90-day safety-measures/stop-work window: an early note placed it in §53(4); the re-read located it at
  **§53(2)(ঘ)** — provisions cite §53(2)(ঘ).
- Booth word of §46(5): the 2026-10-17 re-read settled on **“বুথ”** (booth), per session record.
- Legacy words decoded with the Bijoy converter: `মানিয়া`, `সম্বলিত`, `আচ্ছাদন`, `সেটব্যাক` — cross-checked
  semantically; used in provisions where applicable.
