# Interfaces — v0 (W0.9)

**Status:** v0.1.0 — frozen for P0 · decision: **ADR-0006**.
**Sources of truth:** `spec/schemas/{job-protocol, model-registry, rate-card, verdict}.schema.json` (JSON Schema 2020-12).
**Plan:** §5 (pipeline jobs, fixed model roster) · §6 (BOQ cost types) · §5.6 (compliance verdicts) · §5.10 (provenance).
**Spike inputs:** S2 (fleet v1), S3 (headless drawings, determinism), S4 (persistent workers, crash semantics), S5 (rebar face convention), S6 (engine boot contract).

## Pipeline

```
spec/schemas/<name>.schema.json                 (source of truth, 4 files)
├─ datamodel-codegen ─────────▶ core/src/archres_core/interfaces/<name>.py        (pydantic v2 — committed)
├─ json-schema-to-typescript ─▶ app/src/interfaces/<name>.gen.ts                  (TS types — committed)
├─ copy ──────────────────────▶ core/src/archres_core/interfaces/<name>.schema.json  (runtime package data)
├─ spec/models/registry.json          (real fleet manifest — validated in tests)
└─ spec/examples/interfaces/*.json    (validated in tests; drift = CI failure)
```

- Regenerate: `python tools/codegen/generate_interfaces.py` · Freshness: `--check` (CI). Generated files are **never hand-edited** (ADR-0002).
- **Validation split:** JSON Schema is the authoritative validator — including the `if/then` laws below. Generated pydantic models mirror structure (`extra='forbid'`, enums, patterns, ranges) but do not encode conditionals; runtime paths that must enforce conditional laws validate against the **packaged schemas** (`archres_core.interfaces.load_schema`).
- **TS projection:** `json-schema-to-typescript@15` degrades objects carrying `if/then` to index signatures, so TS is generated from a copy with conditionals stripped (shapes only, by design). The linter-level invalidity of conditional-stripped TS is irrelevant — types are compile-time only.

## 1 — Job protocol (`job-protocol.schema.json`)

The wire contract between the app and its persistent engine workers. Proven shape in S4; v0 adds the envelope.

- **Transport:** stdlib XML-RPC on `127.0.0.1`, no new dependencies. The app picks a free port per worker at spawn and passes it in (no hardcoded ports in the product). Workers are **single-threaded on purpose** (the engine is not thread-safe) — parallelism comes from running two-plus workers.
- **Control plane** (plain XML-RPC methods; shapes in `$defs`): `ping()` → `PingReply` (readiness is polled via ping, never scraped from stdout) · `stats()` → `StatsReply` · `shutdown()` → clean exit ack (S4 used a detached exit after reply).
- **Data plane:** `job(JobRequest) → JobResult`.
  - Envelope: `messageType` + `protocolVersion` (`0.1.0`) are consts; results always carry `artifacts[]`, `warnings[]` (never a silent drop, plan §9) and `metrics.durationMs`.
  - `deadlineMs` is **always** set by the client. Defaults per kind: `geometry.build` 30 s · `drawing.sheet` 120 s · `rebar.build` 60 s (S4 scratch runs used 180 s).
  - Frozen error codes: `invalid_params · worker_down · worker_restarted · timeout · engine_error · internal`. `worker_down`/`worker_restarted` are client-synthesized: S4 measured crash surfacing ≈2 s after death on Windows loopback, so the **watchdog is the primary crash detector** — ping every ≤1 s, restart on failure (≈0.5 s), fail the in-flight job with a clean code and let the app resubmit (jobs are stateless; a crash loses nothing).
- **Kinds v0** (params are open objects in v0; concrete param schemas land additively with the owning engine):
  - `geometry.build` — deterministic member build from the spec (S4: fuse pads+columns, `removeSplitter`, return volume/bbox; identical across workers).
  - `drawing.sheet` — headless TechDraw views → our annotation layer (native draw dims are GUI-only), outputs SVG/DXF/PNG byte-stable, PDF with a `/CreationDate` exemption (S3). Sheet/DXF generation carries the brand guard in-generator.
  - `rebar.build` — FreeCAD-Reinforcement build + BBS (S5); the **selected face defines the whole build** (members take their cross-section face); steel = `Shape.Volume / (π/4·d²)`.
