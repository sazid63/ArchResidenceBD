# P1 exit review — Brain v0

**Date:** 2026-10-20 · **Phase:** P1 (plan §10, Appendix C) · **Verdict:** all twelve W1 packages
closed; two scope items are delivered as *measured null results* rather than capability, and one
trade (the teacher token target) is signed off by the owner as path A.

**Sources of truth:** `docs/work/P1.md` (board) · plan `docs/plan/ArchResidenceBD-Plan-v1.5.md`
(§7 training, §9 quality filter, §10 roadmap, Appendix C) · ADRs 0009–0020 ·
`docs/spec/*-v0.md` · `data/eval/chat-v0/` + `data/eval/repair-v0/` (recorded measurements).

## 1. What the plan asked of P1, and what arrived

Plan §10: *"brain v0 — Chat + Repair training pipeline end-to-end, RAG service, rule engine, spec
engine, advisor/override behavior; first evals."*

| Plan promise | Delivered | Evidence |
|---|---|---|
| Chat training pipeline end-to-end | **Yes.** Scripted corpus 661 verified records → QLoRA on Kaggle (T4) → GGUF → fleet → live BN+EN demo. | `data/training/chat-v0/`, `sft-v0/`, `sft-v1/`; `archie-chat-v0-Q4_K_M.gguf` (2,497,278,880 B, sha256 `bea406a8…a54f73`); `data/eval/chat-v0/replies/finetune.jsonl` (43/60) |
| Repair training pipeline end-to-end | **Pipeline yes, trained member no.** Corpus executed in FreeCAD → split frozen → QLoRA on Kaggle → replies judged *by the engine*. The fine-tune **ties** the stock base model, so no trained model ships. | `data/training/repair-v0/` (16 records), `repair-v1/` (12/4), `data/eval/repair-v0/reports/*.json`, ADR-0017 amendments |
| RAG service | **Yes**, with one declared degradation: 186 cited documents, hybrid retrieval, citations, clause cache; the *model* reranker is degenerate, so lexical reranking is the production reranker. | `spec/rag/rajuk-2008.corpus.jsonl` + manifest (8 pack gaps, 3 sources not ingested, 16 declared-gap docs), `docs/spec/rag-service-v0.md` |
| Rule engine | **Yes.** 49/49 pack vectors, verdicts, deviation register, restore-to-compliant. | `archres_core.compliance`, ADR-0008 |
| Spec engine | **Yes.** Patch/validate/version, revision log, provenance, spec sha256. | `archres_core.spec`, ADR-0007 |
| Advisor / override behaviour | **Yes, in the brain; not yet in the app.** The behavioural curriculum exists as data (12 `rule.explain` + 6 `deviation.override` records), the register is live, and the model is only asked for the *value* it cannot parse. | `data/training/chat-v0/` (byTask), `archres_core.compliance`, ADR-0008/0010 |
| First evals | **Yes, and they are the spine of the phase.** 715 cases, 7 suites, deterministic suites gated at 1.0, model suite gated at the recorded stock baseline. | `data/eval/chat-v0/`, ADR-0015 |
| Chat-loop E2E demo in BN+EN (P1 exit criterion) | **Yes.** 69 coverage / 63 writing turns per language, 61 accept + 2 authored fallbacks, 0 open essentials, exit 0. | `docs/spec/chat-loop-demo-v0.md` (BN 2.125 s, EN 2.068 s, warm 4.922 s) |

## 2. The measured numbers (not the claims)

