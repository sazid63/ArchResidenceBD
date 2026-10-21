---
name: ArchResidenceBD package closure
description: Close one ArchResidenceBD work package the way the repo's law requires - the local gate sweep, the live probe recorded in the spec doc, board and spec numbers that are true, a commit with CI green, and only then the tick. Use when finishing a package from the P0-P5 boards, or when asked to close, tick, or record a work package.
---

# Closing a work package

**One package at a time.** The order below is the closure order: each step is the evidence for
the next. Skipping a step is what leaves a board lying.

## 0. Read first

- `docs/plan/ArchResidenceBD-Plan-v1.5.md` — the plan of record (frozen; §1–§2 are law).
- `docs/work/P<n>.md` — the phase board: this package's line, its **done when**, its dependencies.
- `docs/adr/` — the decisions already taken. A **new** decision needs a new ADR, numbered after
  the last one.

## 1. The local gate sweep — all of it, before anything is committed

```powershell
uv run --directory core python -m pytest -q                 # the suite
python tools/ci/py_syntax_check.py                          # every file compiles
python tools/ci/brand_guard.py                              # the brand law over the shippable set
python tools/ci/bangla_render_guard.py                      # the Bangla PDFs still render
uv run --directory core python ../tools/ci/spec_fuzz_guard.py
```

Then **every** `--check` CLI the CI runs (each one re-derives its artefacts and compares them
with the committed ones — they are the freshness half of the gate):

```powershell
python tools/codegen/generate_spec.py --check
python tools/codegen/generate_interfaces.py --check
uv run --directory core python ../tools/rules/render_pack.py --check
uv run --directory core python ../tools/rag/build_corpus.py --check
uv run --directory core python ../tools/flow/render_book.py --check
uv run --directory core python ../tools/serving/fleet.py --check
uv run --directory core python ../tools/eval/build_cases.py --check
uv run --directory core python ../tools/cad/verify.py --check
uv run --directory core python ../tools/cad/foundation_probe.py --check
uv run --directory core python ../tools/cad/floor_probe.py --check
uv run --directory core python ../tools/cad/rebar_probe.py --check
uv run --directory core python ../tools/cad/mesh_probe.py --check
uv run --directory core python ../tools/cad/federation_probe.py --check
uv run --directory core python ../tools/cad/commons_probe.py --check
uv run --directory core python ../tools/cad/drawing_set_probe.py --check
uv run --directory core python ../tools/boq/build_boq.py --check
uv run --directory core python ../tools/pricing/price_service.py --check
uv run --directory core python ../tools/compliance/render_reports.py --check
uv run --directory core python ../tools/documents/render_bbs.py --check
uv run --directory core python ../tools/documents/render_boq.py --check
uv run --directory core python ../tools/documents/render_pack.py --check
uv run --directory core python ../tools/walking_skeleton/run.py --check
pnpm --dir app typecheck
```

A package that touches the engine also needs its **live** probe (the `--check` above is the
offline half) — see the `archres-cad-probe` skill.

## 2. The live probe, recorded in the spec doc

The spec doc (`docs/spec/<name>-v0.md`) carries **what was measured, on what date**, in the
package's own words. The numbers in it are the CI's output copied in, not estimates.

## 3. The board and the spec numbers are true

- **No hand-maintained totals in the prose.** Byte counts, file sizes and totals drift the
  moment anything upstream moves a byte. The law: *"the exact count is removed from prose and
  left to CI output"*. Keep the **structural** facts — the sheets, the pages, the parts, the
  bars, the kilograms, the taka — and keep them true.
- A **dated measurement table** may keep its numbers, but it must carry the **current** ones.
- The board line and the spec doc must not disagree with each other or with the artefacts.

## 4. Commit, push, CI green

One commit per package, with a message that says **what was wrong, what the fix was, and why** —
not what the diff shows. Then `git push` and wait for CI (`gh run list --limit 1`) to be
**green**. A red CI is not a closed package.

## 5. Then the tick, and the closure note

Only now: tick the board line, add the closure note (what was built, what was measured, what
is still missing — named, not implied), and the ADR + spec doc references.

## The laws every package obeys

- **$0 budget, one app, offline-first.** No paid services, no new model members, no new
  external dependency without the owner's sign-off.
- **Scripts first, AI last-mile.** Deterministic Python does the math, the geometry, the rules
  and the BOQ; models phrase, parse, explain and repair.
- **Never falsify a document.** Unverified content is a **candidate**, and says so.
- **Identical outputs under optimization.** The same input must give the same bytes.
- **Never a silent coverage gap.** What is missing is named in the output, not implied.
- **No half-applied state.** A change lands whole, or does not land.
