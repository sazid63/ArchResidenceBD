# Question engine — v0 (W1.4)

**Status:** v0.0.0 (core module) — chips, deterministic parser, escalation seam and provenance writes are working and tested against the full flow book.
**Code:** `core/src/archres_core/interview/{flow,parse,engine}.py` (re-exported from `archres_core.interview`).
**Decision record:** **ADR-0010**.
**Plan:** §5.5 (flow book feeds UX/training/tests) · §8 (chips are shortcuts; free text and model takeover; parse failures escalate) · §9 (never silent coverage gaps; unverified content is a candidate).
**Inputs:** Phase Flow Book v0.1.0 (`spec/flows/phase-flow-book.yaml`, W0.4) · spec engine v0 (`archres_core.spec`, W1.3).

## What it is

One deterministic interview over one Building Spec:

```python
from archres_core.interview import Interview, load_book

book = load_book("spec/flows/phase-flow-book.yaml")
interview = Interview(book, spec, lang="bn", at="2026-10-20T10:00:00+06:00")

interview.prompt()          # question, why, chips, pointer, progress
interview.answer("5 katha") # free text -> validated, provenance-stamped spec patch
interview.answer("", choice="metric")   # chip answer (same path, no parser)
interview.skip()            # "I don't know" -> authored fallback or open essential
interview.use_default()     # "you decide" -> authored fallback
interview.finish()          # fall back on everything left; list open essentials
interview.progress()        # counts, open essentials, pending work, assumptions
interview.coverage()        # per-question/per-storey outcomes
```

Each `Turn` says what happened (`accept | fallback | ask_again | escalate | done`), the localized reply (BN/EN), the ops written, a reason, and — for escalation — the model request payload. The engine never calls a model and never reads a clock unless the caller omits `at`.

## Answer semantics

The parser (`parse.py`) is pure and total over user input: it returns a decision, never raises on unfamiliar text.

| Question type | Accepted input |
|---|---|
| `number` | ASCII/Bengali digits, English/Bangla/Banglish number words, `ft`/`feet`/`ফুট`, `inch`, `m`/`মিটার`, `sqft`/`sft`/`sq ft`/`বর্গফুট`, `sqm`/`m²`/`বর্গমিটার`, `katha`/`কাঠা`, `shotok`/`শতক`/`decimal`, `bigha`/`বিঘা`, `gonda`/`গন্ডা`, `kPa`, `BDT`; `12'6"` / `12 ft 6 in` |
| `integer` | Whole numbers; `G+2` / `ground plus 2` = 3 floors (storey count); bounds from the Building Spec |
| `yes_no` | `yes/no`, `হ্যাঁ/না`, `ha/na`, `ache/nei`, `করব না` (trailing negation wins); mixed yes+no is a re-ask |
| `choice` | Option id or BN/EN label, partial text (`sylhet division`); two plausible options → re-ask with candidate chips |
| `text` / `file` | Trimmed text; schema length limits enforced; empty input re-asks |
| all | `jani na` / `don't know` → `skip`; `you decide` / `আপনি ঠিক করুন` → `default`; genuinely unreadable → `escalate` |

**Units.** Storage is canonical (`m2`, `m`, `kPa`, `BDT`) and conversion is Decimal-only via `archres_core.units`: 5 katha → `334.45 m²`, 20 ft → `6.096 m`, 12′6″ → `3.81 m`, 12 mm → `0.012 m`. A **bare number** on a unit question uses the project's current display unit (`displayUnits.area` / `.length`) and is recorded at `confidence: medium`; an explicit unit always wins. A wrong dimension (`5 ft` for an area) is a re-ask, never a guess.

**Chips** (`chips()`) are the option buttons plus one explicit **"I don't know"** shortcut when the question has a fallback. Essential questions have no skip chip — they cannot be assumed.

## Answer → spec mapping

The book's UI vocabulary is not the spec's vocabulary (ADR-0010). Three declared mappings, pinned by tests:

| Question | Answer | Spec write(s) | Provenance |
|---|---|---|---|
| `display-units` | `metric` / `feet-inch` / `bangla-land` | `displayUnits.area` + `displayUnits.length` = `sqm|m`, `sqft|ft`, `katha|ft` | `user` |
| `material-prices` | yes / no | `pricing.source = user` / authored `registry` fallback (`fetched` + assumption) | `user` / `assumption` |
| `soil-has-report` | yes / no | `soil.status = user_report` / authored `area_default` fallback (+ assumption) | `user` / `assumption` |

