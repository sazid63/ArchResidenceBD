# Training data pipeline — v0 (W1.5)

**Status:** v0.2.0 — deterministic scripted dataset committed; the plan's Qwen3-8B Q4 and a 4B fallback both ran on 2026-10-20 (1,496 raw calls each; 111 vs 114 unique candidates; 106/105 deterministic-pass; ~18.8k/~18.4k passing tokens); the 8B pool was reviewed record by record (61 accepted / 50 rejected) and the accepted subset is the committed `sft-v1` split (722 records, 207,558 tokens); the ~0.5M-token target is **292,442 tokens short — a declared gap**, not a silent omission. The teacher-augmented v1 round was then trained and measured (42/60 model.parse, all floors pass) and **not selected**: it broke one case the scripted round passed, so `archie-chat-v0` (43/60) stays in the fleet. No teacher record is auto-promoted.
**Code:** `core/src/archres_core/training/{records,prompts,mutations,generators,verify,teacher}.py` · CLI `tools/training/build_chat_dataset.py`, `tools/training/teacher_augment.py`.
**Schema:** `spec/schemas/sft-record.schema.json` (v0.1.0).
**Decision record:** **ADR-0009**.
**Plan:** §7 (scripted generation + teacher augmentation, sloppy-input class) · §2.2 (scripts first, AI last-mile) · §9 (quality law).

## What it is

The deterministic half of the chat training pipeline. It builds **661 verified records** from frozen artifacts — never from model output:

| Task | Records | Source |
|---|---|---|
| `interview.ask` | 120 | one per flow-book question per language; the assistant text is the hand-authored question |
| `interview.parse` | 523 | clean answers from the example Building Specs + the sloppy-input class |
| `rule.explain` | 12 | a live rule-engine run (6 verdicts × 2 languages) |
| `deviation.override` | 6 | the same run's 3 deviations × 2 languages, with the engine's register entry |

The committed dataset is `data/training/chat-v0/`:

```text
dataset.jsonl   661 canonical records (sorted by task/id), ~1.4 MB
sample.jsonl    the 17-record golden review slice
manifest.json   versions, artifact pins, counts, coverage, per-file sha256/bytes
```

`dataset.jsonl` is generated, not hand-edited. Any change to the flow book, rule pack, example specs or SFT schema changes the pins and requires a rebuild; CI runs `--check`.

### Coverage (declared, never silent)

- **Ask:** 60/60 flow-book questions, both languages.
- **Parse:** 40/60 questions. The 20 without scripted parse records are listed in `manifest.coverage.questionsWithoutParse` (optional, conditional or file questions whose values are absent from the example specs — e.g. `plot-depth`, `plinth-height`). W1.6 expands this set; the manifest makes the gap reviewable today.
- **Narration:** 6 verdicts from the three implemented rule families (3 compliant, 3 deviations) — exactly the rule-engine v0 coverage, with its 8 pack gaps surfaced by the engine, not hidden by the dataset.

## Build & check

```powershell
uv run --directory core python ../tools/training/build_chat_dataset.py
uv run --directory core python ../tools/training/build_chat_dataset.py --check   # CI
uv run --directory core pytest -q -k training
```

The CLI never touches the network and never writes outside `data/training/chat-v0/`.

## Verification law

Every record must pass the checks in `verify.py`; the builder refuses to emit a dataset when any record fails:

| Check | Ground truth |
|---|---|
| `schema` | `sft-record.schema.json`; schema failures are returned, never raised out of the verifier |
| `labels` | flow-book question, pointer/phase binding, option ids, fallback kind |
| `language` | see policy below |
| `ask.text` | scripted ask records must be the exact hand-authored question; teacher paraphrases are exempt |
| `parse.clean` | label value/unit equals the generator's canonical base |
| `parse.mutation` | the sloppy text is **re-derived** from the operator + seed; the decision/value must match the operator's contract |
| `numbers` | every number in an explain/override answer appears in the engine facts; `allowedNumbers` is computed from facts, never from the answer |
| `citations` | citation keys resolve against the pinned pack and appear in the answer |
| `register` | the override's register JSON equals the engine's `register_ops` entry (same id, rule, expected/actual, risk tier) |

A record has `status: verified` only after this gate. Teacher output stays `candidate` (below).

## Language policy

`lang` is the conversation language (`bn`, `en`, or `mixed`); it is not a script detector.

