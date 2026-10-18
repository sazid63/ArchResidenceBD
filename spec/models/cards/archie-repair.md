---
cardVersion: "0.1.0"
id: archie-repair
role: repair
status: skeleton
displayNameEn: Archie Repair
displayNameBn: আর্চি রিপেয়ার
upstreamRepo: Qwen/Qwen2.5-Coder-3B-Instruct
upstreamLicense: Apache-2.0
license: Apache-2.0
distribution: bundled
artifactSha256: 724fb256bec1ff062b2f65e4569e871ad2e95ab2a3989723d1769c54294730b7
artifactSizeBytes: 2104932800
hfRepo: ""
---

# Archie Repair — model card

> **Skeleton (W0.8).** Structure is machine-checked by `core/tests/test_model_cards.py`; every **TBD** fills in at publish time (recipe: `spec/models/publishing.md`). Never publish a card while a TBD remains.
> Pinned to registry entry `archie-repair` (`spec/models/registry.json`, fleet `archie-fleet-v1`). Current registry entry is the P1 **training-base placeholder** (plan §4: 3–4B code-specialized base, best available at P1); the trained archetype becomes a new entry with its own card.

## Narrow task contract

Repair NativeCAD build scripts from execution errors. Input: a generated script + the engine's error trace; output: a repaired script. The verification loop is deterministic and closed: candidate → execute in the sandboxed worker → on failure feed the trace back → retry within a bounded attempt budget (execution-verified loop, plan §7). Code + traces only; no network.

## Intended use

- Fixing scripts the engine rejects (API misuse, missing imports, unit slips in generated code) during geometry/drawing/rebar builds.
- English-only working language (traces are English; the app's BN/EN layer stays in chat).
- Runs local, inside the app's job pipeline (frozen protocol: `docs/spec/interfaces-v0.md`).

## Out of scope

- Design decisions or inventing dimensions — the Building Spec is the only source of geometry truth; repair must not change intended geometry.
- General-purpose coding help.
- Network access, package installs, filesystem writes beyond the worker sandbox.
- Rule/compliance logic — never touches rule packs or verdicts.

## Training data (TBD)

- Pipeline per plan §7: generated script corpus + real execution error traces from the sandboxed workers (failures are collected, not discarded).
- Trained English-only (traces + code); no BN in the repair loop.
- TBD at publish: sample counts, error-class distribution, script families covered.

## Evaluation (TBD)

- Gate (plan §7): **CAD execution success >90%** on the golden project set.
- Repair-attempt budget distribution (how many retries typical failures need).
- Regression guard: repaired scripts must not change spec-derived geometry values (deterministic generators remain the source of truth).
- TBD at publish: full eval tables.

## Limitations

- "Repaired" means **it executes**, not that it is correct — semantic correctness stays with the deterministic generators and the spec diff check.
- Bounded attempts: after the budget the job fails cleanly (`engine_error` / `invalid_params` per the frozen protocol) and surfaces to the app — never a silent retry loop.
- Error traces are engine-version-specific; a bundled engine update requires re-running the execution-verification suite.

## Licence & attribution

- Base: `Qwen/Qwen2.5-Coder-3B-Instruct` — Apache-2.0 (P1 placeholder; archetype is 3–4B, best available at training time).
- This derivative: Apache-2.0 (default = upstream licence family; owner confirms at first publish, W4.4).
- Attribution: base model name + licence reproduced in the published card and in the app's Licences screen notices.

## Provenance

- Bundled artifact today = stock upstream GGUF (`Q4_K_M`), sha256 pinned in `spec/models/registry.json` (also in this card's front matter).
- The trained archetype = **new** registry entry + new card; shipped entries are never edited.
