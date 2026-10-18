# ADR-0006 — Interface freeze v0 (job protocol, model registry, rate cards, verdicts)

- **Status:** Accepted
- **Date:** 2026-10-18
- **Deciders:** Owner (standing order for the autonomous build-out run; package W0.9 defined by plan P0)

## Context

P0 exits only when the risky assumptions are answered **and the interfaces are frozen** (board W0.9, needs W0.3 ✓ + W0.7 ✓). The spikes supplied the raw material: S4 (persistent workers, stdlib XML-RPC, crash surfacing ≈2 s, restart ≈0.5 s, stateless jobs), S2 (fleet v1 roster, CPU pinning law, spec-decoding rejected), S3 (headless drawing outputs + byte-stability, PDF `/CreationDate` exception), S5 (rebar job shape, face convention), S6 (engine boot contract — engine-side, not a wire interface), W0.3 (schema-first + codegen pattern), W0.5 (rule pack with citations + test vectors). Without a freeze, P1/P2 components would drift: protocol churn between app and workers, registry renames, rate/BOQ mismatches, and verdict shapes that cannot drive the Deviation Register or the one-click "restore to compliant".

## Decision

1. **Four interfaces frozen at v0.1.0** as JSON Schema 2020-12 sources of truth in `spec/schemas/`, with the same schema-first discipline as the Building Spec (ADR-0002): pydantic + TS + packaged copies generated; real examples validated; CI freshness (`tools/codegen/generate_interfaces.py --check`).
2. **Job protocol:** stdlib XML-RPC transport continuity (no new dependencies); envelope with const version, always-present `deadlineMs`/`artifacts`/`warnings`/`metrics`; frozen error codes incl. client-synthesized `worker_down`/`worker_restarted`; stateless jobs; watchdog (ping ≤1 s, restart, clean fail-and-resubmit) as documented in `docs/spec/interfaces-v0.md`.
3. **Model registry:** the fleet manifest is committed data (`spec/models/registry.json`) pinned by artifact sha256; v1 roster fixed at chat/repair/embed/rerank; no draft model (S2); only `displayName` is user-visible (ADR-0004); fine-tunes/new bases are new entries.
4. **Rate cards:** one region/date/source card with a candidate→active→archived lifecycle; cost types per plan §6; machinery inclusion flags; subcontract units mirroring the Building Spec; provenance per §5.10 (card-level, line override).
5. **Verdicts:** three statuses only; **every deviation must carry a machine-applicable `specPatch`** (the one-click restore); `unevaluated[]` keeps coverage honest; pack + subject pinned by sha256; the summary-count invariant is test-enforced.
6. **Evolution:** additive minor bumps within v0 consumers; breaking change → major bump + migration + a new ADR.

## Consequences

- P1's installer/downloader and the W0.8 model cards consume the registry as committed; the W2.1 worker pool implements the frozen protocol (delta from the S4 spike: the envelope fields).
- The compliance engine (W1.2) emits `VerdictSet`; the UI and Deviation Register consume statuses + `specPatch`; the engineer review pack renders citations resolved against the pinned pack.
- **Validation split (documented):** JSON Schema is authoritative for conditional laws; generated pydantic mirrors structure only — runtime paths that must enforce conditionals validate against the packaged schemas.
- TS generation uses a conditional-stripped projection of each schema (json2ts limitation); the schemas themselves stay complete.
- Per-kind job params, fleet config format, BOQ output format and fetch recipes stay open and land additively (listed in the doc's "Deliberately NOT in v0").
- `tools/ci/py_syntax_check.py` now skips `data/` (gitignored scratch trees) so the local check matches CI semantics.