- **`bn`/`en` narration** (ask, explain, override) is checked on the assistant's answer.
- **`interview.parse`** is checked on the user's turn: a Bangla conversation may legitimately contain an English proper noun ("Green View"), and the JSON reply itself need not contain Bengali script.
- **Bengali digits** (`০–৯`) are treated as numerals, not as a language switch — a realistic Bangla-numeral answer in English is still `en`.
- **`mixed`** requires both Bengali and Latin letters somewhere in the checked text.

## Sloppy-input class

The plan requires Banglish, typos, unit confusion, "don't know" and off-topic answers to trigger defaults or clarification — **never stall**. The dataset exercises 15 operators, pinned in tests:

`bangla_digits` · `banglish` (romanised 1–10 / ha–na) · `unit_alt` (katha/shotok/bigha, ft, sqft, exhaustive per display unit) · `typo` · `omit_unit` · `absurd` · `affirm_sloppy` · `maybe` · `partial` · `typo_label` · `unknown_choice` · `as_given` · `whitespace` · `dont_know` · `off_topic`.

Each operator is seeded and reproducible; `parse.mutation` re-runs it and compares the text and expected decision/value. The dataset contains 381 sloppy records (175 accept, 58 `ask_again`, 68 `fallback`, 80 `escalate`).

## Teacher augmentation

`teacher.py` speaks the OpenAI-compatible `/v1/chat/completions` endpoint exposed by llama-server (stdlib only). v0 rephrases **questions only**; it can never change a label or a fact. The CLI:

```powershell
uv run --directory core python ../tools/training/teacher_augment.py \
  --endpoint http://127.0.0.1:8787/v1/chat/completions --model chat --variants 1
```

Output goes to `data/training/teacher-candidates/` (gitignored) as `candidates.jsonl`. Every teacher record is `status: candidate`; the deterministic verifier checks schema/labels/language, but meaning preservation is not machine-provable. Promotion belongs to the W1.6 eval/human gate — there is no auto-promotion path in this pipeline. The reviewed 8B subset is the exception in provenance, not in the law: each accepted record carries an `input.review` block and `review.meaning` in `verifyChecks`, and the model built from it is still candidate-only (ADR-0020). The full teacher batch (plan §7's ~0.5M-token target) remains short; the committed scripted dataset is ~197k tokens and the reviewed teacher subset adds ~10.7k.

The batch is **train-side only**. The CLI loads the frozen `data/training/sft-v0/train.jsonl`, filters ask records by source id before calling the teacher, and never paraphrases a holdout question (ADR-0015). The candidate manifest records the source split, train-file sha256, raw/used counts, duplicate paraphrases dropped and verifier failures. The plan §7 local teacher is **Qwen3-8B Q4** (~5 GB), not an 8B-2507 variant; the Qwen3-2507 family has no 8B release. The on-disk public hybrid `Qwen3-8B-GGUF` is that model. Its default thinking block spends the completion budget and fails the one-question gate; the client's `--no-think` switch appends `/no_think`, and a 2-record smoke with `--max-tokens 160` passed. The 4B batch remains the fallback evidence from before that switch was exercised; candidates stay candidate-only and W1.6 stays open for the human/eval promotion gate. The client default cap is 96 tokens; `--max-tokens` raises it for long Bangla questions (the 4B batch measured seven truncations at 96). A first-line stop was removed because this template can return empty content after a leading newline. `/no_think` is opt-in for hybrid teachers only (`--no-think`), not used for the 2507 teacher. The full batch uses 17 variants of the 88 train ask records, aimed at the ~0.5M-token target. The first uncapped hybrid smoke generated 213+ tokens for one one-line question, so the cap is a measured correction, not a cosmetic one.

The 8B batch uses prompt **v0.3**. The earlier prompt let the 8B copy
`chat-ask-floor-ground-floor-height-bn` verbatim, which aborted the whole run after two
attempts. The instruction now demands a completely different sentence structure and at
least three changed words; each copied question is retried four times with temperature
escalation (0.7 → 1.0). If it still repeats, the CLI records `source_id#vN` in
`manifest.skipped` and continues. A skipped variant is a declared coverage gap, never a
silent omission, and the exit code is non-zero.

### 4B fallback batch result (2026-10-20)

The train-only fallback batch completed: **1,496 raw calls** (88 train ask records × 17
variants) → **114 unique candidates** after deterministic dedupe (1,382 duplicates
dropped). **105 passed** the deterministic verifier; **9 failed** (7 are cut mid-sentence
with no question mark at the 96-token completion cap, 2 echo the editor prompt). The
passing pool is 58 BN + 47 EN, covers all 88 source questions, but only 26 questions have
a second distinct paraphrase. Estimated size: **~18.4k passing tokens** (chars ÷ 4), far
below the ~0.5M target. The audit file retains all 114 records; only the 105 passing
records are promotion-eligible, and a promotion step must re-run the verifier.

The review sample is **not promotion-ready**. EN paraphrases are mostly faithful; the BN
sample contains meaning drift and typo-level errors — `খুব কাছে` → `খুব স্বাপ্ত`,
`প্রতিটি বেডরুমে` → `প্রতিটি ঘরে`, `কোন বিভাগে` → `কোন অঞ্চলে`, `পানির ট্যাংক` →
`জলের বাটি`, and `সামনের দিক` → `আগের দিক`. These are exactly the human-gate failures the
candidate status exists for. The 96-token cap is also too low for long Bangla questions;
a 4B rerun must raise it and retry shape failures before its yield is comparable. No
candidate was promoted. W1.6 stayed open for the plan's **Qwen3-8B Q4** teacher (the
on-disk hybrid, run with `--no-think`); that run is recorded below.