- **Determinism:** artifacts carry `sha256`; SVG/DXF/PNG byte-stable (S3) — plan §9 "identical outputs under optimization" is testable from these fields. `engineVersion` is internal provenance only (ADR-0004).

## 2 — Model registry (`model-registry.schema.json`)

The fleet manifest: which models ship, in which role, pinned by artifact hash. Real instance: `spec/models/registry.json`.

- **Fleet v1 roster fixed** (S2): chat / repair / embed / rerank — one entry per role. The draft model is **deliberately excluded** (speculative decoding measured ~8 % acceptance; do not re-add without a new measurement) — recorded in the registry `notes`, never silent.
- **Pinning:** `artifact.sha256` + `sizeBytes` are the exact artifacts measured in S2. A new base model or a fine-tune is a **new entry**, never an edit of a shipped one.
- **Runtime policy** (S2): `swapGroup` `gpu-models` swaps exclusively (one GPU model resident at a time); `cpu-services` stay persistent and **must** be pinned `gpuLayers: 0` (auto-fit otherwise pulls them into VRAM and crowds the chat model out on the 6 GB floor). Schema enforces the device ⇄ gpuLayers coherence.
- **Branding law (ADR-0004):** only `displayName` is user-visible; `upstream`/`runtime` naming is internal provenance and appears (if at all) behind the Licences screen.
- **Consumers:** installer/downloader (P1), W0.8 model cards, Licences screen. `distribution`: `bundled` (ships in the one installer) · `downloadable` · `candidate` · `training`.

## 3 — Rate cards (`rate-card.schema.json`)

One card = one **region + date + source** set of market rates. The market side of pricing: the price service (W2.7) pushes card values into the Building Spec's inline `pricing` (material/labour/machinery/subcontract rate entries); per-project edits then follow the normal provenance + Deviation Register path.

- **Status lifecycle:** `candidate` (not yet verified — never used in a BOQ silently; plan §9) · `active` · `archived`.
- **Cost types** (plan §6): `material · labour · machinery · subcontract · other`.
- **Machinery** lines: unit must be `hour`/`day`; `operatorIncluded` + `fuelIncluded` **required**; `minimumChargeHours` optional. Non-machinery lines may not carry these flags (schema-enforced).
- **Subcontract** lines: unit whitelist mirrors the Building Spec — `per_pile · per_ft · machine_hour · per_sqm · per_unit · lump_sum` (piling modes per plan §6).
- **Regional multipliers:** card-level map (base region = 1.0) with per-line override.
- **Provenance** (plan §5.10): `source` at card level, optionally per line — `kind` (`official_list · market_survey · vendor_quote · user_input · manual`), `name`, `url`, `retrievedAt`, `sha256` of the fetched artifact.

## 4 — Verdicts (`verdict.schema.json`)

One compliance-evaluation run of a Building Spec revision against one rule pack (plan §5.6).

- **Three statuses only: `compliant · deviation · impossible`** — no hard blocks. `impossible` = the rules make compliance impossible within the current constraints (e.g. a prohibited use class on that plot); it is **not** a data problem.
- **Coverage is never silent** (plan §9): rules that were in scope but not evaluated are listed with a reason — `missing_input` (name the data in `detail`), `not_applicable`, `pack_gap`.
- **Deviation ⇒ alternative** (one-click "restore to compliant"): every deviation **must** carry `alternative.specPatch` — an ordered list of `add/replace/remove` ops with JSON Pointers applied to the subject spec revision. Paths must resolve against the spec; `phases[].data` is the sanctioned open slot for design-phase values until the phase payload schemas land (P1/P2). `compliant`/`impossible` must **not** carry an alternative (schema-enforced).
- **Pinning:** `pack.sha256` + `subject.specSha256` make a run reproducible; `citations` are cite keys resolved against the pinned pack; `ruleRef` = `<packId>#<ruleId>` where the id is a rule entity in the pack (provision, schedule or table).
- **Invariant (test-enforced):** `summary` counts equal the `verdicts[]` status counts.
- **Consumers:** compliance engine (W1.2) → UI check results + Deviation Register + engineer review pack.

## 5 — Bar Bending Schedule (`bbs.schema.json`)

The schedule as **data**: one mark per bar shape, repeated. Added by W2.4 (plan Appendix C).

