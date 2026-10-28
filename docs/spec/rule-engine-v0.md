# Rule engine — v0 (W1.2)

**Status:** v0.0.0 (core module) — working, tested; the app surfaces (verdict UI, deviation register screen) land in P2/P3.
**Code:** `core/src/archres_core/compliance/{pack,tables,checks,engine}.py` · CLI `tools/rules/eval_spec.py`.
**Decision record:** **ADR-0008**.
**Plan:** §5.6 (verdicts · one-click restore · deviations) · §9 (never silent) · W0.9 (verdict schema, interface freeze).

## What it is

The rule engine turns a Building Spec revision + a pinned rule pack into a **verdict set** (W0.9 shape) and closes the loop back into the spec:

1. **Evaluate** — `evaluate_spec(spec, pack, …)` runs every implemented check and returns a schema-validated verdict set: `verdicts[]` (compliant / deviation / impossible) + `unevaluated[]` (coverage, never silent) + computed `summary` counts.
2. **Vector conformance** — the evaluators are the frozen semantics the pack's own `testVectors` pin (49/49); `run_vectors(pack)` / `eval_spec.py` prove it on every run.
3. **Restore-to-compliant** — `restore_patch(spec, verdict)` applies a deviation's `alternative.specPatch` through the spec engine (`apply_patch`, provenance `source: "engine"`, detail naming the ruleRef). Verdict ops apply 1:1 — the round-trip `deviation → restore → re-evaluate → compliant` is pinned by tests.
4. **Deviation Register sync** — `register_ops()` / `apply_register()` keep the spec's `/deviations` in step with a verdict set (engine-owned entries only; user edits preserved).
5. **Coverage statement** — `coverage(pack)` + this table: what the engine evaluates today, and what it does not.

## Evaluator semantics (frozen, pack-vector-pinned)

| Evaluator | Semantics |
|---|---|
| **FAR** — `tables.far_row` | Exact `roadWidthM` row + area band (`areaSqmFrom` < a ≤ `areaSqmTo`; missing from = 0, missing to = open). Prohibited rows match by area only (road ignored); `NR` = no cap. |
| **Setback** — `tables.setback_row` | Same area band; `heightM` > `heightApplicabilityM` (33 m) or `storeys` > `heightApplicabilityStoreys` (10) switches to the `beyondHeight` values. |
| **Parking** — `tables.parking_spaces` | `max(minSpaces or 0, ceil(units × numerator ÷ denominator))` — integer-exact, one extra space for a remaining fraction. |

These are exactly the pre-W1.2 demo semantics (`tools/rules/eval_spec.py` docstring frozen them); the vectors `far-*`, `sb-*`, `pk-*` in `spec/rules/rajuk-2008.yaml` are the contract.

## Checks implemented (v0)

| ruleRef | Inputs (spec pointers) | Outcome |
|---|---|---|
| `rajuk@2008.1#far-tables` | `/site/plot/areaSqm` · `/site/plot/roadWidthM` · `/building/occupancy` (→ class A1-A4) · `/phases/site-excavation/data/plannedTotalFloorAreaSqm` | FAR vs limit; prohibited class/plot → **impossible**; `NR` row → unevaluated `not_applicable` |
| `rajuk@2008.1#setback-schedule` | `/site/plot/areaSqm` · `/building/storeys/count` · `/phases/site-excavation/data/setback{Front,Rear,SideLeft,SideRight}M` | one verdict per offered side (min comparator) |
| `rajuk@2008.1#schedule4-parking` | single-family: `/site/plot/areaSqm`; flats: `/building/unitsPerFloor` × `/building/storeys/count` at `/building/typicalUnitAreaSqm` · `/phases/site-excavation/data/parkingSpaces` | car spaces vs Schedule 4 requirement (row `s4-n-fraction` = ceil; `≥ 1` floor) |