### 8B batch result (2026-10-20)

The plan's Qwen3-8B Q4 teacher ran the same full batch with `/no_think`, prompt v0.3
and a 160-token cap: **1,496 raw calls** (88 × 17) → **111 unique candidates** (1,385
duplicates dropped), **106 deterministic-pass / 5 failures**, 59 BN + 52 EN, all 88
source questions covered. Only 23 questions have a second distinct paraphrase; the
other 65 have one. Estimated size: **~18.8k passing tokens** (chars ÷ 4). No variant was
skipped; the `ground-floor-height-bn` question that aborted the earlier run now
paraphrases faithfully.

The five failures are mostly gate artefacts, not bad paraphrases: two (`adjacent-close-bn`,
`material-prices-bn`) echo the `প্রশ্ন:` label before a paraphrase; the label itself is the
shape failure. Two
(`soil-report-file` BN/EN) are correct imperative paraphrases of a source that is an
attach-file instruction, not a question, so the one-question-mark gate rejects them; one
(`typical-floor-height-bn`) emitted the original plus a second question. The human gate
must review the accepted subset; none was promoted.

The 8B did **not** solve the yield problem: 111 unique candidates versus 114 for the 4B,
and ~18.8k versus ~18.4k passing tokens. Seed-only variants collapse to at most two
distinct paraphrases per question, so the ~0.5M-token target cannot be reached by adding
seeds alone. Quality is better than the 4B overall but still mixed — for example
`ছাদে পানির ট্যাংক থাকবে?` → `কীভাবে ছাদ থেকে পানি সঞ্চয় করা হয়?` changes a yes/no
question into a method question, and `পাইলের ধরন` → `পাইলের বিধ` is a typo.

### Review result and `sft-v1` (2026-10-20)

The owner selected **path A**: review the 8B pool, accept only faithful paraphrases, record the
shortfall, and cover the measured fractional-area case. The review is committed, one decision per
candidate, in `data/training/teacher-review/`:

- `review.jsonl` — **111 decisions: 61 accept / 50 reject**, each pinned by the candidate text
  sha256; every rejection has a reason. Rejections include question-type changes
  (`Are neighbouring buildings close?` → `How close?`), scope changes
  (`প্রতিটি বেডরুমে` → `প্রতিটি ঘরে`), option changes (wide gate → wide door), typos
  (`পাইলের বিধ`), and garbled/gate-artefact output. Two faithful `soil-report-file`
  imperative paraphrases are rejected only because the ask shape gate requires a question;
  that is declared, not hidden.
- `accepted.jsonl` — the **61 accepted records**, `status: verified`, with
  `review.meaning` in `verifyChecks` and an `input.review` block. One BN record had an echoed
  `প্রশ্ন:` label removed as a declared normalization; the raw text is still pinned in the
  ledger.
- `manifest.json` — pins the raw candidate file/manifest, the ledger, and the accepted file.

The review is **agent-assisted** and says so in the ledger (`reviewer`) and in the manifest; the
owner chose path A, not each individual paraphrase. A **human spot-check of the 61 accepted
records is still owed** before `sft-v1` is treated as *the* training set. Nothing depends on that
yet: the shipped chat model is the scripted `archie-chat-v0`, which contains no teacher text.

`tools/training/build_teacher_review.py` applies the ledger and re-runs the deterministic
verifier on every accepted record; `--check` reproduces the committed bytes. The raw candidate
file stays gitignored. `tools/training/build_sft_teacher.py` then builds
`data/training/sft-v1/`:

