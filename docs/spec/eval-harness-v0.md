# Eval harness v0 (W1.9)

**Status:** v0.1.0 · decision record: **ADR-0015**
**Code:** `archres_core.eval` (`cases` · `build` · `run`), `archres_core.agent.law` (`LawDesk`)
**Data:** `data/eval/chat-v0/` — `authored.yaml` (hand-written) → `cases.jsonl` + `split.json` + `manifest.json` (generated)
**Baselines:** `data/eval/chat-v0/replies/stock.jsonl` + `gates.json`
**CLIs:** `tools/eval/build_cases.py` · `tools/eval/run_eval.py` · `tools/eval/record_baseline.py`
**Consumes:** rule pack (W1.2), flow book + deterministic parser (W1.4), scripted dataset (W1.5), RAG service (W1.1), demo scenarios (W1.12)
**Plan:** §9 (quality law), Appendix C W1.9

## What it does

Turns "the app got better" into a number that cannot move unless the behaviour moves. A case is
a **claim about behaviour**: an input, the language it arrives in, the expected outcome, and
the source it came from. Cases are generated from artifacts other packages already pin, so
nothing is transcribed twice; the only hand-written file is `authored.yaml`.

```text
rule pack ──┐
dataset ────┤
flow book ──┼──▶ build_cases.py ──▶ cases.jsonl (655, byte-stable, --check in CI)
authored ───┘                         │  ▲ split.json (frozen by hashed question id)
                                      ▼  │
                         run_eval.py ──▶ report.json ──▶ gates.json ──▶ exit 0/1
                                      ▲
                     replies/<model>.jsonl (recorded live, pinned by sha)
```

Three laws from plan §9 shape the design:

1. **No unverified pass.** A case that cannot be scored is an error, not a skipped line: the
   runner raises if the outcome count does not match the case count, and again if an outcome
   names a case that is not in the file. `coverage` is reported for every suite.
2. **The split is frozen before training.** `split.json` is a committed document keyed by
   source question / scenario id, so a re-run cannot move a question across the line.
3. **A gap is data.** A refusal that the corpus cannot support is a scored expectation
   (`declared_gap`), and a question nobody has measured is listed as a coverage probe rather
   than quietly dropped.

## The case file

`cases.jsonl`, one JSON object per line, sorted by `id`, canonical JSON, LF, no trailing
spaces. Keys are exact (`id`, `suite`, `lang`, `split`, `source`, `input`, `expect`); a missing
or extra key is a build error. `lang` is `bn`, `en` or `null` (deterministic machinery).
`split` is `train`, `holdout` or `engine`.

| Suite | Cases | What it measures | Gate |
|---|---|---|---|
| `rule.vector` | 49 | every frozen test vector of the rule pack still evaluates as declared | `accuracy` = 1.0 |
| `parse` | 523 | the deterministic parser replayed over every recorded answer: never stalls, never invents an acceptance, never rejects a clean answer | `neverStalled` = 1.0, `agreement:clean` = 1.0 |
| `model.parse` | 60 | a **recorded model** answers the holdout parse questions; right decision *and* right value | stock-baseline floors (below) |
| `rag` | 18 | the cited corpus retrieves the expected document in the top 5, or declares the gap | `citationRecall` = 1.0, `abstentionAccuracy` = 1.0 |
| `scenario` | 2 | the BN and EN demo scenarios reach the frozen end state (steps, coverage, accepts, revisions) | `accuracy` = 1.0 |
| `register` | 3 | override → acknowledge → restore → idempotent re-ack round-trip through the deviation register | `accuracy` = 1.0 |

`coverage_probes` in `authored.yaml` are **not** cases: questions the corpus cannot answer yet.
They are run and reported with their top hit, never gated (see below).

## The frozen split

```
holdout iff sha256(f"{seed}:{key}")[0] < 96      seed = 20261020
key = question id (parse, model.parse), scenario stem (scenario)
rag  -> always holdout        rule.vector, register -> engine
```

`build_cases.py --init-split` creates `split.json` once (a reviewed event, committed); a plain
build **fails** if the document is missing, so a fresh clone cannot silently re-split. Current
state: 16 holdout / 24 train question ids, 1 holdout / 1 train scenario, 52 engine cases.
`check_split()` re-derives the bucket for every case and reports a moved case; the suite
fails if a case's recorded `split` disagrees with the document.

## Baselines and gates

