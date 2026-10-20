# Chat-loop demo v0 (W1.12)

**Status:** v0.1.0 · decision record: **ADR-0013**
**Code:** `archres_core.demo` (scenario + runner) · `tools/demo/chat_loop.py` (CLI)
**Scenarios:** `tools/demo/scenarios/dhaka-house-{bn,en}.json` · **Spec:** `tools/demo/scenarios/demo-project.json`
**Consumes:** `archres_core.agent` (W1.10), `archres_core.interview` (W1.4), `archres_core.spec` (W1.3), `archres_core.serving` (W1.11)
**Plan:** §4 (fallback on stock base) · §8 (zero-LLM fast paths, escalation) · Appendix C W1.12

## What the demo is

One command interviews a dummy two-storey Dhanmondi house through every authored question in BN or EN, using the real interview, orchestrator, revision store and (optionally) the real llama-swap fleet. Output is a spec, an append-only transcript, a coverage table and a summary — the same artifacts a reviewer or the future UI needs.

```powershell
$env:ARCHRES_ROOT = "$PWD\data\downloads\s2"
uv run --directory core python ../tools/demo/chat_loop.py --scenario tools/demo/scenarios/dhaka-house-bn.json
uv run --directory core python ../tools/demo/chat_loop.py --scenario tools/demo/scenarios/dhaka-house-en.json --no-model
```

Exit 0 = completed with **no open essential**. Exit 1 = scenario error, rejected answer, failed escalation, or open essentials.

## Scenario format

```json
{
  "name": "dhaka-house-bn",
  "title": {"en": "...", "bn": "..."},
  "language": "bn",
  "flows": ["setup", "site-excavation", "foundation", "floor", "roof-boundary", "common-services"],
  "spec": "demo-project.json",
  "answers": {
    "project-name": "ধানমন্ডি পারিবারিক বাড়ি",
    "display-units": {"choice": "metric"},
    "plot-area": "৫ কাঠা",
    "storeys-count": "২",
    "ground-floor-height@1": "৩.১ মিটার"
  },
  "maxTurns": 200
}
```

- **Answers** — `"text"` (parsed deterministically), `{"choice": "<option id>"}`, `{"skip": true}`, `{"default": true}`; `id@<storey>` overrides the question for one floor.
- **Validation** — unknown scenario keys, question ids, flow ids, duplicate flows, non-`en|bn` language, empty answers, bad storey suffixes and non-positive `maxTurns` are refused with a named error. A missing `spec` file is refused.
- **Essential answers** — all six essential questions (name, division, district, plot area, road width, storey count) must be answered by the scenario; the runner refuses to stall or assume them.
- **Everything else** — unanswered non-essential questions use the flow book's authored fallback; nothing is invented.

## Runner

| Situation | Behaviour |
|---|---|
| scripted text / choice | `Session.respond(...)` |
| `skip` | `Session.skip()` (authored fallback; essentials stay open) |
| `default` | `Session.use_default()` |
| no answer, non-essential | `Session.use_default()` |
| no answer, essential | `DemoError` naming the question |
| parser escalates, model attached | `Session` calls the model once; accepted → write (`source: user`, `confidence: low`); unreadable/rejected → `DemoError` |
| parser escalates, no model | `DemoError` ("no model is attached") |
| same answer rejected twice | `DemoError` (no retry loop) |
| after the walk | `Session.finish()` (fallbacks for the rest), then one summary |

The runner never touches the spec directly; every write is the session's provenance-stamped patch and every revision is the store's.

## Artifacts

| File | Content |
|---|---|
| `store/` | the real revision store: `revisions/<sha>.json` + `log.jsonl` |
| `spec.json` | the final Building Spec |
| `transcript.json` | session events (session, injection, model request/reply/invalid, turn, commit, tool, finish) |
| `coverage.json` | one outcome per visited step (answered / fallback / omitted / skipped / open) |
| `summary.json` | scenario, language, elapsed, steps, decision counts, open essentials, pending, model calls, tip revision, coverage size |
| `fleet.log` | llama-swap log when the demo started the fleet |