| Split | Records | Notes |
|---|---:|---|
| train | 475 | 414 scripted + 61 reviewed teacher paraphrases |
| holdout | 247 | byte-identical to `sft-v0`; no teacher paraphrase crosses the line |
| total | 722 | 661 scripted + 61 reviewed |

`counts.questions` in the v1 manifest counts the **distinct question ids represented in that
side's records** (44 train / 16 holdout). The frozen split's *measured* question lists are
24 train / 16 holdout (`sft-v0/manifest.json`), and the 20 questions the eval does not measure
stay on the train side as declared there.

Token accounting uses chars ÷ 4 over full message text, the plan §7 estimate: **196,821
scripted + 10,737 teacher = 207,558 total**, against the 500,000 target. The manifest declares
**shortfall: 292,442**. More teacher passes over the same 88 seed questions are not a credible
fix; reaching the target needs new prompt styles, longer explain/parse records, or a new
corpus.

### Fractional coverage belongs to the parser

The 8B teacher rephrases questions; it cannot fix an arithmetic misread. The live probe's
`সাড়ে ৫ কাঠা` → 5.0 failure is therefore covered at the deterministic layer (ADR-0020): the
parser expands `সাড়ে`/`পৌনে`/`সোয়া`/`দেড়`/`আড়াই` and English “N and a half” to decimals
before unit conversion, and still escalates a fraction with no resolvable base. The model path
remains the fallback and stays gated; no SFT record claims to fix the arithmetic.

## SFT split (W1.6 preparation)

`data/training/sft-v0/` is the training-side mirror of the frozen eval split. It is derived, not
re-drawn:

```powershell
uv run --directory core python ../tools/training/build_sft_split.py
uv run --directory core python ../tools/training/build_sft_split.py --check
```

- `holdout.jsonl` — verified chat records whose **source question id** is an eval holdout
  question (from `data/eval/chat-v0/split.json`). It is never trained on; the file exists so the
  W1.6 evaluation can compare like with like without re-reading the eval set.
- `train.jsonl` — every other verified record, including the explain/override records, which
  carry no interview question (`rule.explain`, `deviation.override`) and cannot contaminate a
  question-level holdout.
- `manifest.json` — pins the dataset and split by sha256, records counts per side/task, and
  **declares the questions the eval does not measure** (`unmeasured`). Those questions go to
  train because no holdout contains them; dropping them would shrink training for no
  protection, and hiding them would be a silent coverage gap.
- The splitter refuses unverified records, non-chat records, duplicate ids, a parse record with
  no source question, and a split with an empty side or an overlapping question. A question the
  eval does measure but the splitter cannot place cannot exist by construction: holdout is a
  forbidden list, not a whitelist.

The files are canonical JSONL (UTF-8, LF, sorted, compact) and CI checks freshness. Moving a
question across the line is an edit to the frozen eval split — a reviewed event (ADR-0015) —
never a re-run of this tool.

## Repair corpus (W1.7)

`data/training/repair-v0/` is Archie-Repair's substrate: code + a real execution failure →
the known-good code. It is generated, never authored:

```powershell
# write (needs FreeCAD)
uv run --directory core python ../tools/training/build_repair_dataset.py --engine "<freecadcmd>"
# offline check (CI, every push)
uv run --directory core python ../tools/training/build_repair_dataset.py --check
# live replay (weekly cad job / dev machine): re-executes and demands byte-identical traces
uv run --directory core python ../tools/training/build_repair_dataset.py --check --engine "<freecadcmd>"
```

- Each record is one deterministic mutation of `tools/cad/candidates/geometry_build.py`
  (ADR-0017). The broken macro must fail exactly as declared — an exception type or a named
  measured check. The target is the known-good macro, which must pass the same case **twice**
  with identical verdicts and artifact trees.
- **The corpus grew on 2026-10-20 from six records to sixteen** (ADR-0017 amendment): nine
  exception records across nine error types (`NameError`, `ValueError`, `KeyError`,
  `AttributeError`, `TypeError`, `IndexError`, `ZeroDivisionError`, `RuntimeError`,
  `FileExistsError`) and seven measured rejections across eight distinct checks
  (`objects[Pad_1].volumeM3`, `totals.volumeM3`, `totals.objects`, `documentObjects`,
  `objects[Pad_1].bboxMm[2]`, `artifacts[foundation-summary.json]`, …). The generator is
  `build_repair_dataset-0.2.0`; the prompt contract and the schema are unchanged. One candidate
  mutation (dropping `removeSplitter()`) left the measurement unchanged and was **dropped, not
  declared** — a bug the harness cannot see is not a training record.
