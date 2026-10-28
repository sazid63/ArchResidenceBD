# Sources — curated registry

`registry.yaml` is the **Source Registry v0** (W0.10, plan §5.10): the trusted sources per data type, with fetch recipes, cache windows and provenance rules. Validated against `spec/schemas/source-registry.schema.json` in `core/tests/test_source_registry.py`.

- **Law:** read `fetchPolicy` inside the registry; the AI fetches through this registry (never blind search); every fetched value carries provenance.
- **Statuses:** `candidate` (lead, unverified) · `active` (verified at `lastVerified`) · `archived`.
- **Doc of record:** `docs/spec/source-registry-v0.md` — pipeline, cache layout, provenance chain, verification state.
- **Fetcher:** `archres_core.sources` (stdlib) + `tools/sources/fetch_source.py` (dev/ops CLI; validates the registry first).
- **Updates:** new sources are new entries; verified state changes flip `status` + `lastVerified` — never edit away evidence (notes keep the history).

List sources: `uv run --directory core python ../tools/sources/fetch_source.py --list`