`gates.json` holds one floor per (suite, metric). A deterministic suite is gated at **1.0** —
any drop is a regression. The model suite is gated at the **measured stock baseline** so a
fine-tune that scores below the base model fails CI instead of being celebrated.

| Metric | Stock value | Floor | Meaning |
|---|---|---|---|
| `parse/neverStalled` | 1.0 (523/523) | 1.0 | no answer text raises or returns an unknown decision |
| `parse/agreement:clean` | 1.0 (142/142) | 1.0 | an unmutated answer is never rejected |
| `model.parse/decisionAccuracy` | 0.65 (39/60) | 0.65 | decision matches the dataset label |
| `model.parse/valueAccuracy` | 0.50 (17/34) | 0.50 | accepted values match |
| `model.parse/accuracy:bn` | 0.5667 (17/30) | 0.5667 | correct parses, Bangla |
| `model.parse/accuracy:en` | 0.50 (15/30) | 0.50 | correct parses, English |
| `rag/citationRecall` | 1.0 (18/18) | 1.0 | expected document in top 5 |
| `rag/abstentionAccuracy` | 1.0 (3/3) | 1.0 | a declared gap is not answered |
| `rule.vector/accuracy` | 1.0 (49/49) | 1.0 | pack vectors unchanged |
| `scenario/accuracy` | 1.0 (2/2) | 1.0 | demo end state unchanged |
| `register/accuracy` | 1.0 (3/3) | 1.0 | register round-trip unchanged |

**Baseline model:** Qwen3-4B-Instruct-2507 Q4_K_M, served by the S2 llama-swap fleet, recorded
2026-10-20 at temperature 0, 60 calls, `data/eval/chat-v0/replies/stock.jsonl`. A model case
passes only when the decision **and** the accepted value are right — accepting the wrong value
is the worst outcome this suite exists to catch, so it never counts as a pass.

Every number above comes from `tools/eval/run_eval.py` on `main`; the report is the authority,
not this table.

## Suite detail

### `parse` — the parser's safety contract, not its reach

The dataset's `interview.parse` labels are the **assisted-path target** (fuzzy choice labels,
topicality, "don't know" phrasing), not the deterministic parser's output. Asserting equality
would measure the parser against work that belongs to the model seam, so the suite gates the
two properties that must always hold and reports the rest as **visible deferrals**:

- it answers for every input (`neverStalled`);
- it never accepts a different value than the dataset records, and never accepts an answer the
  dataset rejects (`agreement:*`);
- when it asks again or escalates on an answer the dataset accepts, the report says so — that
  gap is what `model.parse` has to close.

`unit` is deliberately not compared: the dataset labels a canonical unit (`m2`) while
`ParseResult.unit` is the unit the user typed. Comparing them would report a vocabulary
difference as a bug.

| Input | Cases | Agreement | Reading |
|---|---|---|---|
| `clean` | 142 | 142 | ✅ |
| `dont_know` | 80 | 51 | BN refusal phrases ("মনে নাই") are accepted as text — **parser gap** |
| `partial` | 46 | 3 | truncated choice label ("রাজ" → rajuk) is the model's job |
| `typo_label` | 46 | 7 | typo'd option label ("RAJU") is the model's job |
| `unknown_choice` | 46 | 46 | ✅ |
| `off_topic` | 34 | 28 | a free-text question accepts off-topic text; topicality is the model's job |
| `absurd` | 22 | 22 | ✅ |
| `unit_alt` | 20 | 20 | ✅ (katha/shotok/bigha/sqft round-trip) |
| `omit_unit` | 18 | 0 | a bare "1.8" is accepted; the dataset wants `ask_again` — **parser gap** |
| `typo` | 18 | 12 | "1.8 mm" → 0.002 m is accepted as a real answer — **parser gap** |
| `banglish` | 16 | 16 | ✅ |
| `bangla_digits` | 11 | 11 | ✅ |
| `as_given` | 6 | 6 | ✅ |
| `whitespace` | 6 | 6 | ✅ |
| `affirm_sloppy` | 6 | 5 | BN "হুম" is not in the yes/no vocabulary |
| `maybe` | 6 | 0 | "majhe majhe" escalates where the dataset asks again — **parser gap** |

Overall agreement 375/523 (0.717; BN 0.684, EN 0.749). It is **not** gated: a third of the
misses are the model's work by design, and the rest are recorded here as W1.4 headroom rather
than silently deleted. What is gated is that the parser never stalls and never rejects a clean
answer.

### `model.parse` — what the stock model actually does