- The trace is normalised at capture: candidate frames only (basename `candidate.py`, line,
  source), the exception type/message, and a short rendered trace. No temp paths, timings or
  engine strings. A machine path inside an exception message is now **redacted to `<path>`** at
  capture time (the `FileExistsError` case exposed that gap); the raw message stays in the
  workdir as evidence, and the offline check still refuses any record that leaks a path.
- Shape: `kind: repair`, `task: repair.fix`, `lang: code`, `difficulty: broken`, labels
  `{caseId, errorType, failureCode[, check]}`, exactly system/user/assistant. The user message
  carries the case, params, harness expectations and trace; the assistant message is the full
  corrected macro. Schema v0.2.0 is additive — v0.1.0 chat records stay valid and are not
  rebuilt.
- `manifest.json` pins the case file, the target candidate and the schema by sha256, records the
  FreeCAD version and the counts. A change to any pinned input makes the corpus visibly stale.
- The corpus is portable: recorded on FreeCAD 1.1.4 (Windows) and replayed byte-identically on
  FreeCAD 1.1.3 (Ubuntu, conda-forge) on 2026-10-20. The trace normalisation is what makes that
  true; the manifest still records the recording engine. The 16-record corpus was re-executed
  byte-identically on FreeCAD 1.1.4 (Windows) on 2026-10-20 (`--check --engine`).
- Repair records are a separate corpus: they do not join `sft-v0` and never train the chat
  adapter.

## Repair SFT round 1 (W1.7)

- **Split:** `data/training/repair-v1/` — the 16-record corpus cut by a **frozen** holdout of
  four mutation ids (`float-arity`, `volume-divide-zero`, `column-unit-slip`, `pads-hard-coded`):
  12 train, 4 judged. The holdout is a constant in `tools/training/build_repair_split.py`, pinned
  by sha256 in the manifest; moving a mutation across that line is a reviewed edit, never a
  re-run (ADR-0015 law).
- **Kernel:** `tools/training/kaggle/repair/` — QLoRA on **Qwen2.5-Coder-3B-Instruct** (the family
  the `archie-repair` placeholder already points at), max length 5120 (a repair record is ~3.4k
  tokens), 3 epochs, seed 20261020, one visible GPU. The run answers the four held-out prompts
  twice: once with the untouched base model — the **stock baseline floor**, same quantisation,
  greedy — and once with the adapter. Both reply sets are recorded.
- **Judge:** `tools/training/eval_repair.py` — a repair is right only if the repaired macro
  **passes the same case**. The tool writes each returned macro to disk, runs it through the W1.8
  harness (FreeCAD) and reports three measures: `passesOwnCase` (the gate), `noCollateral` (the
  same macro must still pass the *other* foundation cases) and `identicalToTarget` (byte-identical
  to the known-good macro). The floor is the stock model's measured rate on the same prompts
  (`data/eval/repair-v0/gates.json`); a fine-tune below the floor fails, exactly like the chat
  round. The judge has a self-test (`--self-test`): the known-good macro must pass every holdout
  case and the broken macro must fail its own, or the judge measures nothing.
- **What this round can and cannot show.** The corpus is **one** candidate macro with sixteen
  single-line mutations, so a model that learned the corpus can restore that macro for an unseen
  mutation of it. That is the seam the round measures — *can the model turn a failed macro plus
  its trace into a macro the engine accepts?* — and it is **not** a claim that the model repairs
  arbitrary CAD scripts. A broader claim needs a corpus of several macros with a holdout of whole
  scripts, which is the next corpus decision, not this round.

### Measured result (2026-10-20)

| Model | passes own case | no collateral | identical to target | Outcome |
|---|---:|---:|---:|---|
| stock Qwen2.5-Coder-3B-Instruct (4-bit, greedy) | **3/4 = 0.75** | 3/4 = 0.75 | 0/4 | the floor |
| repair SFT round 1 (12 records, 48 steps, loss 0.0024) | **3/4 = 0.75** | 3/4 = 0.75 | 1/4 | **tie — not selected** |

- **Run:** Kaggle kernel `archresidencebd-repair-sft-v1` v3 (Tesla T4, Qwen2.5-Coder-3B-Instruct,
  4-bit QLoRA, r16, 4 epochs / 48 steps, max length 5120, seed 20261020, bf16): 12 train
  records, 0 skipped, mean 3,057 tokens, loss **0.00242**; stock repairs 289.1 s, fine-tuned
  repairs 741.2 s, 2,933 s in total. The first run (v2) died before training because pip had
  installed **transformers 5.20.2**, whose `TrainingArguments` dropped `warmup_ratio`; the kernel
  now pins the 4.x line (`transformers>=4.51,<5`) like the chat round, and an effective batch of 8
  would have given four optimizer steps on a 12-record corpus, so the batch is 1 (48 steps).
