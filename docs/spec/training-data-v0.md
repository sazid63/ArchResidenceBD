# Training data pipeline — v0 (W1.5)

**Status:** v0.1.0 — deterministic scripted dataset committed; teacher harness proven against the local 4B through llama-server (2 candidates, 0 deterministic failures); the full teacher batch belongs to W1.6.
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

Output goes to `data/training/teacher-candidates/` (gitignored) as `candidates.jsonl`. Every teacher record is `status: candidate`; the deterministic verifier checks schema/labels/language, but meaning preservation is not machine-provable. Promotion belongs to the W1.6 eval/human gate — there is no auto-promotion path in this pipeline. The full teacher batch (plan §7's ~0.5M-token target) is a W1.6 job; the committed scripted dataset is ~197k tokens.

The batch is **train-side only**. The CLI loads the frozen `data/training/sft-v0/train.jsonl`, filters ask records by source id before calling the teacher, and never paraphrases a holdout question (ADR-0015). The candidate manifest records the source split, train-file sha256, raw/used counts, duplicate paraphrases dropped and verifier failures. The production teacher is the plan §7 local Qwen3-8B Q4 on a standalone llama-server (the 8787 example above is the 4B fleet smoke); the full batch uses 17 variants of the 88 train ask records, aimed at the ~0.5M-token target.

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
  (ADR-0017). The broken macro must fail exactly as declared — an exception type
  (`NameError`, `ValueError`, `KeyError`, `AttributeError`) or a named measured check
  (`objects[Pad_1].volumeM3`, `totals.volumeM3`). The target is the known-good macro, which must
  pass the same case **twice** with identical verdicts and artifact trees.
- The trace is normalised at capture: candidate frames only (basename `candidate.py`, line,
  source), the exception type/message, and a short rendered trace. No temp paths, timings or
  engine strings; a record that leaks a machine path is rejected.
- Shape: `kind: repair`, `task: repair.fix`, `lang: code`, `difficulty: broken`, labels
  `{caseId, errorType, failureCode[, check]}`, exactly system/user/assistant. The user message
  carries the case, params, harness expectations and trace; the assistant message is the full
  corrected macro. Schema v0.2.0 is additive — v0.1.0 chat records stay valid and are not
  rebuilt.
- `manifest.json` pins the case file, the target candidate and the schema by sha256, records the
  FreeCAD version and the counts. A change to any pinned input makes the corpus visibly stale.
- Round 1 is **six mutations** (four exception classes, two measured bugs). It proves the
  pipeline, not the breadth of the CAD failure space; more mutations are a new reviewed corpus.
- The corpus is portable: recorded on FreeCAD 1.1.4 (Windows) and replayed byte-identically on
  FreeCAD 1.1.3 (Ubuntu, conda-forge) on 2026-10-20. The trace normalisation is what makes that
  true; the manifest still records the recording engine.
- Repair records are a separate corpus: they do not join `sft-v0` and never train the chat
  adapter.

## Kaggle preflight (2026-10-20)

The training inputs travel as the private Kaggle dataset `sajidhossain004/archresbd-sft-v0`
(`train.jsonl`, `holdout.jsonl`, `dataset.jsonl`, `cases.jsonl`, `manifest.json`). The committed
CPU kernel `tools/training/kaggle/chat-preflight/` verifies the mount without spending GPU quota:

- **Result:** COMPLETE in 49 s; mount discovered at
  `/kaggle/input/datasets/sajidhossain004/archresbd-sft-v0` (Kaggle now nests dataset mounts;
  both kernels find the folder recursively rather than assuming `/kaggle/input/<slug>`).
- Counts match the manifest: 414 train / 247 holdout / 661 records / 655 eval cases; every one of
  the 60 `model.parse` holdout cases resolves to a prompt record (no missing prompt, no silent
  fallback).
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

## Units

`archres_core.units` is the only conversion home: Decimal-based katha/shotok/bigha/gonda/sqft ⇄ m² and m/ft/inch, with hand-authored English/Bangla unit words. `kani` is deliberately absent until an authoritative factor is pinned — adding a regional guess would violate the provenance rule. The module has its own tests (`core/tests/test_units.py`).

## Verification state (2026-10-19)

- Scripted build: **661 records, all `verified`**; `--check` fresh; 56 training tests green.
- Real teacher smoke: local Qwen3-4B-Instruct-2507 Q4_K_M via llama-server on `127.0.0.1:8790`, `--limit 2 --variants 1` → 2 candidates (bn/en), 0 deterministic failures, both left `candidate`. The server was stopped after the run; candidates are gitignored.
- The teacher prompt is an editor prompt, not the product's JSON-oriented system prompt. A shape gate rejects non-questions (no question mark, more than one question, echoed editor instructions, or JSON/quoted output).

## Deliberately NOT in v0

- **The teacher batch** — the 414-record scripted round is measured; the plan's ~0.5M-token teacher-augmented batch remains a W1.6 job.
- **Masked-token / loss-mask metadata** — the SFT trainer derives it from `messages` roles; no separate format yet.
- **Conversation-level multi-turn samples beyond the override confirmation pair** — v0 records are single-task; longer dialogues come from the orchestrator (W1.10) and its transcript capture.

## Checks

```powershell
uv run --directory core pytest -q                         # suite total is asserted by CI, not hard-coded here
uv run --directory core pytest -q tests/test_training_pipeline.py   # 56 training-specific
uv run --directory core python ../tools/training/build_chat_dataset.py --check
uv run --directory core python ../tools/training/build_sft_split.py --check
uv run --directory core python ../tools/training/build_repair_dataset.py --check
python tools/ci/brand_guard.py
```
