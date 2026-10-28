# Flow Book (docs/flow)

The **Phase Flow Book** is the hand-authored set of interview questions for every phase — the spine of the chat UX, the future source for Archie-Chat training data, and a test fixture (plan §5.5). Adding a question is a **data edit**, never a code change.

Status: **v0 draft** — first pass authored in W0.4 (2026-10-17); engineer review pending (ADR-0001; user-facing label: "engineer validation pending — Launch Plan").

## Files

| Path | Role |
|---|---|
| `spec/flows/phase-flow-book.yaml` | **Source of truth** — authored BN/EN questions, options, defaults, units |
| `spec/schemas/flow-book.schema.json` | JSON Schema 2020-12 (strict), validated in CI |
| `phase-flow-book-v0.md` | Rendered read-only book — **generated, do not edit** |
| `tools/flow/render_book.py` | Renders the book; `--check` verifies freshness (CI) |
| `core/tests/test_flow_book.py` | Schema + invariant tests, incl. binding to the Building Spec |

## Commands

```powershell
uv run --directory core pytest -q                                    # validate + invariants
uv run --directory core python ../tools/flow/render_book.py           # regenerate the rendered book
uv run --directory core python ../tools/flow/render_book.py --check   # freshness (CI)
```

## Conventions

- Bangla is **hand-authored — never machine-translated**.
- Every question explains itself (`why`) in both languages.
- Every question is either `essential: true` (cannot be assumed; the interview keeps it open) **xor** has a `fallback` (what happens when unanswered): `default | registry | area_default | derive | omit`. `registry` and `area_default` fallbacks must carry an explicit assumption statement in both languages.
- `maps_to` is a JSON Pointer into the Building Spec; phase-specific answers live under `/phases/<flow-id>/data/...` (the floor flow uses `/phases/floor-<n>/data/...`). Tests keep the roots and phase kinds in sync with the spec schema.
- Choice options render as chat chips (the small quick-reply buttons).
- `when` is a simple condition over question ids (or the variable `storeyIndex`), e.g. `soil-has-report == yes`, `storeyIndex > 0`.

## Evolution

- While `status: draft`, wording can change freely (edit YAML → tests → render).
- After freeze: wording = patch bump; a new question = minor bump; structural changes (new field/semantics) need an ADR + schema update first (repo rule).
- v0.1.0 = W0.4 deliverable.