## Verified

| Check | Result |
|---|---|
| BN run, `--no-model` | 69 coverage / 63 writing turns, 61 accept + 2 fallback, 0 open essentials, 63 revisions, ~2.3 s |
| EN run, `--no-model` | identical counts and shape (English text answers) |
| BN run with the real fleet | fleet ready + interview warm 5.9 s; demo 2.6 s; same spec shape |
| BN run with the W1.6 fine-tune | fleet ready + interview warm 4.9 s (chat 2.3 s, embed 1.3 s, rerank 1.3 s); demo 2.389 s; 69 coverage / 63 writing turns, 61 accept + 2 fallback, 0 open essentials, 0 model calls |
| EN run with the W1.6 fine-tune | same warm-up; demo 1.991 s; identical 69/63 shape, 0 open essentials, 0 model calls |
| Fine-tune escalation probe (2026-10-20, before the parser fix) | temporary copy of `dhaka-house-bn` with `plot-area: সাড়ে ৫ কাঠা`; 2.378 s; 69/63, 61 accept + 2 fallback, 0 open; 1 model call; `llama-swap:chat` returned valid JSON `{"value":5.0,"unit":"katha"}`, written at `confidence: low` — **5.0, not 5.5**; the stock fractional-area finding persisted and was handed to W1.6 |
| Fractional-area probe after the parser fix (2026-10-20) | same temporary scenario, same fleet, same model: `plot-area: সাড়ে ৫ কাঠা` → turn `decision: accept`, `value: 367.9` (m²) = **5.5 katha**, `model: null`, **0 model calls**; demo 2.082 s, 69/63, 61 accept + 2 fallback, 0 open essentials, exit 0. The fractional area is now decided by the deterministic parser, not by a low-confidence model read (ADR-0020) |
| Fractional parser guard | the parser expands `সাড়ে` / `দেড়` / `আড়াই` / `সোয়া` / `পৌনে` / `half` / “N and a half” to decimals before unit conversion; a fraction with no resolvable base still escalates with `unparseable_fraction`; regression tests added after the fine-tune probe exposed the old 5.0 read |
| BN/EN re-run on the selected model (2026-10-20; the warm-up then included the rerank seat, which is parked since ADR-0026) | `archie-chat-v0` on the real fleet: interview warm 4.922 s (chat 2.328 s, embed 1.313 s, rerank 1.281 s); BN demo 2.125 s, EN demo 2.068 s; both 69 coverage / 63 writing turns, 61 accept + 2 fallback, 0 open essentials, 0 model calls, exit 0 |
| Live escalation probe (stock 4B) | valid JSON returned and written at `confidence: low`, but a Bengali fractional area was misread — model-quality finding for W1.6/W1.9 |
| Automated tests | 19 new (scenario validation, runner honesty, CLI smoke) — 475 → 494 at W1.12; the suite total is asserted by CI, not by this table |
| cp1252 console | narration survives a captured cp1252 pipe (`PYTHONIOENCODING=cp1252` regression test); Bangla text is UTF-8 on stdout and stderr |
| relative `--root` | `--root data/downloads/s2` resolves against the repo, not against `core/` (regression test) |

## Deliberately NOT in v0

- **No production UI** — terminal transcript only; the app shell is P2.
- **No interactive keyboard mode** — scenarios are data; a human can add a scenario or use the session API directly.
- **No model-phrased questions** — prompts are the authored BN/EN flow-book text.
- **No SFT model in the stock acceptance pair** — the original W1.12 runs used the stock base (plan §4 fallback). The W1.6 scripted fine-tune is now the selected chat model and the BN+EN scenarios re-ran on it (rows above); the teacher-augmented round was measured separately and not selected, and the fractional-area fix now lives in the deterministic parser, so these rows are integration evidence for the selected model.
- **No eval scoring** — W1.9 will consume these scenarios and artifacts as fixtures.
