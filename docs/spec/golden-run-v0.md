# The golden full run (v0) — W6.1

**The promise:** the app's whole flow, on the golden project, end to end, through the channel
the app speaks — and every step checked.

**The tool:** `tools/pilot/golden_run.py` · **the answers:** `tools/pilot/golden-answers.json`
· **the record:** `data/golden/golden-run.json` · **the tests:** `core/tests/test_golden_run.py`
· **the ADR:** `docs/adr/0078-the-golden-full-run-goes-through-the-app.md`

## Why the channel and not a side door

A golden run that took a different path than the product takes proves nothing about the
product. So the run goes through the **bridge** ✓ — the same JSON-per-line channel the
Tauri shell speaks ✓ (ADR-0073 ✓) — with the same methods the screens call ✓:

| step | the method | what it proves |
| --- | --- | --- |
| the project | `project.create` | a project starts from the template ✓ |
| the interview | `session.respond` · `session.use_default` · `session.finish` | the questions are asked and answered ✓ and the close works ✓ |
| the design | `design.run` | the design is built ✓ and its assumptions are visible ✓ |
| the money | `boq.build` | the BOQ is priced ✓ and the card it came from is named ✓ |
| the handover | `bundle.export` | the engineer's bundle is written ✓ |

## The golden answers

Every question the flow book asks has an answer ✓ — a **choice** for a chip question ✓
(`{"choice": "<the option's value>"}` ✓) and **text** for the rest ✓ ✓. The answers describe
the **golden project** ✓ (the Mirpur house ✓ — the same facts as
`spec/examples/two-storey-residential.json` ✓ ✓).

A question with no answer takes its **authored default** ✓ — and the run **counts** them ✓
(printed in the run ✓ and in the record ✓ ✓) ✓, because a default nobody counted is a
default nobody checked ✓ ✓ ✓.

## The five checks

The run **fails** when one of them does not hold ✓ ✓:

1. **the interview lands on the golden project** ✓ — eleven facts the interview owns ✓
   (the plot ✓, the storeys ✓, the units ✓, the heights ✓) are compared with the golden
   example's own ✓ ✓;
2. **the design carries its assumptions** ✓ — every assumption has a statement ✓ and says
   it is to be verified on site ✓ ✓;
3. **the money adds up** ✓ — every priced line is quantity × rate ✓ (to the paisa ✓), the
   phases add to the total ✓, and the **unpriced lines are named** ✓ ✓;
4. **the card says what it is** ✓ — the card's status travels with the money ✓ ✓ (the
   plan's money law ✓ — a fetched number is a **candidate** until a human activates it ✓ ✓);
5. **the handover is written** ✓ — the bundle is on disk ✓ and holds its files ✓ ✓.

## The recorded run (2026-10-22)

- **62 questions** ✓, **0 on their default** ✓;
- the **design**: 2 storeys ✓, 1 typical floor ✓, 9 stages ✓, 3 assumptions ✓ ✓;
- the **money**: 11 lines ✓, **66,374.74 BDT** ✓, priced from `pwd-sor-2022-civil-works` ✓
  (status **candidate** ✓ ✓), 3 lines **named** as unpriced ✓ ✓;
- the **handover**: 64 files ✓ ✓;
- **5 checks, 5 green** ✓ ✓.

**Declared, not implied:** the record's `specSha256` carries the run's own timestamp ✓ — so
a re-run changes that one line ✓ ✓ and nothing else ✓ ✓.
