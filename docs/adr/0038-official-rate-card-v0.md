# ADR-0038 — The official card is transcribed with its pages, its zones and its caveats

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.7 follow-up
**Code:** `tools/prices/transcribe_card.py` · `tools/prices/pdf_text.py` ·
`core/tests/test_price_card_transcription.py` · **Card:**
`data/prices/cards/pwd-sor-2022-civil-works-candidate.json`
**Spec:** `docs/spec/official-rate-card-v0.md` · **Study:**
`docs/spec/official-price-lists-study-v0.md`
**Depends on:** W2.7 (the price service) · plan §3, §5.10, §6, §9

## Context

The price service (W2.7) fetches, resolves and applies a rate card, but the only card in the
repository was the **illustrative placeholder** ("never use for a BOQ"). The plan wants **live
prices from official lists** (§3, §5.10), and the owner confirmed the two official addresses, so
the books could finally be fetched, hashed and — with a stdlib PDF reader — **read**.

A card is a set of numbers a BOQ multiplies by, so every number in it has to be traceable to a
page, and the things the book does *not* say have to be visible rather than filled in.

## Decisions

1. **The card is transcribed from the book, not typed in.** `transcribe_card.py` finds each row by
   its item number **and** its description (the PDF's own spacing is uneven, so the description
   is matched with flexible whitespace ✓), reads the four zone columns, and writes the line ✓.
   The card is therefore **re-derivable** from the fetched artefact ✓ — the same discipline as
   the rule pack's numbers ✓.
2. **The hash comes from the fetch report, never from a keystroke.** The card's `source.sha256` is
   the artefact's hash as the fetch recorded it ✓ — a typed hash is a hash nobody can check ✓.
3. **The official zone columns become the card's regional multipliers** — as **ratios** ✓, per
   line ✓ (the zones differ per material ✓: the cement is the same everywhere ✓, the sand and
   the labour are not ✓). W2.7's service applies them ✓, so the multipliers are finally
   *official* rather than assumed ✓.
4. **A conversion is declared, not inferred.** The brick is per 1,000 nos in the book and per
   brick in the project; the division is *in the transcription's specification* ✓ and the note
   says it ✓. W2.6's law (a rate in another unit never prices a line ✓) is honoured by making
   the conversion a **declared, derived rate** ✓ rather than a silent substitution ✓.
5. **The card says what the book does not say.** The mixer's row does not mention fuel ✓ — so the
   note says exactly that ✓, and the inclusion flags carry the conservative reading ✓ (the
   operator *is* a separate line in the book ✓, so "not included" is provable ✓).
6. **No excavator line.** The excavation has no official hire rate in the rates section ✓ (its
   work is priced per sqm in chapter 02 ✓), so the card does not pretend to one ✓ — the study
   records where it would come from ✓. A line with a made-up rate is worse than a missing line ✓.
7. **The card is a candidate, and it stays one until a human says otherwise.** The BOQ keeps
   pricing from the committed placeholder ✓ until the owner activates this card ✓ (plan §9 ✓).

## Consequences

- The project has a **real** rate source for the first time ✓ — nine lines with their pages ✓,
  four official zones ✓ and the units the takeoff measures ✓.
- The card's numbers are checkable by a human against the book ✓, and the transcription is
  re-runnable ✓ (`--write` re-derives it from the fetched artefact ✓; `--check` re-reads the
  rates when the book is cached ✓).
- The card carries its own caveats: the **works-rate** nature of the prices ✓ (profit,
  overhead and VAT are listed separately in the book ✓), the **February 2023** edition ✓, and
  the **PWD's** zone grouping ✓ (not the LGED's ✓).
- The next candidates are the **LGED's 3rd edition** (August 2025 ✓ — current ✓) and the **BBS's
  monthly release** ✓ (the one that would give a project's own district ✓). A card will say
  which list it came from ✓.
- The excavator's rate stays a **candidate assumption** in the design ✓ (W2.6's ✓) until either
  the work rate is converted with the conversion stated ✓, or a survey supplies it ✓.
