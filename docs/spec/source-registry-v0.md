# Source Registry — v0 (W0.10)

**Status:** v0.1.0 — the curated source list is live; auto-parsers land with the price service (W2.7).
**Sources of truth:** `spec/sources/registry.yaml` (data) + `spec/schemas/source-registry.schema.json` (law), validated by `core/tests/test_source_registry.py`.
**Plan:** §5.10 (Source Registry & Smart Fetch) · §2.5 (field provenance) · §6 (cost types) · §9 (quality law).

## Purpose & law

The AI fetches **through the registry, never by blind search** — fewer searches, more reliable results, teachable. The registry's `fetchPolicy` carries the product laws:

- **Consent** — fetching requires the user's explicit approval per source; nothing fetches at startup or in the background.
- **Cache-first** — a fresh cache copy (per-source `cacheTtlDays`) is never re-fetched.
- **Provenance** — every fetched value carries `sourceId` + `url` + `retrievedAt` + `sha256` of the fetched artifact; the cache manifest is the evidence.
- **Candidate-only** — fetched numbers enter rate cards as **candidate** lines until a human marks the card active (never silently trusted).
- **No silent gaps** — an unavailable source surfaces as "not fetched — reason", never as zero or blank.

## The registry

One YAML document (`sources-v0`) with 12 entries covering all nine data types:

| Data type | Sources |
|---|---|
| `material-price` | `pwd-schedule-of-rates`, `bbs-price-wage`, `bwdb-schedule-of-rates`, `market-survey-manual`, `vendor-quotes-manual` |
| `labour-rate` | `bbs-price-wage`, `pwd-schedule-of-rates`, `bwdb-schedule-of-rates`, `market-survey-manual` |
| `machinery-rate` | `pwd-schedule-of-rates`, `bwdb-schedule-of-rates`, `market-survey-manual`, `vendor-quotes-manual` |
| `subcontract-rate` | `market-survey-manual`, `vendor-quotes-manual` |
| `rule-source` | `rajuk-bidhimala-2008` (pinned, active), `hbri-bnbc`, `city-authority-rules` |
| `seismic-zone` | `hbri-bnbc` |
| `flood-reference` | `ffwc-flood` (active) |
| `water-table` | `bwdb-groundwater` |
| `soil-reference` | `srdi-soil`, `soil-area-defaults` |

**Statuses:** `candidate` (identified, not yet verified — usable only as a lead) · `active` (verified at `lastVerified`; the product may fetch it) · `archived` (superseded, kept for provenance).

**Entry anatomy:** `id` · `dataTypes[]` · `status` · `authority` · `title {bn,en}` · `kind` (`api-json · http-json · http-csv · html-index · pdf-document · manual-entry · offline-dataset`) · `url` (landing page; the exact data URL goes into the fetch manifest at fetch time) · `language[]` · `licence` · `fetch {method, parser, recipe, urlTemplate?}` · `cadence` · `cacheTtlDays` · `lastVerified` · `artifact?` (hash-pinned held copy) · `notes`.

**Schema conditionals (machine-enforced):** fetchable kinds require a `url` (a `pdf-document` may instead be pinned by a held `artifact`); manual/offline rows must **not** carry a url; `active`/`archived` require `lastVerified`; fetchable non-static sources must state `cacheTtlDays`.

## Fetch pipeline

```
user consent ─▶ cache check (fresh per TTL?) ─▶ fetch via registry entry (stdlib; http/https only)
    │                                                   │
    │                              sha256 + retrievedAt ─┴─▶ manifest.jsonl (provenance record)
    │                                                   │
    └─ candidate rate-card lines ◀─ parse (manual-review in v0) ◀─ held artifact
                 │
      human verification ─▶ card status active ─▶ Building Spec pricing (inline rates)
                 │
      spec provenance entry (source: fetched, note "Source Registry: <id> <date>")
```

The mechanism is `archres_core.sources` (stdlib only): `fetch_source(entry, cache_root)` → record; `is_fresh(record, ttl)`; `manifest_rows(cache_root)`. Dev/ops wrapper: `tools/sources/fetch_source.py` (validates the registry, refuses non-active sources without `--allow-candidate`).

**Cache layout** (runtime, gitignored): `data/cache/sources/<sourceId>/<YYYYMMDDThhmmss Z>-<sha256[:12]>.<ext>` + `data/cache/sources/manifest.jsonl` — one JSON line per fetch, e.g.:

```json
{"sourceId": "ffwc-flood", "url": "https://ffwc.gov.bd/", "retrievedAt": "2026-10-18T06:12:11+00:00", "sha256": "…", "sizeBytes": 18374, "contentType": "text/html", "status": 200, "fileName": "20261018T061211-…​.html"}
```

**Provenance chain (end to end):** manifest row → rate-card `source` fields (`kind`, `name`, `url`, `retrievedAt`, `sha256` — W0.9 schema) → spec `provenance` entry keyed by JSON Pointer (`source: fetched`, `note: "Source Registry: bbs-price-wage 2026-10-01"`, confidence per verification level). Nothing enters the spec without all three hops.

## Verification state (2026-10-18)

- `ffwc-flood` and `bwdb-schedule-of-rates`: **fetched and confirmed live** from the build machine (BWDB's SoR page is linked from its budget/procurement menu).
- `rajuk-bidhimala-2008`: **hash-pinned artifact** (byte-identical across two independent downloads; backs `rajuk@2008.1`). Its download URL was not recorded at the 2026-10-17 retrieval — the recipe says to record it on the next run (process gap, not silent).
- `bbs-price-wage`, `pwd-schedule-of-rates`, `hbri-bnbc`, `srdi-soil`: the domains did **not resolve from the build machine's network** on 2026-10-18 (transport errors). They stay `candidate` with that note — confirm from a browser before first use.
- No invented URLs, no invented vendors, no invented APIs.

## Soil honesty (plan §5.10)

Bangladesh has **no authoritative public point-level soil API**. The app uses BNBC seismic zone + conservative area defaults, always labeled *"assumption — verify on site."* The `soil-area-defaults` entry documents that absence so it can never be silently "solved" by a guessed API; defaults improve with engineer-partner data and user-provided reports.

## Deliberately NOT in v0

- Auto-parsers per source (`json-path` / `csv-columns`) — land with the price service (W2.7).
- Fetch scheduling / auto-refresh and the consent UI — Project Setup flow (P1/P2).
- District → project rate derivation and regional multipliers application — W2.7 (multipliers already exist in the rate-card schema).
- The soil defaults dataset itself (`soil-area-defaults` is the registry row; the data lands with core, W2.x).
- Source screens in the UI (the registry is a core service first).

## Checks

```powershell
uv run --directory core pytest -q -k source_registry       # schema + honesty rules + fetcher
uv run --directory core python ../tools/sources/fetch_source.py --list
uv run --directory core python ../tools/sources/fetch_source.py <active-source-id>
```
