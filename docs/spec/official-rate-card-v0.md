# The official rate card v0 (W2.7 follow-up): the first candidate card, transcribed

**Status:** v0.1.0 — a **candidate** rate card built from the PWD's official Schedule of Rates
2022 (Revised), every rate citing the page it came from, the four official price zones becoming
the card's regional multipliers.
**Code:** `tools/prices/transcribe_card.py` (the transcription) · `tools/prices/pdf_text.py` (the
reader) · `core/tests/test_price_card_transcription.py` (7 tests) · **Card:**
`data/prices/cards/pwd-sor-2022-civil-works-candidate.json` · **Study:**
`docs/spec/official-price-lists-study-v0.md` · **Decision record:** ADR-0038
**Depends on:** W2.7 (the price service, the card interface) · **Plan:** §3 (prices fetched per
phase) · §5.10 (the Source Registry) · §6 (regional multipliers) · §9 (unverified content is a
candidate)

## What it is

The price service (W2.7) can fetch, resolve and apply a card; until now the only card was the
**illustrative placeholder**. This is the first card built from a **real official list**:

- **Source:** the PWD Schedule of Rates 2022 (Revised), Part A: Civil Works (16th edition,
  revised, effective 23 February 2023) — fetched and hashed ✓, the hash taken from the fetch
  report ✓ (never typed ✓).
- **Rows:** the "Rates of Man, Material and Mark-ups" section (PDF pp. 14–23 ✓), read from the
  book's own text by their item numbers ✓.
- **Zones:** the book's four price columns (Dhaka & Mymensingh · Chattogram & Sylhet · Khulna,
  Barisal & Gopalgonj · Rajshahi & Rangpur ✓) become **each line's** regional multipliers ✓ —
  the ratios of the official columns ✓, not a guess ✓.
- **Status:** `candidate` ✓ — a fetched price list is unverified content until a human marks it
  active ✓ (plan §9 ✓), and the app does not price a BOQ from it silently ✓.

## The lines

| Key | Rate (BDT) | Unit | Zones (chattogram / khulna / rajshahi) | Book item | PDF page |
|---|---:|---|---|---|---|
| `cement-opc-43` | 520.00 | bag | 1.0 / 1.0 / 1.0 | 187 | 20 |
| `rod-60g` | 89,000.00 | ton | 1.0 / 1.0 / 1.0 | 289 | 23 |
| `sand-fine` | 1,900.00 | cft | 1.0079 / 0.9711 / 0.9711 | 225 | 21 |
| `brick-1st` | 13.00 | each | 1.0 / 0.9615 / 0.9615 | 165 | 19 |
| `mason` | 700.00 | day | 1.0 / 0.9286 / 0.9286 | 2 | 14 |
| `rod-binder` | 700.00 | day | 1.0 / 0.9286 / 0.9286 | 11 | 14 |
| `machine-operator` | 700.00 | day | 1.0 / 0.9286 / 0.9286 | 19 | 14 |
| `mixer-diesel` | 1,200.00 | day | 1.0 / 1.0 / 1.0 | 43 | 15 |
| `vibrator` | 550.00 | day | 0.9818 / 0.9091 / 0.9091 | 44 | 15 |

The base is the **Dhaka & Mymensingh** column ✓ (the card's `region: dhaka` ✓).

## The three laws the transcription keeps

1. **Every rate cites its page.** The line's note names the book, the item number and the PDF
   page ✓ — the gazette's discipline, applied to prices ✓.
2. **A conversion is declared, never guessed.** The brick is priced per 1,000 nos in the book and
   per brick in the project; the division by 1,000 is *stated in the transcription's
   specification* ✓ and the note says it ✓ — W2.6's law (a rate in another unit never prices a
   line ✓) is honoured by making the conversion visible ✓ rather than silent ✓.
3. **The card does not claim what the book does not say.** The mixer row does not mention fuel ✓
   — so the note says so ✓ ("the row does not mention fuel" ✓) and the inclusion flags carry the
   conservative reading ✓. And the card has **no excavator line** ✓: the excavation has no
   official hire rate in the rates section ✓ (its *work* is priced per sqm in chapter 02 ✓), so
   the card does not pretend to one ✓ — the study records where it would come from ✓.

## What the card does not do

- **It is not active.** The BOQ still prices from the committed placeholder card ✓ until a human
  marks this one active ✓ (the owner's act ✓ — OWNER-ATTENTION #8 ✓).
- **It is a *works* rate.** The book lists the contractor's profit (10 %), overhead (3.5 %) and
  VAT (7.5 %) separately ✓ (PDF p. 14 ✓) — so a BOQ built on it must say that its rates are
  works rates ✓ (the plan's "deviation-flagged line notes" ✓).
- **It is the PWD's list, not the LGED's.** The two books have different zone groupings ✓ (the
  PWD groups Khulna with Barisal and Gopalgonj ✓; the LGED uses the four divisions ✓) — a card
  says which list it came from ✓, and the two are not interchangeable ✓.
- **The prices are from February 2023** ✓ — three years old as of the app's launch ✓. A
  *current* list (the LGED's 3rd edition, August 2025 ✓) is the next candidate ✓, and the BBS's
  monthly release ✓ is the one that would give a project's own district ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_price_card_transcription.py        # 7 tests
uv run --directory core python ../tools/prices/transcribe_card.py --check       # the card is complete and still a candidate
uv run --directory core python ../tools/prices/transcribe_card.py --write       # re-transcribe (needs the fetched book)
```
