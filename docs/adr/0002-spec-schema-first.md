# ADR-0002 — Building Spec is schema-first; models are generated, never hand-edited

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Owner

## Context

Plan §5.4 requires one JSON-Schema source of truth generating Python validators, TS types, UI forms and docs. Engines (spec / rule / BOQ / CAD) and the app must speak the same vocabulary; hand-written models on either side would drift silently.

## Decision

1. `spec/schemas/building-spec.schema.json` (JSON Schema 2020-12) is the single source of truth; **v0.1.0** frozen in W0.3.
2. Codegen pipeline (W0.3): datamodel-codegen → pydantic v2 models (`core/src/archres_core/spec/models.py`); json-schema-to-typescript → TS types (`app/src/spec.gen.ts`); the schema is copied into the core package for runtime validation. Generated files are **committed** and CI-checked for freshness; they are never hand-edited.
3. Canonical storage units are SI; display units are per-project presentation only.
4. Python **3.12** is the core dev/runtime target (`.python-version`); `requires-python >=3.11` stays for library flexibility.
5. Extension points (`phases[].data`, `provenance`) are the only open objects; everything else rejects unknown fields.

## Consequences

- Schema edits require: version bump → example updates → regenerate → commit (checklist in `docs/spec/building-spec-v0.md`).
- W0.9 (freeze interfaces) consumes this schema as the base for the job protocol / verdict / rate-card schemas.
- W0.2 forms read titles / descriptions / ranges from the same schema — no parallel form schema can appear.
- Any engine that needs a new field must change the schema first; contract drift becomes a compile/test failure instead of a runtime surprise.