Every other answer writes its `maps_to` pointer verbatim. `/phases/<id>/data/...` containers are created when missing; `/pricing` is seeded with its required currency.

## Fallback policy

| Book fallback | Behaviour | Outcome |
|---|---|---|
| `default` with value | writes the value | `fallback:default`, provenance `default` |
| `registry` / `area_default` with a schema-valid value | writes it, appends the authored assumption to `/assumptions` | `fallback:<kind>`, provenance `assumption` |
| `registry` / `area_default` with a symbolic value (e.g. `derived-from-location`) | **no write**; declared `pending` with the assumption + schema reason | `fallback:<kind>_pending` |
| `derive` with `<pointer>` | resolves the pointer and writes it | `fallback:derive`, provenance `engine` |
| `derive` without a source, or an unresolved source | declared `pending` (design phase) | `fallback:derive_pending` |
| `omit` | nothing written | `omitted` |
| essential question, no fallback | stays current, listed in `openEssential` | `ask_again: essential_open` |

Assumption entries: `id: asm-<question>`, English statement (the hand-authored one), `basis` (`area_default | external_source | conservative_default`), `verifyOnSite`, `relatedPath`. They are appended, never overwritten; re-running is idempotent.

## Conditions and storeys

`when` conditions are evaluated against **answers** (a yes/no answer is a boolean, a choice is its option id), not the coerced spec value. The answer table is seeded from the spec at construction, so scoped and resumed runs still resolve `soil-has-report`, `existing-structure` and `foundation-system` without asking setup again.

The floor flow repeats per storey: `/phases/floor-<n>/data/...` expands with `storeyIndex` (`floor-0` = ground floor), and the run count comes from `/building/storeys/count` (or the answered `storeys-count`). A spec whose phase list lacks that floor is an `InterviewError`, not a chat question.

## Escalation seam

Unreadable input returns:

```json
{
  "decision": "escalate",
  "reason": "unrecognised_choice",
  "escalation": {
    "questionId": "display-units",
    "pointer": "/project/displayUnits/area",
    "type": "choice",
    "unit": null,
    "ask": {"en": "...", "bn": "..."},
    "options": [{"value": "metric", "label": {"en": "...", "bn": "..."}}],
    "answer": "<raw user text>",
    "instruction": "<localized JSON-only instruction>",
    "contract": {"json": {"value": "<typed value>", "unit": "<unit or null>"}}
  }
}
```

W1.10 (orchestrator) builds the prompt from it. The model reports the value **in the unit the user used** — it is explicitly not asked to do the conversion; `accept_external(value, unit=...)` converts through the land-unit module, re-validates by question type, applies the same schema gate, and records `source: user`, `confidence: low`, `detail: model-parsed (escalation)`. An invalid value is a visible `model_invalid` re-ask; it cannot write. On stock base models a valid-but-wrong reading is still possible (low confidence is the honest signal); W1.6/W1.9 own the quality gate.

## Coverage & provenance

- `coverage()` → one row per visited step: `{question, storeyIndex, pointer, outcome, reason, detail}`. A 2-storey full run is exactly **69** steps (60 book questions + 9 floor questions for the second storey). Every book question appears; condition-skipped questions say `condition`; unresolved conditions say `condition_unresolved`.
- `history()` → append-only turn log (question, pointer, outcome, reason, value).
- Every write goes through `apply_patch` (W1.3) with a `ProvenanceEntry` (`source`, `detail`, `at`, `confidence`); user numeric answers include the entered form (`as entered: 5 katha`), model-parsed values are `low`, bare-number display-unit reads are `medium`.

## Deliberately NOT in v0

- **No model in core** — the orchestrator calls it (W1.10); teacher/chat prompts are not part of this engine.
- **No conversation memory beyond one question** — multi-turn dialogue belongs to W1.10/W1.12.
- **No undo/deltas** — the spec store (W1.3) owns revisions; W1.10 commits.
- **No `kani`** — no authoritative factor (ADR-0009).
- **No area-default payload values** (e.g. SBC kPa) — the assumption is recorded, the value waits for the Source Registry (W2.7); the rule engine reports it as `missing_input` in the meantime.
- **No learning parser** — typos outside the deterministic vocabulary escalate rather than guess.
- **No multi-select question in the book** — the parser path exists and is tested with a synthetic question.

## Checks

```powershell
uv run --directory core pytest -q tests/test_interview_flow.py tests/test_interview_parser.py tests/test_interview_engine.py
uv run --directory core pytest -q     # full suite
```