28 of 60 holdout cases fail at the floor. The failures are specific, which is the point:

| Failure | Count | What it says |
|---|---|---|
| `ask_again` where the dataset accepts | 7 | conservative on typo'd choice labels and unit alternatives — the SFT target |
| `fallback` where the dataset asks again | 6 | answers "don't know" for optional questions it should re-ask |
| `fallback` where the dataset escalates | 3 | treats off-topic as "don't know" |
| `fallback` where the dataset accepts | 2 | gives up on a real answer |
| `accept` where the dataset asks again | 1 | accepts without a unit |
| `ask_again` where the dataset escalates | 1 | |
| `convert` | 1 | **invented a decision outside the vocabulary** (accept / ask_again / fallback / escalate) |
| value not canonical under `accept` | 7 | `RAJUK` vs `rajuk`, `no_preference` vs `no-preference`, `on-site` vs `keep-on-site` (×2), `none` vs `no-preference`, `living space` vs `residential`, a "corrected" typo in a project name |

The value rows are not rounding noise: they are the model emitting a plausible *synonym*
instead of the canonical token. The app compares exact values, so this is a real defect class
for W1.6 to train away (one case may be a dataset nit — the project name `rPoject 1` is
labelled with the user's typo, which the model silently fixed; recorded, not "fixed" by
weakening the comparison).

### `rag` — retrieval and abstention

Offline scoring uses `HashingEmbedder` + `LexicalReranker` (deterministic, no fleet), because a
gate that needs a warm 4B is a gate nobody runs.

| Case | Mode | Rank of the expected document |
|---|---|---|
| `setback-from-boundary` BN/EN | answer | 1 / 1 |
| `maximum-ground-coverage` BN/EN | answer | 1 / 1 |
| `paved-open-space` BN/EN | answer | 1 / 1 |
| `corner-plot` BN/EN | answer | 2 / 1 |
| `far-six-metre-road` BN/EN | answer | 2 / 1 |
| `dead-end-road-front` EN | answer | 1 |
| `entrance-ramp` BN/EN | answer | 1 / 1 |
| `parking-150-sqm-flat` BN/EN | answer | 2 / **4** |
| `habitable-room-space-requirements` BN/EN | declared_gap | 1 / 1 |
| `habitable-room-ceiling-height` EN | declared_gap | 1 |

18/18 inside the top 5; 16/18 at rank 1 or 2. The weakest hit is `parking_row` in English at
rank 4 (the Bangla twin is rank 2): the row's text is mostly numbers, so the lexical channel
has little to match and the dense channel is the offline hashing embedder. Gate stays at top-5
recall — raising it to top-1 would encode a ranking claim the v0 retriever cannot keep. The
`declared_gap` cases pass only because the gap document exists and the desk *stops* at it; the
desk never answers from a gap.

### `scenario` and `register`

Scenarios are the committed W1.12 fixtures, replayed deterministically without a model:
63 writing turns, 69 coverage steps, 61 accept + 2 authored fallbacks, 0 open essentials,
revision 63 — identical in BN and EN, and the expected end state is pinned in `authored.yaml`.

Register cases replay a real override through the engine: apply ops on a committed spec
example, evaluate the verdict, apply the register, acknowledge the entry, `restore_patch`, and
re-acknowledge (idempotence). Each case pins the entry id, the pointer, the pre-override value
and the remaining ops after restore, so a register that mutates or drops an entry fails.

## Coverage probes — reported, never gated

Four questions the corpus cannot support. Each is run through the real desk and recorded:

| Lang | Probe | Top hit | Status |
|---|---|---|---|
| en | minimum width of a staircase | `provision:s51-9-14-road-width` | `retrieved` |
| en | minimum height of a parapet wall | `footnote:f6` | `retrieved` |
| en | concrete grade for a 6-storey building | `far_table:far-g1k2` | `retrieved` |
| bn | how many lifts for a 20-storey tower | `provision:setback-schedule` | `retrieved` |

They cannot be gated, and the reason is exactly what makes them useful: **no authored case
would pass today**. The corpus holds no staircase-width, parapet-height, concrete-grade or
lift-count provision, and the desk's `declared_gap` path only fires when a *gap document*
matches the query — these four retrieve a neighbouring provision and report `retrieved`. That
is the honest state: retrieval returns something plausible, and nothing in v0 stops a reader
from treating it as the answer. Recording it per run (query, status, top hit) makes the gap
visible on every eval until the corpus closes it; inventing an expectation now would either
fabricate a match or encode "always abstain", which is false for the 15 answerable cases.

