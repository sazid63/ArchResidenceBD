# Spec engine — v0 (W1.3)

**Status:** v0.0.0 (core module) — working and tested; consumers land in W1.2/W1.4.
**Code:** `core/src/archres_core/spec/{pointers,engine,store}.py` (re-exported from `archres_core.spec`).
**Decision record:** **ADR-0007**.
**Plan:** §5.4 (spec = single source of truth; provenance, locked revisions, changelog/diff) · §2.5 (field provenance) · W0.9 verdict `specPatch` (one-click restore).

## What it is

The Building Spec is a JSON document; this engine is how it may change:

1. **Validate** — `validate_spec()` against the packaged Building Spec schema (JSON Schema 2020-12, authoritative).
2. **Patch** — `apply_patch(spec, ops, provenance=…)` — JSON-Patch-style `add` / `replace` / `remove` over RFC 6901 pointers; pure; records provenance; validates before returning.
3. **Hash** — `spec_sha256(spec)` — the canonical content hash that pins a revision (verdict `subject.specSha256`).
4. **Version** — `SpecStore` — immutable revision snapshots + append-only log (history lives outside the spec JSON, per the schema note).
5. **Diff** — `diff_specs(a, b)` — pointer-level changelog rows.

## Canonical form & hash

```
sha256( UTF-8 bytes of json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False) )
```

- Formatting of the source file is irrelevant — only the value graph matters.
- Revision metadata (`revision`, `locked`, `updatedAt`) **is part of the hash**: a pin identifies an exact snapshot.
- Pinned fixpoints in the test suite: `new-project.json` → `9e583b0f…`; the two-op soil patch on it → `d9dc98dd…`. Any accidental change to canonicalisation fails these tests.
- **Cross-language caveat:** core computes the hash today. Any other implementation must reproduce the exact canonical bytes (sorted keys, compact separators, literal UTF-8). The app asks core; it does not re-implement hashing.

## Patch law

| Op | Semantics |
|---|---|
| `add` | object: insert **or overwrite** the member · array: insert at index (shifts), `-` appends · path `""` replaces the document root |
| `replace` | target must already exist (root allowed) |
| `remove` | target must exist; returns the removed value; root removal is invalid |

Rules:

- **Provenance is required** (plan §2.5): every patch call carries a ProvenanceEntry-shaped `{source, detail?, at, confidence?}`; one entry is written per touched path into the spec's `provenance` map (keyed by the same pointer string). `source` must be one of the schema's enum (`user · default · rule_pack · fetched · imported · assumption · engine`).
- **No partial results**: ops apply to a deep copy; the result is schema-validated; any failure raises (`SpecPatchError` / `SpecValidationError`) and nothing escapes. The input spec is never mutated.
- **Reserved paths**: `/revision`, `/locked`, `/updatedAt` cannot be patched — the revision store owns them.
- The patch call takes the same op shape as the W0.9 verdict `alternative.specPatch`, so **restore-to-compliant applies 1:1**. Convention (W1.2): restores use `source: "engine"`, `detail: "restore to compliant: <ruleRef>"`.

### Keyed array addressing (ADR-0008)

Strict RFC 6901 indexes arrays numerically; the Building Spec **also** addresses array elements whose objects carry unique `id`s by that id — the flow book, the W0.9 verdict example and the rule engine all use `/phases/site-excavation/data/...`, never `/phases/0/data/...`:

- a digits-only token is an array index (`/phases/0` resolves as before);
- `-` stays append-only (final token of an `add`);
- any other token matches the **unique** element whose `id` equals it; no match or several matches raise `PointerError` (never a silent pick);
- `add` to an array still needs `-` or an index — use `replace`/`add` on the element's members to write a keyed element.

Reads and writes (`resolve`, `replace`, `remove`, parent navigation of `add`) all support keyed tokens; the addition is documented in the module docstring and pinned by tests.

## Revision store

```
<project-root>/
  revisions/<sha256>.json     # full immutable snapshot per revision
  log.jsonl                   # append-only: number, sha256, parentSha256, createdAt, note, locked, ops[]
```

- **Snapshots are immutable**; identical content is never recorded twice (log shas are unique).
- **Commits only from the current tip**, and only when the tip is not locked. `commit(parent, ops, …, note)` bumps `revision`, sets `updatedAt`, validates, records.
- **Lock = engineer-review freeze**: `lock()` records a metadata-only revision (`locked: true`); further commits are refused until `reopen()` records the opposite. Lock and reopen are revisions themselves — the log tells the whole story.
- **Diff/changelog**: `store.diff(sha_a, sha_b)` returns rows `{"path", "before"?, "after"?}`; revision metadata shows up as rows too (UI can filter).

## Integration map

- **W0.9 verdicts** — `alternative.specPatch` ops apply directly; the resulting revision's `spec_sha256` is what the next evaluation pins.
- **W1.4 question engine** — every answer becomes ops (often simple `/phases/<id>/data/...` adds) through `apply_patch` with `source: user`/`default`.
- **Plan §8 incremental design** — content hashes for invalidation derive from `spec_sha256` + per-phase subtrees via pointers; ids/marks stay spec-derived.
- **P3 project bundle** — the store directory + snapshot files are the natural export unit.

## Deliberately NOT in v0

- Branching/merging of histories (one linear chain per project; branch = copy the store).
- Conflict resolution for patches against drifted revisions (W1.2/W1.3 follow-ups; the store refuses stale parents by design).
- Store compaction/GC and signing/notarisation of revisions.
- A TS re-implementation of patching/hashing (the app calls core; revisit only if a screen genuinely needs it offline).
- Automatic `deviations[]` bookkeeping when a restore is applied (rule-engine/UI orchestration, W1.2/W1.10).

## Checks

```powershell
uv run --directory core pytest -q -k spec_engine
uv run --directory core pytest -q    # full suite incl. schema+examples
```
