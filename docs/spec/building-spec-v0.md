# Building Spec — v0 (W0.3)

**Status:** v0.1.0 — frozen for P0; base for the W0.9 interface freeze.
**Source of truth:** `spec/schemas/building-spec.schema.json` (JSON Schema 2020-12).
**Plan:** §5.4 — single source of truth → Python validators, TypeScript types, UI forms, docs.

## Pipeline

```
spec/schemas/building-spec.schema.json          (source of truth)
├─ datamodel-codegen ──────▶ core/src/archres_core/spec/models.py        (pydantic v2 — committed)
├─ json-schema-to-typescript▶ app/src/spec.gen.ts                        (TS types — committed)
├─ copy ───────────────────▶ core/src/archres_core/spec/building-spec.schema.json  (runtime package data)
└─ spec/examples/*.json     (validated in tests; drift = CI failure)
```

- Regenerate: `python tools/codegen/generate_spec.py`
- Freshness check: `python tools/codegen/generate_spec.py --check` (CI)
- Generated files are **never hand-edited** (ADR-0002).

**Forms** (W0.2+): schema titles, descriptions, units and ranges are authored so forms can be generated from the same schema; generated forms are the Pro/fallback editor — authored flows stay primary (plan §8).

## Conventions

- **Canonical units are SI, always** (storage + engine math): m, m², kPa, kg, m³, BDT; rebar diameters in mm. Display units are per project (`project.displayUnits`) and presentation-only; the land-unit module converts katha/shotok ⇄ m² at the input boundary. Never store display units in numeric fields.
- **Time:** ISO 8601 with offset (`+06:00` for Bangladesh local).
- **IDs:** project = UUID; everything else = stable lowercase slugs matching `^[a-z0-9][a-z0-9-]*$`. IDs are stable forever and never derive from build order (plan §8).
- **Absence = omitted field.** No nulls anywhere in the spec.
- **Strict by default:** unknown fields are rejected (`additionalProperties: false`). Two sanctioned extension points: `phases[].data` (phase payloads, validated by a kind→schema registry from P1/P2 on) and the root `provenance` map.
- **Storeys:** `storeys.count` = total floors above plinth including ground floor (BD "G+5" ⇒ count 6). Floor phases use `storeyIndex` 0 = ground floor, 1 = BD "1st floor". `label` is display-only.
- **Provenance:** every machine-introduced value (defaults, fetches, rule-pack values) gets an entry in `provenance` keyed by JSON Pointer (`/site/soil/sbcKpa`); user-typed values may carry entries too. Overrides additionally go to `deviations` (plan §2).
- **Locked revisions:** `revision` + `locked` mark an immutable snapshot; the revision history/DAG lives in the project store (Spec engine, W1.3), not inside the JSON.

## Entity map

| Entity | Where | Purpose |
|---|---|---|
| Project | `/project` | Identity, language, display units |
| Site | `/site` | Address, plot, soil (flagged assumptions), jurisdiction / rule pack / seismic zone |
| Building | `/building` | Occupancy, structure type, storeys, units per floor |
| Phase | `/phases[]` | The five phase kinds; per-phase status + decision payload |
| Pricing | `/pricing` | Rate cards: materials / labour / machinery / subcontract (cost types per plan §6) |
| Assumption | `/assumptions[]` | Flagged assumptions (soil defaults etc.) — "assumption — verify on site" |
| Deviation | `/deviations[]` | Deviation Register: rule left behind, risk tier, acknowledgment, nearest compliant alternative |
| DocumentRef | `/documents[]` | Generated documents registry (drawings / BBS / BOQ / packs / bundles) |
| ProvenanceEntry | `/provenance{}` | Per-field provenance |

## Deliberately NOT in v0 (lands later, additive minor versions)

- Phase payload schemas (element dimensions, rebar, MEP choices) — P1/P2 engines; `data` is the reserved slot.
- Rule-pack schema (RAJUK numbers) — W0.5; verdict schema — W1.2/W0.9.
- Rate-card/BOQ line details beyond the v0 fields (regional multipliers, piling modes etc.) — W0.9 freeze.
- UI form layout hints (`x-ui`) — W0.2.
- Cross-field validations JSON Schema cannot express: phases ⇄ `storeys.count` consistency, `storeyIndex` required for `kind=floor`, id uniqueness, provenance-pointer validity — enforced by the Spec engine (W1.3) with tests + spec fuzzing (plan §9). (Id uniqueness is already covered by tests on examples.)

## Evolution rules

- `schemaVersion` is semver and `const` in each schema file: validators pick the schema by version; old files stay valid against their own version.
- Additive change → minor bump + example updates + regeneration commit. Breaking change → major bump + migration script + ADR.
- CI guards: examples validate, round-trip is byte-stable, packaged schema is fresh, negative cases stay rejected.
