# The official price lists, studied (W2.7 follow-up, 2026-10-21)

**Status:** v0.1.0 — both official lists are read, their chapters mapped, and the rows this
project needs are quoted with their pages. The **card** is not written yet (the transcription is
the next slice); this is the study that decides what goes into it.
**Code:** `tools/prices/pdf_text.py` (the stdlib PDF reader — the lists are read, not guessed) ·
**Sources:** the PWD SoR 2022 (Revised) Part A: Civil Works (16th edition, revised, effective
23 Feb 2023) and the LGED Schedule of Rates 2022 (3rd edition, August 2025) — both fetched,
hashed and recorded in `data/prices/fetch-report.json` and the Source Registry ✓
**Plan:** §3 (prices fetched/updated per phase) · §5.10 (the Source Registry) · §6 (machinery
rate cards, regional multipliers) · §9 (no silent gaps; unverified content is a candidate)

## The two lists

| | PWD SoR 2022 (Revised) | LGED SoR 2022, 3rd edition (August 2025) |
|---|---|---|
| Publisher | Public Works Department | Local Government Engineering Department |
| Size | 354 pages (PDF) | 649 pages (PDF) |
| Structure | "Rates of Man, Material and Mark-ups" (pp. 1–66) then 43 chapters of work | chapters of work, each with an item code (e.g. 3.11.01.01) |
| Price zones | **four**: Dhaka & Mymensingh · Chattogram & Sylhet · Khulna, Barisal & Gopalgonj · Rajshahi & Rangpur | **four**: Dhaka & Mymensingh · Chattogram & Sylhet · Rajshahi & Rangpur · Khulna & Barishal |
| Reading | text PDF, CID fonts with ToUnicode maps ✓ | text PDF ✓ (the Bangla preface's fonts carry no ToUnicode map — the English tables read ✓) |

## Which chapters are best for this project

**The answer: the rates chapters, not the work chapters.**

The project's takeoff measures **cement in bags, steel in tons, sand in cft, bricks in each, the
mason in days and the machines in days/hours** (W2.6's takeoff ✓). The official lists carry those
units in their **rates** sections:

| What the project needs | PWD SoR (Part A) | LGED SoR 3rd ed. |
|---|---|---|
| The mason's day rate | **C1 LABOUR & MAN-POWER: PER DAY**, item 2 (PDF p. 14 ✓) | the labour chapter ✓ |
| The rod binder, the machine operator | C1 items 11 and 19 (PDF p. 14 ✓) | the labour chapter ✓ |
| Cement (per 50 kg bag) | **C6 CEMENT**, item 187 (PDF p. 20 ✓) | the materials chapter ✓ |
| Bricks (per 1,000 nos) | **C5 BRICKS AND SCREEN BLOCKS**, item 165 (PDF p. 19 ✓) | the materials chapter ✓ |
| Sand (per cft, FM 1.2) | **C8 EARTH/SAND**, item 225 (PDF p. 21 ✓) | the materials chapter ✓ |
| Reinforcement (per M. ton) | the steel rows, items 289–290 (PDF p. 23 ✓) | 4.11.01.01.01/02, retail and bulk (PDF p. 136 ✓) |
| The mixer, the vibrator, the pumps (hire per day) | the plant section, items 43–47 (PDF p. 15 ✓) | the plant chapter ✓ |

**The work chapters are a different thing.** The LGED's "3.11.01.01 PCCBC-10: Plain cement
concrete work in foundation … [Bulk] cum 9,515.97 …" (PDF p. 61 ✓) and the PWD's chapter 02
("Excavation, Filling & Site Development") price the **finished work** — per cum, per sqm — not
the materials. That is the right input for a **rate analysis** (the engineer's own BOQ ✓), and the
wrong input for a material card: W2.6's law says *a rate in another unit never prices a line* ✓,
so a per-cum concrete rate cannot price a bag of cement ✓.

## The rows, quoted

**PWD SoR 2022 (Revised), Part A: Civil Works** — "Rates of Man, Material and Mark-ups" (PDF
page = the file's page; the printed page is in the footer ✓):

| Item | Row (verbatim) | PDF page |
|---|---|---|
| 1 | "Head mason / Mosaic head mistry per day 800.00 800.00 750.00 750.00" | 14 |
| 2 | "Mason / Mosaic mistry per day 700.00 700.00 650.00 650.00" | 14 |
| 4 | "Ordinary labour per day 550.00 540.00 500.00 500.00" | 14 |
| 11 | "Rod binder per day 700.00 700.00 650.00 650.00" | 14 |
| 19 | "Machine operator per day 700.00 700.00 650.00 650.00" | 14 |
| 43 | "Hire charge of concrete mixer machine per day 1,200.00 1,200.00 1,200.00 1,200.00" | 15 |
| 44 | "Hire charge of concrete vibrator per day 550.00 540.00 500.00 500.00" | 15 |
| 165 | "1st class/Picked jhama standard bricks per 1000 nos 13,000.00 13,000.00 12,500.00 12,500.00" | 19 |
| 187 | "Ordinary Portland Cement, BDS-EN-197-1-CEM-I, 52.5N, 50 kg bag per bag 520.00 520.00 520.00 520.00" | 20 |
| 225 | "Sand (F.M. 1.2) per cft 1,900.00 1,915.00 1,845.00 1,845.00" | 21 |
| 289 | "B400 … per M. ton 89,000.00 89,000.00 89,000.00 89,000.00" | 23 |
| 290 | "Grade 500 (500MPa), BDS-6935-2016 … per M. ton 87,000.00 87,000.00 87,000.00 87,000.00" | 23 |

**LGED SoR 2022, 3rd edition (August 2025)**:

| Item | Row (verbatim) | PDF page |
|---|---|---|
| 3.11.01.01 | "PCCBC-10: Plain cement concrete work in foundation with minimum compressive strength of 10 Mpa … [Bulk] cum 9,515.97 9,485.45 9,168.15 9,168.15" | 61 |
| 4.11.01.01.01 | "Using retail rate of reinforcing bar kg 116.97 116.82 116.15 116.15" | 136 |
| 4.11.01.01.02 | "Using bulk rate of reinforcing bar kg 113.06 113.06 112.03 112.03" | 136 |

The four columns are, in order: **Zone-A** Dhaka & Mymensingh · **Zone-B** Chattogram & Sylhet ·
**Zone-C** Rajshahi & Rangpur · **Zone-D** Khulna & Barishal ✓.

## What the study settles (and what it does not)

1. **The regional multipliers can be official.** The card's `regionalMultipliers` (W2.7 ✓) can be
   the **ratios of the official zone columns** ✓ — Dhaka = 1.0 ✓ and the other zones = their
   ratio ✓ — instead of a guess ✓. (The PWD's zones group Khulna with Barisal and Gopalgonj ✓;
   the LGED's are the four divisions ✓ — a card carries one set ✓, so the two lists are not
   interchangeable ✗ and a card says which list it came from ✓.)
2. **The mark-ups are not in the rate.** The PWD's page 1 also lists the **contractor's profit
   10 %, overhead 3.5 % and VAT 7.5 %** ✓ — a SoR rate is a **works rate** ✓. A BOQ built on
   official rates must say so ✓ (the plan's "deviation-flagged line notes" ✓), or the number is
   a quote of the wrong thing ✓.
3. **Retail and bulk are different prices.** The LGED prices the reinforcing bar at both ✓
   (116.97 retail ✓ vs 113.06 bulk ✓ per kg ✓) — a contractor buys bulk ✓, so the card's line
   should carry the **bulk** rate with the retail in the note ✓.
4. **Some official rates need a unit conversion to reach the takeoff's unit** (the bricks per
   1,000 nos ✓, the bar per kg vs the takeoff's ton ✓). The conversion is arithmetic ✓, but it
   must be **visible** — the card's line carries the official rate and unit ✓ and the note says
   what was derived from it ✓ (W2.6's law: a rate in another unit never prices a line ✓ — so the
   derived rate is a **different, derived line** ✓, not a silent substitution ✓).
5. **The excavator's rate is not in the rates section** ✓ — the PWD's plant list has the mixer,
   the vibrator and the pumps ✓ but no excavator ✓ (the excavation *work* is priced per sqm in
   chapter 02 ✓). So the takeoff's excavator line (per hour ✓) has **no official counterpart** ✗
   and must stay a candidate assumption ✓ (or be priced from the work rate with a conversion ✓ —
   a decision for the card, not a guess ✓).

## The next slice (declared, not implied)

**The candidate card** ✓: the rows above transcribed into
`data/prices/cards/` as a **candidate** rate card ✓ — each line carrying the official rate, the
official unit, the page it came from ✓, the zone rates ✓ and (where a conversion is needed ✓) the
derivation in its note ✓. It stays `candidate` until a human marks it active ✓ (plan §9 ✓), and
the BOQ keeps pricing from the committed candidate card until then ✓.

## Checks

```powershell
python tools/prices/pdf_text.py <the-soR.pdf> --find "Cement"     # read a list
python tools/prices/pdf_text.py <the-soR.pdf> --page 20           # one page
```