- **A mark is one bar, repeated:** `lengthMm` is the **centreline** length (the industry
  convention for bent bars — a link is its perimeter) and `count` is how many times it occurs.
  `weightKg` = `count × length × π/4 d² × density`, with the density in the document
  (`densityKgPerM3`, 7850 for mild steel).
- **The same steel is measured from the geometry.** A round bar's length is recovered from its
  volume (`Shape.Volume / (π/4 d²)`, spike S5), so the schedule and the CAD engine are two
  independent computations of the same quantity and the probe compares them. A *welded* bar
  measures slightly **less** than its centreline length (the corners overlap) — the effect spike
  S5 measured (1.8 %); the comparison tolerance is declared, not assumed.
- **Shapes:** `straight · link · bent · hook · starter` — v0 builds straight bars, links and
  starters; the rest are reserved for the richer detailing.
- **The assumptions travel with it:** `assumptions[]` carries every authored detailing value
  (diameters, spacings, cover) with its reason, because the rule pack (v0) has no detailing
  rules. The schedule is never a number without a provenance.
- **Consumers:** the rebar generator (W2.4) → the BBS (W3.4) → the BOQ (W2.6) and the engineer
  review pack.

## 6 — Bill of Quantities (`boq.schema.json`)

The priced document the xlsx/PDF renderers (P3) read. Added by W2.6.

- **One line per measured quantity**, with the phase it belongs to, the plan's cost type
  (material / labour / machinery / subcontract / other), the unit, the quantity, the rate key it
  priced itself from, and the quantity's provenance (`spec` / `derived` / `assumed` / `rule`).
- **A line the card cannot price stays in the document** with a null amount and is listed in
  `totals.unpricedLines`. A missing price is a visible gap, never a zero and never a dropped
  line. A rate in another unit never prices a line either.
- **The rate card's identity travels with the document** (id, region, status, date, source), so
  a *candidate* card is never laundered into a quotation.
- **The arithmetic is re-derivable from the document itself**: every amount is quantity × rate
  and the subtotals and the grand total are the sums of the lines.
- **Consumers:** the BOQ builder (W2.6) → the xlsx/PDF renderers (P3) → the engineer review
  pack (W3.7).

## Conventions (shared)

- **Absence = omitted field.** No nulls anywhere.
- **Strict by default:** `additionalProperties: false` everywhere except the sanctioned open objects (`JobRequest.params`).
- **Text:** user-visible strings are bilingual `Localized {bn, en}`.
- **Time:** ISO 8601 with offset (`+06:00` local). **Ids:** lowercase slugs `^[a-z0-9][a-z0-9-]*$`, stable forever. **Hashes:** lowercase hex sha256. **Money:** BDT, `rateBdt ≥ 0`.

## Evolution rules

**Additive change (2026-10-21):** W2.4 added `bbs.schema.json` (§5) and W2.6 added
`boq.schema.json` (§6). Neither changed an existing shape, so no version moved and no consumer
had to change; the generated Python/TS modules were regenerated in the same commit.


- Version consts per schema (`protocolVersion` / `schemaVersion`); consumers validate against the version they know.
- Additive change → minor bump + example updates + regeneration commit. Breaking change → major bump + migration script + ADR (ADR-0006 rule).
- CI guards: examples validate, round-trips are byte-stable, packaged schemas are fresh, registry roster/coherence holds, verdict pack pin + citation resolution against the real pack, negative cases stay rejected.

## Deliberately NOT in v0 (lands additively)

- Per-kind job param schemas — with the owning engines (W1.x geometry/drawings, W2.x).
- Worker fleet config file format — the W2.1 pool owns it (S2's `llama-swap.yaml` is spike-side evidence, not the product format).
- BOQ line output format (W2.6) and price-service fetch recipes (W0.10 Source Registry v0).
- Model-card document format (W0.8 — docs, not protocol).
- Restore-conflict rules when patch paths have drifted against a newer revision (engine behavior, W1.2/W1.3).

## Checks

```powershell
uv run --directory core pytest -q                        # includes test_interfaces.py
python tools/codegen/generate_interfaces.py --check      # freshness (CI)
pnpm --dir app exec tsc --noEmit                         # generated TS compiles
```