| Measurement | Value | Where |
|---|---|---|
| `model.parse` — stock baseline | 32/60 = 0.533 | `replies/stock.jsonl` |
| `model.parse` — **selected chat model** `archie-chat-v0` | **43/60 = 0.717** (decision 0.867, value 0.706, bn 0.600, en 0.833) | `replies/finetune.jsonl` |
| `model.parse` — teacher-augmented candidate | 42/60 = 0.700 — fixed no case, broke one → **not selected** | `replies/finetune-v1.jsonl` |
| Eval floors | all pass, **none moved** (floors are the stock baseline) | `data/eval/chat-v0/gates.json` |
| Deterministic suites | rule.vector 49/49, rag 18/18, scenario 2/2, register 3/3 — all 1.000 | `run_eval.py` |
| Chat training data | 661 scripted + 61 reviewed teacher = 722 records in `sft-v1`; **207,558** tokens | `data/training/sft-v1/manifest.json` |
| Teacher review | 111 decisions — **61 accepted / 50 rejected**, every rejection with a reason | `data/training/teacher-review/review.jsonl` |
| Teacher target | **retired** on 2026-10-21 (was 292,442 tokens short of the 0.5M goal) | ADR-0024 · plan v1.6 §7 |
| Repair corpus | 16 executed records (9 engine errors across 9 error types + 7 measured rejections across 8 checks); live replay byte-identical | `data/training/repair-v0/manifest.json` |
| Repair round | 48 steps, loss 0.0024; **stock 3/4 & 3/4, fine-tune 3/4 & 3/4** — a tie → the member stayed stock | `data/eval/repair-v0/reports/` |
| CAD harness | 3/3 cases, identical verdict signatures and artifact trees on re-run | `tools/cad/verify.py --run` |
| Fleet | 4 routes / 2 modes (interview, design) | `tools/serving/fleet.py --check` |
| Fractional areas | `সাড়ে ৫ কাঠা` → 367.9 m² (5.5 katha), **0 model calls** | `docs/spec/question-engine-v0.md` |
| Suite | 812 tests, 149 Python files compile clean, brand guard clean, CI green on `c898354` | CI |

## 3. The plan's §9 filter, applied honestly

**1. Outputs identical?** For everything the phase measures, yes: the CAD harness demands
byte-identical artifacts and identical verdict signatures, the eval harness scores *recorded*
reply bytes pinned by sha256 (a live re-record is a separate, visible step), and the app asks
the model with temperature 0. Where it is not identical, it is declared: the model routes are
not bit-reproducible across hardware, so the *recorded* set is the artefact CI scores.

**2. Coverage complete?** **No — and every gap is declared, not silent:**

| Declared gap | Size | Where it is declared |
|---|---|---|
| Questions the eval does not measure (no parse records) | 20 of 60 | `sft-v0/manifest.json` → `unmeasured` |
| Rule-pack provisions the engine does not evaluate | 8 | pack manifest → `gaps` |
| (Retired, not open: the ~0.5M-token teacher target — ADR-0024, 2026-10-21) | — | `docs/adr/0024-retire-the-teacher-target.md` |
| References not ingested (BNBC core, RAJUK Appendix 5, other cities) | 3 | `spec/rag/rajuk-2008.manifest.json` → `missing` |
| RAG coverage probes (a staircase width, a parapet height, a concrete grade, a lift count) | 4 - **now answered with the pack's declared gap** (ADR-0003, 2026-10-21) | `spec/rules/rajuk-2008.yaml` `gaps[]` |
| Repair corpus breadth | 1 macro, 16 single-line mutations | ADR-0017 amendment |
| `LawDesk` not wired into `Session` | 1 seam | `docs/spec/eval-harness-v0.md` |

(Six open gaps plus one retired target; the teacher row is kept visible so the decision
stays on the record.)

**3. Content human-reviewed?** The rule pack, phase flow book, spec schema, CAD candidate and
every source document are hand-authored and reviewed. Everything derived from execution is
verified by the engine. **The one exception is the 61 accepted teacher paraphrases: they are
agent-reviewed** (the ledger names the reviewer and says so), and a human spot-check is still
owed before `sft-v1` is treated as *the* training set. Nothing shipped depends on them: the
fleet's chat model was trained on the scripted corpus only.

## 4. Two scope items that came back as null results (not capability)

**a. The teacher round did not improve the model.** 61 carefully reviewed paraphrases (10,737
tokens, +5.2 % of the corpus) moved `model.parse` from 43/60 to **42/60**: it fixed no case and
broke one. The reason is structural, not accidental — the W1.9 suite measures *parse* answers,
and ask-paraphrase variety is invisible to it. **There is no ask-phrasing gate**, so the
teacher's value is unmeasurable today. That is the finding, and it is why the owner **retired
the target** (ADR-0024, 2026-10-21) instead of funding another round: the teacher is now a
parked offline tool, and re-entry would need a gate that can see the data.