- **Judged by the engine:** `data/eval/repair-v0/reports/{stock,finetune}.json`; the reply sets
  are committed and pinned, and the judge's `--self-test` proves it separates the known-good macro
  from a broken one.
- **The fine-tune ties the stock model, so nothing was swapped.** Both models repair the three
  easy mutations and **both miss the unit-scale slip** (a millimetre column scaled to metres:
  `col_x, col_y, col_z = [value * 0.001 ...]`). Both also "repair" the hard-coded pad count by
  editing the parameter *default* to the case's value rather than restoring the parameter read —
  the case passes because the case sets the parameter explicitly, but the macro is not the
  known-good one. A trained member that only ties the placeholder is not an improvement, so
  `archie-repair` stays the stock artifact and the adapter is not registered, converted or
  shipped. The floor did not move.
- **What the round proves:** the seam works end to end — a failed macro plus its normalised trace
  goes into a model, and the model's macro is judged by FreeCAD, not by a text diff. **What it
  does not prove:** that a 12-record corpus teaches repair. The next corpus decision is more
  macros with a holdout of whole scripts; until then the trained member stays a candidate.


## Kaggle preflight (2026-10-20)

The training inputs travel as the private Kaggle dataset `sajidhossain004/archresbd-sft-v1`
(`train.jsonl`, `holdout.jsonl`, `dataset.jsonl`, `cases.jsonl`, `manifest.json`). The v0 dataset
and its preflight remain the historical record; v1 is the reviewed teacher-augmented split. The
committed CPU kernel `tools/training/kaggle/chat-preflight/` verifies a mount without spending
GPU quota:

- **Result:** COMPLETE in 49 s; mount discovered at
  `/kaggle/input/datasets/sajidhossain004/archresbd-sft-v0` (Kaggle now nests dataset mounts;
  both kernels find the folder recursively rather than assuming `/kaggle/input/<slug>`).
- Counts match the manifest: 414 train / 247 holdout / 661 records / 655 eval cases; every one of
  the 60 `model.parse` holdout cases resolves to a prompt record (no missing prompt, no silent
  fallback).
- **v1 upload (2026-10-20):** the private dataset `sajidhossain004/archresbd-sft-v1` has the five
  files and 3,371,397 bytes; the chat kernel re-checks 475 train / 247 holdout / 722 total and
  every pinned sha256 before training. The v1 manifest records 61 reviewed teacher records and
  the declared 292,442-token shortfall.
- The chat template is prefix-stable and the assistant span survives masking (2 sample records,
  385 prefix tokens masked); `transformers` 4.57.6 on the Kaggle image.
- The GPU training kernel (`tools/training/kaggle/chat/`, ADR-0018) is no longer queued: after the
  owner's stop authorization the 27B server moved to `CANCEL_ACKNOWLEDGED` at 09:44, leaving
  21.95 h of GPU quota. The block is closed in `docs/work/OWNER-ATTENTION.md` #4.
- **First two GPU attempts (2026-10-20):** v1 failed in the stock
  `DataCollatorForLanguageModeling` because it pads `input_ids` but not `labels`; the explicit
  `CausalLMCollator` now pads ids/labels/attention together and asserts per-record id/label
  alignment (`3a9cb2f`, five kernel tests). v2 then exposed Kaggle's two T4 GPUs: Trainer wrapped
  the single-device `device_map={"": 0}` model in `DataParallel` and the second replica failed;
  the kernel pins `CUDA_VISIBLE_DEVICES=0` before importing torch (`9e6a209`). A follow-up forces
  the value even when Kaggle pre-sets `0,1` and refuses a multi-GPU Trainer (`9ff1b57`, three new
  kernel tests). **v3 COMPLETE**; the measured candidate is recorded below.

## Chat SFT round 1 candidate (2026-10-20)

- **v3 run:** Kaggle T4, Qwen3-4B-Instruct-2507, 2 epochs / 104 steps / 414 train records,
  max length 2048, seed 20261020, bf16. `train-summary.json` records loss **0.21749**, 60 replies
  in 303.9 s, total 4,493.5 s; the adapter is 132,187,888 bytes. The run used the `9e6a209`
  kernel; the forced-pin hardening (`9ff1b57`) is for any future run.