- **Design payload v0 keys** live in `/phases/site-excavation/data/` (the schema-sanctioned extension point). The engine only reads. Missing inputs ⇒ `unevaluated[].reason = "missing_input"` naming the exact pointers — never a silent default.

  **A declared gap (2026-10-22) — the design payload is not written yet** ✓ ✓ — this spec
  used to say *"the question engine (W1.4) writes them"* ✓ ✓ — and that was **not true**
  ✓ ✓ ✓. The flow book asks for the plot ✓ ✓ (the area ✓, the frontage ✓, the road width
  ✓ ✓) and the storeys ✓ ✓ — and **no question** asks for the setbacks ✓ ✓, the planned
  total floor area ✓ ✓ or the parking spaces ✓ ✓ — and the **design** writes its own
  measurements (the excavation depth ✓ ✓, the footing depth ✓ ✓, the rebar ✓ ✓) but not
  those three ✓ ✓. ⇒ so the engine can only judge a **hand-built** spec ✓ ✓ (the reports'
  own demo ✓ ✓ and the training generator's ✓ ✓) — and a real project's run comes back
  with **no verdicts** ✓ ✓ and a row per missing input ✓ ✓ (the gap is explicit ✓ ✓ —
  the plan's §9's "never a silent coverage gap" ✓ ✓ ✓) ✓ ✓.

  **What would close it** ✓ ✓ — and it is the **design's** job ✓ ✓ — the *planned total
  floor area* ✓ ✓ (the design knows it ✓ ✓ — the typical floor ✓ ✓ × the storeys ✓ ✓) ✓ ✓
  and the **setbacks** ✓ ✓ — but the v0 design is a **footing row along the frontage**
  ✓ ✓ (its own docstring says so ✓ ✓), so it does **not place a building** ✓ ✓ and cannot
  state a setback ✓ ✓ — and the **parking spaces** ✓ ✓ need a parking layout the v0 design
  does not have ✓ ✓. ⇒ the FAR check ✓ ✓ can be closed now ✓ ✓; the setback and parking
  checks ✓ ✓ need the design to grow ✓ ✓ (ADR-0086 ✓ ✓) ✓ ✓.

- **Citations** are always cite keys resolved against the pinned pack (`far-3ka`/`far-3ka-fn`, `setbacks` + `s46-3-4`, `schedule4` + `schedule4-notes`).
- **Deviation rows always carry `alternative.specPatch`** (1–2 ops on the phase-data key); compliant/impossible rows never do (schema law).

## Coverage — what v0 does not evaluate

`coverage(pack)` returns the machine-readable statement. Provisions without a check in v0 (listed, never silent):

`s46-3-4` · `s46-5-items-1…5` · `s46-6-8` · `s47-basement` · `s48-subdivision` · `s49-amalgamation` · `s50-mgc` · `s51-2-3-heights` · `s51-4-5-exclusions` · `s51-6-8` · `s51-9-14-road-width` · `s52-aviation-light` · `s53-safety` · `s54-1-5-approval` · `s54-6-9` · `s55-corner-clear-zone` · `s57-mixed-use` — plus the `parkingGeometry` rules and the MGC-percent column of the FAR tables (no footprint input exists yet).

Rule-level honesty rules:

- pack-declared gaps (`gaps:` in the pack — 8 today) are surfaced in every run as `unevaluated[]` rows with `reason = "pack_gap"` and the gap text as detail;
- an input combination with no table row (e.g. area on a road width the table does not cover) is `pack_gap`, not a guess;
- an `NR` FAR row is `not_applicable` (nothing to cap), not silence;
- additive motorcycle parking (flats ≤ 90 m²) stays a `missing_input` row until a motorcycle-spaces input exists.

## Restore & Deviation Register

- `restore_patch(spec, verdict, at=…)` → new spec revision; then e.g. `SpecStore.commit(...)` (W1.3). Only `deviation` verdicts carry a patch.
- `register_ops(spec, verdict_set)` → ops for `/deviations`:
  - new deviation → entry `dev-<rule-id>-<datakey>` (e.g. `dev-setback-schedule-setbackfrontm`, `phaseId` included);
  - still-deviating → replace only when content changed (**idempotent**: a synced register yields zero ops), preserving the user's `rationale`, `acknowledged` and the original `recordedAt`;
  - verdict gone (restored / input changed) → engine-owned entry removed; user-authored entries are never touched;
  - `riskTier` defaults to `approval_risk` until the deviation UI (P2/P3) lets the engineer set it; `expected`/`actual` are formatted from `limit`/`measured`.
- `apply_register(spec, verdict_set)` applies the ops with provenance `source: "engine"`.

## Determinism & pinning

- Verdict sets are byte-stable for identical inputs: checks iterate a fixed registry order, numbers format deterministically, `evaluatedAt` is an argument (defaults to now at the call site).
- `pack.sha256` = sha256 of the exact pack **file bytes** (`d50cce8c…` today, the same value W0.9 froze in `verdict-set-example.json`); `subject.specSha256` = the spec engine's canonical hash. Reproducibility means: re-evaluate the same spec bytes against the same pack bytes.
- Keyed addressing (`/phases/<phase-id>/…`) is part of the spec engine (ADR-0008).

## Verification (W1.2 "done when")

- `uv run --directory core python ../tools/rules/eval_spec.py` → `rajuk@2008.1 [candidate]: 49/49 vectors pass`.
- `uv run --directory core pytest -q` → all tests, including: the 49 parametrized vectors, full-run verdict set (3 deviations / 3 compliant on a synthetic full input set), FAR-compliant case, prohibited-class impossible case, setback + parking restore round-trips, register lifecycle (add → acknowledge → preserve → restore → remove), determinism, pack-pin equality with the W0.9 example.
- CLI spec mode: `… eval_spec.py --spec spec/examples/new-project.json` → verdict set JSON on stdout with `unevaluated` rows naming every missing input.

## Not in v0 (candidates, in rough order)

height/storeys limits (`s51-2-3-heights`) · MGC comparison (`s50-mgc`) once a footprint exists · corner clear zone (`s55`) · §46(5) projections/open space (`s46-5-*`) · mixed-use routing (`s57`) · per-floor mixed flat sizes (`s4-n-mixed-flats`) · low-income reduction note (`s4-n-low-income`) · on-street parking limits (`s56-6`). Each is visible in `coverage()`/this table — none silently missing.