## What the harness found while it was being built

1. **A training-data defect (fixed).** All 6 `affirm_sloppy` records labelled an affirmative
   answer ("yup", "হ্যাঁ হ্যাঁ") as `false`, because the operator kept the base value. The
   deterministic parser read the text correctly and the labels disagreed — this would have
   taught W1.6 that "yes" means "no". Fixed in `training/mutations.py` (`affirm_sloppy` now
   returns `value: True`) with the verifier recomputing from the operator; the dataset was
   rebuilt (dataset sha pinned in `manifest.json`), and a regression test asserts that every
   committed `affirm_sloppy` record is labelled `True`. The recorded stock replies were **not**
   re-recorded — the prompts did not change, and the stock model already answered `true`, so
   the correction shows up as two more passes, not as a re-baseline.
2. **Deterministic-parser gaps** listed in the table above (`omit_unit`, `maybe`, `typo`,
   `dont_know`, BN "হুম"). These are W1.4 headroom; the suite reports them per operator so
   improving one shows up immediately.
3. **Model vocabulary drift** (7 value mismatches under `accept`), which is W1.6 training
   signal rather than an eval bug.
4. **Parking-row English retrieval at rank 4**, the weakest authored retrieval.
5. **Coverage probes do not abstain**, which is a product-level gap, not a corpus-count gap.

## What this harness does not cover (declared)

- **`LawDesk` is not wired into `Session`.** The orchestrator's turn loop (W1.10) has no law
  dispatch; `LawDesk` is the seam and a CLI/eval surface only. Wiring it into the interview
  turn is P2 chat-shell work (ADR-0015 §6). Until then the `rag` suite measures the desk, not
  "the app answers a law question in chat".
- **Recorded replies, not a live fleet.** CI cannot start llama-swap, so `model.parse` scores a
  committed reply file. That file is a measurement of one model at one moment; re-recording is
  a deliberate, committed act (`tools/eval/record_baseline.py`), not a CI side effect.
- **60-case holdout sample.** Enough to see a direction and to gate a regression, not enough to
  claim a generalisation number.
- **One rule pack, pack summaries.** The corpus is derived from `rajuk@2008.1`, whose provision
  text is our summary (pinned numbers, not gazette prose). Citation recall says the right
  document was found, not that its wording is the gazette's.
- **No `model.export` / `model.repair` suites yet.** `SUITES` lists what exists; `run_eval.py`
  raises on a suite it does not know, so a future suite cannot be half-wired and silently
  skipped.
- **No cost/latency measurement.** W1.9 v0 measures correctness only.

## How to run

```powershell
# rebuild the case file from committed sources (fails if split.json is missing)
uv run --directory core python ../tools/eval/build_cases.py
# the CI invariant: the committed case file matches its sources
uv run --directory core python ../tools/eval/build_cases.py --check
# score the committed replies against the gates
uv run --directory core python ../tools/eval/run_eval.py
# write the report where a human can read it
uv run --directory core python ../tools/eval/run_eval.py --json data/tmp/eval.json --markdown data/tmp/eval.md
# record a new baseline (starts the S2 fleet if --root is given)
uv run --directory core python ../tools/eval/record_baseline.py --root data/downloads/s2 --name stock
```

Exit code is 0 only when every gate holds. `--no-gates` prints the numbers without failing
(useful while recording a new baseline, never in CI).

## Files and invariants

| File | Owner | Invariant |
|---|---|---|
| `authored.yaml` | human | the only hand-written eval data; validated strictly (unknown keys, mode/lang vocabularies, corpus doc ids) |
| `split.json` | `--init-split` once | frozen by hashed id; a plain build fails without it |
| `cases.jsonl` | `build_cases.py` | 655 cases, byte-stable, `--check`ed in CI |
| `manifest.json` | `build_cases.py` | pins dataset / pack / corpus / split sha256 and the reply files |
| `replies/<model>.jsonl` | `record_baseline.py` | one `{caseId, reply}` per line; sha pinned in the manifest |
| `gates.json` | human | a floor is a reviewed number, not a target |

## Next

W1.6 (chat SFT round 1) trains on the `train` split and is judged on the `holdout` floors
recorded here; W1.7 (repair SFT) adds its own suites; W1.12 re-runs the demo on the fine-tune.
A floor may only move with a recorded reason — quote the measured number, the model and the
commit, and update `gates.json` and this table together.