- **Reply set:** `data/eval/chat-v0/replies/finetune.jsonl`, 60 lines / 60 unique `model.parse`
  case ids / no missing or extra ids; sha256
  `b970f0904cca89d8f6315c362a2515713e79e42272b91032cb3e4209d240dbb0`, pinned in the eval
  manifest. The gated command is the one in `docs/spec/eval-harness-v0.md`; it exits 0.
- **Measured:** `model.parse` **43/60 = 0.7167** vs stock 32/60 = 0.5333. Gates: decision
  **0.867** (floor 0.650), value **0.706** (0.500), `accuracy:bn` **0.600** (0.5667),
  `accuracy:en` **0.833** (0.500). All four floors pass; **none was moved**. Seventeen
  `model.parse` misses remain and are enumerated by the reproducible gated report; no 1.0 claim.
- **GGUF:** the Kaggle build step failed with `ImportError: incompatible torchao 0.10.0`
  (requires >0.16.0); this is a packaging error, not a training result. The CPU converter
  (`tools/training/convert_gguf.py`, no torchao) built the artifact locally:
  `data/downloads/s2/models/archie-chat-v0-Q4_K_M.gguf`, **2,497,278,880 bytes**, SHA-256
  `bea406a8bafb47c076f4bc2b61ed481cd88c3eff094171af6046a2aad2a54f73`, Q4_K_M. The first
  conversion hit a relative-path bug in the converter; it is fixed and covered by
  `core/tests/test_convert_gguf.py` (`6b44ee0`).
- **Fleet:** `spec/models/registry.json` replaces the stock `archie-chat` entry with
  `archie-chat-v0`; `tools/serving/fleet.py --check` reports **4 routes / 2 modes**;
  `llama-swap -validate` reports **4 models**. The stock artifact stays on disk for rollback.
  Live BN+EN fine-tune demos completed in 2.389 s / 1.991 s with 61 accept + 2 fallback and
  0 open essentials; `preload("interview")` warmed in 4.9 s. The forced fractional-area probe
  (`সাড়ে ৫ কাঠা`) returned **5.0 katha instead of 5.5** and was accepted at `confidence: low`;
  the deterministic parser now escalates fractional quantifiers (W1.4 guard + regression test)
  rather than silently truncating. The teacher batch must cover this case.
- **Local fallback:** the RTX 4050 run was stopped after **28/104 steps in 2h51m**
  (~360-420 s/step, projected >7h remaining) and produced no adapter/replies. The 6 GB local
  floor is a smoke venue, not a viable full-run venue for this configuration; Kaggle is the
  selected candidate. No local result is claimed.
- **Scope:** this is the **414-record scripted round** (~197k tokens). The plan's ~0.5M-token
  teacher-augmented batch remains a W1.6 job and is not silently dropped; the fractional-area
  miss above is a measured example of what it must fix. **W1.6 is not ticked** by this candidate.

## Teacher-augmented v1 round (2026-10-20)

The reviewed teacher subset was trained as a **second** candidate round. It is a separate
measurement, not a replacement: the scripted round stays the selected model unless the new one
measures better.

- **Run:** Kaggle kernel `sajidhossain004/archresidencebd-chat-sft-v1` on the private dataset
  `sajidhossain004/archresbd-sft-v1`; Qwen3-4B-Instruct-2507, 2 epochs / **120 steps** / 475
  train records, max length 2048, seed 20261020, bf16, Tesla T4. `train-summary.json`:
  loss **0.23197**, 60 replies in 298.0 s, 5,176.3 s total; 0 records skipped, mean 314.5
  tokens, max 962. The GGUF step failed again with the known `torchao 0.10.0` packaging error —
  a packaging error, not a training result, and no artifact was needed because this candidate
  was not selected.
- **Reply set:** `data/eval/chat-v0/replies/finetune-v1.jsonl` (60 lines, 60 unique case ids),
  sha256 `34beaa1a…d7942`, now **pinned in the eval manifest** so CI re-scores the same bytes.
- **Measured:** `model.parse` **42/60 = 0.700** — decision **0.867** (floor 0.650), value
  **0.676** (0.500), `accuracy:bn` **0.600** (0.5667), `accuracy:en` **0.800** (0.500). All four
  floors pass and **none was moved**.
- **Outcome: not selected.** Compared case by case with the scripted round, the teacher round
  fixed **no** case and **broke exactly one**
  (`model.parse:chat-parse-gas-source-slp-typo-label-en`): 43/60 → 42/60. Adding 61 reviewed
  question paraphrases (10,737 tokens, 5.2 % of the v1 corpus) did not improve parse accuracy, and
  the W1.9 suite does not measure ask phrasing at all. `archie-chat-v0` therefore stays in the
  fleet; the v1 adapter is not registered, not converted to GGUF and not shipped. The run is
  reproducible from the pinned dataset plus the committed kernel, so the adapter is not
  committed either.
