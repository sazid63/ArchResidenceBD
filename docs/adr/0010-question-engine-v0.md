# ADR-0010 — Question engine v0: answer semantics, display-unit defaults, declared fallbacks

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.4 defined by plan Appendix C)

## Context

W1.4 turns the Phase Flow Book (W0.4) into a working interview over the Building Spec (W1.3): chips, a deterministic parser, escalation to the model and provenance on every write. Building it exposed five points the plan does not spell out:

1. **The book and the spec speak different vocabularies.** Three questions cannot write their option id verbatim: `display-units` (`metric | feet-inch | bangla-land`) must become the spec's `displayUnits.area`/`length` enums; `material-prices` (yes/no) targets `pricing.source` (`user | fetched | …`); `soil-has-report` (yes/no) targets `soil.status` (`user_report | area_default | …`). Blindly writing the option id fails schema validation.
2. **A bare number has no unit.** `plot-area: "5"` could be 5 katha, 5 shotok or 5 m². Guessing from the field's first display unit contradicts the project's own display choice; inventing katha as a BD convention is worse.
3. **Fallbacks are authored with three different levels of resolvability.** Some carry a concrete value (`default`, `area_default`), some name a derivation (`derive`), some are symbolic (`registry: derived-from-location`, `fetch prices`). The engine must not invent the symbolic ones and must not drop them either.
4. **Conditions compare answers, not stored enums.** `soil-has-report == yes` must hold for a stored `status: user_report`. Scoped runs (one phase at a time, W1.10) and resumed runs must evaluate conditions without re-asking every setup question.
5. **Parse failures escalate to a model, but core is offline-first.** The engine itself may not call a model, and a model's reading must not be able to write an unvalidated value.

## Decision

1. **Answers have a semantic value and a write mapping.** The parser returns the typed answer (`True`, `"pile"`, canonical `334.45`); `answer_writes()` maps it to spec writes. Three mappings are declared in code and pinned by tests: `display-units` writes both `displayUnits.area` and `displayUnits.length`; `pricing.source` is `user` on yes and the authored registry fallback on no; `soil.status` is `user_report` on yes and the authored `area_default` fallback on no. A book/spec type mismatch outside these three fails a test, so new questions cannot drift silently.
2. **Bare numbers use the project's display unit.** Explicit units always win; a bare number is read in the unit the app is already showing for that dimension (`displayUnits.area`, `displayUnits.length`; kPa/BDT are canonical) and is recorded at `confidence: medium`. The reply echoes the canonical conversion in the display unit, so a wrong reading is immediately visible. All conversions go through `archres_core.units` (Decimal); `mm` was added there for completeness.
3. **Fallbacks are applied, omitted or declared pending — never dropped.**
   - `default` / `area_default` / `registry` with a schema-valid authored value → written with `source: default` or `assumption` and the authored assumption appended to `/assumptions` (id `asm-<question>`, basis, `verifyOnSite`, `relatedPath`).
   - `omit` → nothing is written; the outcome is recorded as `omitted`.
   - `derive` with `<pointer>` → resolved from the current spec, `source: engine`; a missing source or no author reference → `pending` item for the design phase (W1.10/W2).
   - `registry` whose authored value is symbolic (`derived-from-location`) → **no write**; a `pending` item carries the value, assumption and the schema reason. Eligibility is decided by `apply_patch`'s validation, not by a hand-kept list.
   - Essential questions never fall back: "I don't know" keeps the question open, writes nothing and lists it in `progress().openEssential`.
4. **The answer table is seeded from the spec; conditions read it.** Construction seeds question ids from existing spec values (reversing the three mappings), so a phase-scoped or resumed interview evaluates `when` conditions correctly without re-asking setup. `skip_answered=True` only stops the engine from re-asking; it does not change condition semantics. Unresolved conditions are recorded as `skipped: condition_unresolved`, never treated as false silently.
5. **Escalation is a payload, not a model call.** An unparseable answer returns `decision: escalate` with a ready request (`questionId`, `pointer`, type, options, raw answer, localized instruction, JSON contract). W1.10 owns the model call; the value comes back through `accept_external`, which re-validates it, applies the same schema gate and records `source: user`, `confidence: low`, `detail: model-parsed (escalation)`. An invalid model value becomes a visible re-ask (`model_invalid`), never a write.
6. **Coverage is counted per question and per storey.** `coverage()` reports one outcome per visited step (`answered | fallback | omitted | skipped | open` with a reason); a full 2-storey run has exactly `60 + 9` outcomes. The quality-law test walks the book and pins that no question disappears.

## Consequences

- W1.10 can drive the interview without re-implementing conversation semantics: `prompt()`, `answer()`/`skip()`/`use_default()`, `accept_external()`, `finish()`, `progress()`, `coverage()`, `history()`.
- The flow book stays a data edit: new questions work when their `maps_to` type matches the spec; a genuinely new vocabulary mapping is a visible code+test change.
- `pending` is a first-class product state (registry fetch, area-default payload, design-phase derivation). The UI must surface it; it is not a silent omission. `area_default` v0 records the authored assumption (e.g. SBC 65 kPa) but **does not write a bearing-capacity value** — that payload belongs to the Source Registry (W2.7).
- Phase-scoped interviews need the spec's phase list to match `building.storeys.count`; a missing floor phase is an `InterviewError` (structural), not a chat question.
- Costs accepted: `coverage()`/`history()` grow with the number of steps (tiny); the parser is language-specific and deliberately does not learn; a model-parsed value is only as good as the caller's re-ask handling (confidence is recorded as `low`).
- Not in v0: undo/deltas, multi-turn conversations beyond one question (W1.10), `kani` (no authoritative factor), voice, and any model call inside core.
