---
name: ArchResidenceBD prices
description: The price discipline for ArchResidenceBD - fetch only through the source registry, transcribe official rate cards with their citations, keep every card a candidate until a human activates it, and never invent a rate. Use when working on the price service, a rate card, the BOQ's money, or a city price pack.
---

# Prices

**A price is either cited or it is not a price.** Everything in this repo's money comes from an
official list, and the citation travels with the number.

## The rules

1. **Fetch through the registry, not with a general fetcher.** `spec/sources/registry.yaml` is
   the app's own list of official sources (the core: `core/src/archres_core/sources.py`). The
   fetch report is `data/prices/fetch-report.json` — the provenance record.
2. **A card is a candidate until a human activates it.** The status is in the card itself
   (`"status": "candidate"`). Until the owner marks it active, every document that uses it
   says so — the BOQ's rates are candidates, and the documents carry the candidate status.
3. **Every rate cites its page.** A line in a card carries the item and the page it came from
   (`tools/prices/transcribe_card.py` writes them; `tools/prices/pdf_text.py` is the stdlib PDF
   text reader that reads the source PDF).
4. **The unit law.** The unit on the line is the unit the rate is for, and the quantity is
   converted into it — never the other way round. A rate that has to be converted silently is
   a rate that will be wrong.
5. **The official zone multipliers are published, not invented.** A region multiplier comes
   from the source's own zone table (the PWD book's four zones), and a multiplier that is
   *assumed* is **labelled as assumed** — never applied silently.
6. **A SoR rate is a *works* rate.** It includes the contractor's costs; profit, overhead and
   VAT are listed separately in the book and are **not** in the rate. Do not add them twice.
7. **Never invent a rate.** A line with no rate is **unpriced** and says so in the document
   (the BOQ's unpriced lines are named, with the reason). A gap is named; it is never covered
   with a plausible number.

## The pieces

- `core/src/archres_core/pricing.py` — the price service's core: cards → region → the spec's
  pricing → the override register.
- `tools/pricing/price_service.py` — the CLI (`--check` is the freshness gate).
- `data/prices/cards/*.json` — the transcribed cards (each with its `source`, its `notes`, its
  `status`, its `asOf` and its `effectiveFrom`).
- `data/prices/resolved/*.json` — the spec's pricing, resolved for a region.
- `data/prices/spec/*.priced.json` — what the BOQ was priced from.
- `data/prices/report.md` — the human-readable summary.

## The BOQ's money

- **Every amount re-derives** from the line's own quantity and rate — a number that cannot be
  recomputed by hand does not go to a client.
- **The override register** holds every departure from the card, with its reason. An override
  is a decision; it is recorded, not buried.
- **The BOQ is priced from the spec's pricing** — and the demo's price differs from a
  committed one *on purpose* when the spec's pricing says so. Do not "fix" a divergence
  between the demo and a committed BOQ without reading why it is there.

## The owner's open items (do not resolve them yourself)

- Mark the transcribed card **active** (only a human does that).
- Confirm which **SoR edition** is authoritative (the LGED Schedule of Rates, 3rd edition,
  August 2025 — instead of PWD's February 2023 edition).
- The **city packs** need the rate-list URLs for Chattogram and Khulna; the registry fetches
  known URLs and cannot search, so the URLs come from the owner.