- **What this says about the data, honestly:** the reviewed subset is *usable* (it trains, it
  passes every floor) but not *useful* on the measured suite. Ask-paraphrase variety is not
  what the gated suite measures, and the suite is the only thing that can say "useful". A
  future teacher round must therefore either (a) add a gated ask-phrasing suite, or (b) target
  parse/explain records where the suite can see the gain.

## Units

`archres_core.units` is the only conversion home: Decimal-based katha/shotok/bigha/gonda/sqft ⇄ m² and m/ft/inch, with hand-authored English/Bangla unit words. `kani` is deliberately absent until an authoritative factor is pinned — adding a regional guess would violate the provenance rule. The module has its own tests (`core/tests/test_units.py`).

## Verification state (2026-10-19, updated 2026-10-20)

- Scripted build: **661 records, all `verified`**; `--check` fresh; 56 training tests green.
- Real teacher smoke: local Qwen3-4B-Instruct-2507 Q4_K_M via llama-server on `127.0.0.1:8790`, `--limit 2 --variants 1` → 2 candidates (bn/en), 0 deterministic failures, both left `candidate`. The server was stopped after the run; candidates are gitignored.
- Full 4B fallback batch (2026-10-20): 1,496 raw calls → 114 unique candidates (1,382 duplicates), 105 deterministic-pass / 9 failures, 58 BN + 47 EN, ~18.4k passing tokens (chars ÷ 4); no candidate promoted. Seven failures are cut mid-sentence at the 96-token cap and two echo the editor prompt. The BN review sample shows meaning drift, so the 4B fallback is not accepted as the plan's 8B teacher.
- Full Qwen3-8B Q4 batch (2026-10-20): 1,496 raw calls → 111 unique candidates (1,385 duplicates), 106 deterministic-pass / 5 failures, 59 BN + 52 EN, ~18.8k passing tokens (chars ÷ 4); no variant skipped and no candidate promoted. Two failures echo the editor label, two are `soil-report-file` imperatives rejected by the question-mark gate, and one emitted two questions. Quality is better than the 4B but still mixed; the ~0.5M-token target is unmet.
- Review (2026-10-20): **61 accepted / 50 rejected** with a committed one-line-per-candidate ledger; the accepted 61 are in `sft-v1` (475 train / 247 holdout / 722 total). Token total **207,558**, shortfall **292,442** declared in `sft-v1/manifest.json`. No teacher record was auto-promoted; the teacher-augmented model stays candidate-only until the W1.9 gate and live probe.
- Fractional coverage (2026-10-20): the parser expands `সাড়ে`/`পৌনে`/`সোয়া`/`দেড়`/`আড়াই` and English “N and a half” to decimals before unit conversion; `সাড়ে ৫ কাঠা` now yields 5.5 katha deterministically, and a base-less fraction still escalates. This is the parser's fix, not a teacher/SFT claim.
- The teacher prompt is an editor prompt, not the product's JSON-oriented system prompt. A shape gate rejects non-questions (no question mark, more than one question, echoed editor instructions, or JSON/quoted output).

## Deliberately NOT in v0

- **A full ~0.5M-token teacher batch** — the reviewed 8B subset is accepted (61 records), but the total is 207,558 tokens; the 292,442 shortfall is declared. The 4B fallback remains archived and rejected.
- **Teacher augmentation of parse/explain records** — round 1 rephrases interview questions only; longer record types are the next corpus decision (ADR-0020).
- **Masked-token / loss-mask metadata** — the SFT trainer derives it from `messages` roles; no separate format yet.
- **Conversation-level multi-turn samples beyond the override confirmation pair** — v0 records are single-task; longer dialogues come from the orchestrator (W1.10) and its transcript capture.

## Checks

```powershell
uv run --directory core pytest -q                         # suite total is asserted by CI, not hard-coded here
uv run --directory core pytest -q tests/test_training_pipeline.py   # 56 training-specific
uv run --directory core python ../tools/training/build_chat_dataset.py --check
uv run --directory core python ../tools/training/build_sft_split.py --check
uv run --directory core python ../tools/training/build_teacher_review.py --check   # needs raw candidates
uv run --directory core python ../tools/training/build_sft_teacher.py --check
uv run --directory core python ../tools/training/build_repair_dataset.py --check
python tools/ci/brand_guard.py
```
