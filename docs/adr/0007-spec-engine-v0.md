# ADR-0007 — Spec engine v0: canonical hash, patch law, revision store

- **Status:** Accepted
- **Date:** 2026-10-18
- **Deciders:** Owner (standing order for the autonomous build-out run; package W1.3 defined by plan Appendix C)

## Context

The Building Spec is the single source of truth for a project (§5.4) and everything downstream — question engine (W1.4), rule engine restore-to-compliant (W1.2), incremental design (plan §8), project bundle (P3) — needs the same primitives: patch, validate, version, provenance. The W0.9 verdict schema already froze a `specPatch` op shape (`add/replace/remove` + JSON pointers) for the one-click restore; the spec engine must accept exactly that shape. The Building Spec schema itself declares two facts: `revision` is a counter with "history lives outside this JSON", and `locked` marks revisions as immutable snapshots managed by the engine. What was NOT yet decided: the canonical hashing form (verdicts pin `subject.specSha256`), where history lives, how locking works, and what the patch law guarantees.

## Decision

1. **Canonical hash**: `sha256` of UTF-8 `json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`; revision metadata participates, so a hash identifies an exact snapshot. Core is the only computer of this hash for now (stated caveat for any other implementation).
2. **Patch law**: JSON-Patch-style `add`/`replace`/`remove` over RFC 6901 pointers on a deep copy; provenance is **required** per patch (plan §2.5) and written per touched path; the result is schema-validated before returning — no partial results, input never mutated; `/revision`, `/locked`, `/updatedAt` are reserved for the store. Op shape ≡ W0.9 verdict `specPatch` (restore applies 1:1).
3. **Revision store**: directory-backed — `revisions/<sha256>.json` immutable snapshots + append-only `log.jsonl` (number, sha256, parent, createdAt, note, locked, ops). Commits only from the current tip and only when unlocked; identical content is never recorded twice.
4. **Lock semantics**: `lock()`/`reopen()` are metadata-only revisions (the log is the whole story); a locked tip refuses commits until explicitly reopened — engineer-review freeze without hidden state.
5. **Diff**: `diff_specs` produces pointer-level changelog rows (`path`, `before`, `after`) — the changelog/diff requirement of §5.4.

## Consequences

- W1.2's restore-to-compliant pipes verdict ops straight into `apply_patch` (convention: `source: "engine"`, detail naming the ruleRef); the new revision's hash becomes the next evaluation's `subject.specSha256`.
- W1.4 writes answers as `source: "user"`/`"default"` patches; provenance stays complete without per-caller bookkeeping.
- Locked revisions give the engineer-review handoff (P3) a real mechanism instead of convention.
- Costs accepted: no branching/merge in v0 (branch = copy the store); no patch-against-drifted-revision resolution (stale parents are refused); TS does not re-implement hashing.
