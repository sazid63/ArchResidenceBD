# ADR-0008 — Rule engine v0: keyed phase pointers, coverage policy, restore & register

- **Status:** Accepted
- **Date:** 2026-10-18
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.2 defined by plan Appendix C)

## Context

W1.2 had to turn a Building Spec + the `rajuk@2008.1` pack into W0.9 verdict sets, provide the one-click restore and sync the Deviation Register. Building it surfaced four decisions:

1. **Phase addressing.** The flow book and the frozen verdict example address phase data as `/phases/site-excavation/data/…` — by slug id. But `phases` is a JSON **array** in the schema, so strict RFC 6901 cannot resolve those pointers: `apply_patch` (W1.3/ADR-0007) refused them. The frozen convention and the engine both need the id form (indices are unstable under reordering and meaningless to engineers).
2. **Coverage honesty.** The pack has 23 provisions, plus tables, schedule rows and 8 declared `gaps`. The engine implements a handful of checks; the quality law (§9) forbids silent coverage gaps, but the frozen `unevaluated.reason` enum has only `missing_input | not_applicable | pack_gap`.
3. **Restore provenance.** ADR-0007 said verdict ops apply 1:1, `source: "engine"` — W1.2 defined the exact detail string and the op choice for phase-data writes (`add`, which works whether the key exists or not).
4. **Register ownership.** `/deviations` entries mix engine results with user acknowledgements/rationale. Register sync had to define who owns what.

## Decision

1. **Keyed array addressing (spec engine extension, ADR-0007 amendment).** Inside a JSON array, a digits-only token is an index; `-` stays append-only (final token of `add`); **any other token matches the unique element whose `id` equals it**. No match or multiple matches raises `PointerError` — never a silent pick. `add` to an array still needs `-` or an index (use `replace`/`add` on the element's members). Reads, `replace`, `remove` and `add`-parent navigation all support it. This is what makes `/phases/site-excavation/data/…` legal in `measured.path`, `specPatch` and flow-book `maps_to`, with 1:1 `apply_patch` application preserved.
2. **Coverage policy.** The engine runs a fixed check registry keyed by pack entity id (`CHECKS`). Per run: evaluated checks produce verdict rows; missing inputs produce `missing_input` rows naming the exact pointers; `NR` rows are `not_applicable`; input combinations with no table row are `pack_gap`; **every pack-declared gap is surfaced as a `pack_gap` row in every run**. Provisions outside the registry are listed by `coverage(pack)` and in `docs/spec/rule-engine-v0.md` — the reason enum is not stretched to mean "engine not implemented yet".
3. **Restore contract.** `restore_patch(spec, verdict)` accepts only `status == "deviation"` with `alternative.specPatch`; ops apply through `apply_patch` with provenance `{source: "engine", detail: "restore to compliant: <ruleRef>"}`; phase-data writes use `add` (safe for absent keys, RFC `add` semantics otherwise). Deviations for keyed inputs emit patches that can only reach the nearest compliant value (FAR floor-rounds down, parking/setbacks round to the exact requirement).
4. **Register ownership.** Engine-owned entries carry ids `dev-<rule-id>-<data-key>` (prefix `dev-`). Sync semantics: add new; replace only when content changed (idempotent), always preserving user `rationale`, `acknowledged` and original `recordedAt`; remove engine-owned entries whose verdict disappeared; **never touch user-authored entries**. `riskTier` defaults to `approval_risk` until the deviation UI (P2/P3) exposes the choice.
5. **Design payload v0 keys** live under `/phases/site-excavation/data/` (`setback{Front,Rear,SideLeft,SideRight}M`, `plannedTotalFloorAreaSqm`, `parkingSpaces`; `motorcycleSpaces` anticipated). W1.4 writes, the engine reads. The evaluators themselves stay pure (`tables.py`) and are the exact frozen semantics of the pack's `testVectors` (49/49).

## Consequences

- W1.4's question engine maps answers straight to `/phases/<phase>/data/<key>` pointers — the same form the verdicts and flow book use; no index translation anywhere in the product surface.
- The spec engine now has exactly one documented extension beyond RFC 6901; any new array of id-bearing objects gets keyed addressing for free (deviations, documents, rates), which register ops and future UI can rely on.
- Verdict sets from the engine contain `pack_gap` rows on every run (8 today) — deliberate: the UI groups them as pack coverage notes; they disappear only when the pack's gaps do.
- Costs accepted: id lookups are linear (arrays are tiny); `add` cannot create keyed elements implicitly (explicit error instead of surprising insert); engine-unimplemented provisions are documented rather than encoded into `unevaluated[]`, so the doc/`coverage()` must stay in step — pinned by tests.