**b. The repair round did not beat the stock base model.** The 12-record fine-tune repairs 3 of
4 held-out mutations — exactly what the untouched Qwen2.5-Coder-3B-Instruct already does. Both
miss the unit-scale slip; both "repair" the hard-coded pad count by editing the parameter
*default* to the case's value. One macro with sixteen single-line mutations cannot teach a
repair skill. `archie-repair` therefore stays the stock artifact: no GGUF, no registration, no
floor moved. The seam works; the corpus is the limiting factor.

## 5. Trades and decisions that belong to the owner (plan §9)

1. **Teacher token shortfall — closed (retired, 2026-10-21).** The owner chose to retire the
   plan's ~0.5M-token target rather than keep working toward it: the teacher only rephrases the
   88 seed questions, and its one trained round tied the scripted model, so no extra passes
   would have closed the gap or shown a benefit. The teacher is a **parked offline tool**; the
   scripted corpus is the training data; the shortfall is no longer an open gap (ADR-0024).
2. **No trained repair model ships.** Nothing degrades (the stock member stays), but the plan's
   "Repair training pipeline end-to-end" is met as a *pipeline*, not as a shipped model. The
   next step is a corpus of several macros with a holdout of whole scripts — a new reviewed
   corpus under ADR-0017, not a re-run.
3. **The human spot-check of the 61 accepted teacher records.** The gate the plan asked for
   ("human/eval gate") was met by the eval side; the human side is owed. Until then `sft-v1` is
   a candidate dataset, not the training set.
4. **An ask-phrasing eval gate** — without one, no teacher round can ever be shown to help.

## 6. What P2 must not inherit (the traps)

- **"43/60" is not "the chat model is good."** Seventeen of sixty holdout cases still fail and
  the value accuracy is 0.706; every miss is enumerated in the gated report. The app shows a
  low-confidence marker on model-parsed writes for exactly this reason.
- **The teacher data is not in the shipped model.** `archie-chat-v0` was trained on the scripted
  corpus only; `sft-v1` is a candidate dataset.
- **The repair member is the stock 3B coder.** A "repair" is judged by FreeCAD passing the same
  case — never by a text diff, and never by the model's own claim.
- **The RAG reranker in production is lexical.** The model reranker returns all-zero scores and
  is an experimental seam; every live query reports `degraded(rerank:no usable signal)`.
- **The `LawDesk` is not wired into the `Session`** — deliberately, and it is P2 chat-shell work.
- **20 questions, 8 pack provisions and 3 references are unmeasured/un-ingested.** They are
  declared; they must not be counted as covered.
- **The app shell is still the W0.2 prototype.** No P1 data reaches the UI by design — P2 is
  the product phase. The 6 screens exist; none of them shows a real project yet.

## 7. What P1 hands to P2 (the contract)

Frozen and tested, ready to build on: spec engine (patch/validate/revision/provenance) ·
rule engine (verdicts, register, restore) · question engine (chips, deterministic parser,
escalation seam) · flow book (60 questions, BN+EN) · orchestrator + session (snapshot commits,
fenced context, deny-by-default tools) · RAG service (cited corpus, hybrid retrieval, clause
cache) · CAD harness (headless runs, measured geometry, failure traces) · model fleet (4 routes,
2 modes) · eval harness (715 cases, 7 suites, pinned floors) · training pipeline (scripted data
builder, teacher harness, Kaggle kernels for chat and repair) · the app shell and design tokens.

**P2 entry point:** W2.1 (FreeCAD addon + worker pool) needs W0.9 ✓; W2.10 (walking skeleton)
needs W1.12 ✓; W2.6 (BOQ v0) needs the rate-card interface from W0.9 ✓ and the spec engine's
phase pointers ✓. Nothing in P2 is blocked by an open P1 package.
