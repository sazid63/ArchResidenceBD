# ADR-0003 — Rule packs: one YAML per regime edition, provenance-cited, CI-guarded

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Owner

## Context

Plan §5.6 makes structured rule packs the home of every compliance number (FAR, coverage, setbacks, heights, parking). §5.6 also requires each pack to ship test vectors enforced in CI so gazette updates cannot silently break compliance logic, and quality law (§9) forbids silent coverage gaps. The RAJUK 2008 gazette exists here as a private scan (a reason the repo stays private), so every fact must carry page-level provenance an engineer can spot-check.

## Decision

1. **One pack per regime edition**: `spec/rules/<authority>-<year>.yaml`, validated by `spec/schemas/rule-pack.schema.json`. Pack id scheme `<authority>@<regime>.<revision>` — `regime` is the printed regulation's year (e.g. `rajuk@2008.1` = Imarat Nirman Bidhimala 2008, revision 1); `revision` bumps only for corrections within the same regime. A new regime is a **new file**, never an in-place edit.
2. **Provenance on everything**: every table, rule, footnote, provision and test vector references a `citations[]` entry (gazette page, PDF page, verification tier, note). For the RAJUK scan the page map is *gazette page = PDF page + 2997* — enforced by tests.
3. **No silent drops**: unreadable words, unavailable editions and scope decisions live in the sibling candidates ledger (`spec/rules/<pack>-candidates.md`) and surface as `gaps[]` with `candidateRef`; `review.openItems == len(gaps)` is enforced by tests.
4. **Status lifecycle** `candidate → review → frozen`; packs ship `candidate` until engineer validation, and the app must surface that status anywhere pack values appear.
5. **Rendered docs are generated artifacts**: `docs/rules/*.md` is produced by `tools/rules/render_pack.py`; CI enforces freshness (`--check`) exactly like the spec codegen and the flow book.
6. **Test vectors live inside the pack** (`testVectors[]`, by kind) with frozen evaluator semantics documented at the block; `core/tests/test_rajuk_pack.py` executes them, so the pack cannot regress silently.

## Consequences

- Gazette amendments are research first (see candidates C8/C9), then a revision or a new pack — with vectors updated in the same change.
- The YAML is the only legal review surface for the engineer; the rendered doc is for reading and links the ledger.
- W1.2 (rules engine) consumes packs through this schema; W0.9 may treat `rule-pack.schema.json` as an upstream contract.
- Any future authority pack reuses the same schema, tests and renderer.
