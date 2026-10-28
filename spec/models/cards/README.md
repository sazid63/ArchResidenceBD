# Model cards — policy

One card per registry entry in `../registry.json` (fleet `archie-fleet-v1`). The mapping and publish-readiness rules are machine-checked by `core/tests/test_model_cards.py` — drift = CI failure.

## Status lifecycle

`skeleton → draft → published` (front matter `status:`):

- **skeleton** — structure only; **TBD** markers allowed; `hfRepo` empty.
- **draft** — content filled, under review; still no `hfRepo`.
- **published** — everything filled (**no TBD may remain**) and `hfRepo` set to the real hub repo.

The publish act itself is the W4.4 recipe in `../publishing.md` (eval gates first, then quantize → fill card → upload → verify → new registry entry).

## Front matter (machine-checked)

`cardVersion` · `id` (registry id) · `role` · `status` · `displayNameEn` / `displayNameBn` · `upstreamRepo` / `upstreamLicense` · `license` (derivative licence; default = upstream family, owner confirms at publish) · `distribution` · `artifactSha256` / `artifactSizeBytes` (must equal the registry pin) · `hfRepo` (empty until published).

## Sections (every card, exact headings)

`## Narrow task contract` · `## Intended use` · `## Out of scope` · `## Training data` · `## Evaluation` · `## Limitations` · `## Licence & attribution` · `## Provenance` — the per-member requirements from plan §4 (task contract, data pipeline, eval suite, HF card).

## Wording law

Cards are **technical documentation** (same status as `docs/spikes/`): upstream and engine naming is allowed here (ADR-0004 scope is the product's surfaces — app, installer, generated documents). Nothing in a card may be reused as UI copy.

## Rules

- A new registry entry (fine-tune, requantization) gets a **new card** — shipped cards are never repurposed.
- Stock members (embed/rerank) keep cards as fleet documentation; nothing is republished unless we host a GGUF redistribution.
- Never publish a card while a TBD remains.
