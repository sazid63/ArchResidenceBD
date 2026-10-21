# The rule-pack vectors v0 (W4.6): the guard follows the packs

**Status:** v0.1.0 — every rule pack in the repo is discovered, every pack's test vectors become
cases, and each case is scored against its own pack.
**Code:** `core/src/archres_core/eval/build.py` (`load_pack_set` · `build_rule_cases_for_packs`) ·
`core/src/archres_core/eval/run.py` (`run_rule_suite`) · `core/tests/test_rule_pack_vectors.py`
(6 tests) · **Decision record:** ADR-0055 · **Plan:** §9 (the CI guards — *rule-pack
test vectors*), §5.6 (the law system), §6 (the P4 track: the rule packs for the remaining
cities)

## What it was

The plan's §9 lists the CI guards, and one of them is *"rule-pack test vectors"* — the guard
exists — 49 vectors in the RAJUK pack, scored by the `rule.vector` suite, gated at 1.000 — but it
was **wired to one file**: `spec/rules/rajuk-2008.yaml`, named as a constant in the eval tools.

W4.5 adds the **city packs** (Chattogram, then Khulna/Rajshahi/Sylhet). A pack that arrives
with no vectors is a pack whose numbers nobody checks — and the failure would be **silent**:
the suite would not see the new pack, so the guard would be green for a pack it never looked at.

## What it is now

- **The pack set is discovered** — every pack in `spec/rules/` is loaded — so a city pack lands
  **already gated** ·, with no code change and no second path to forget ··.
- **Every pack's vectors become cases**, and each case is scored against **its own** pack — the
  case names the pack it came from ··. One suite, every pack ··.
- **The case id carries the pack** — the vector ids are the pack's own names ·, and two
  authorities may well use the same one · — so what must be unique is the **(pack, vector)
  pair** ··. A pack carrying the same vector twice is an error — or the gate would count
  one vector twice and call it two ··.
- **A pack with no vectors is an error**, never a silent pass ··.

## The measured output (2026-10-21)

- The committed pack set is one pack — `rajuk@2008.1` — with **49 vectors** ·, all gated ·.
- A **second pack** in the directory brings its own vectors — the test writes one with the same
  vector names and the case set holds both ·· (49 + its own ·).
- A pack with **no vectors** is refused ·, and a pack with the **same vector twice** is
  refused ··.
- The **committed case set** was rebuilt — the 49 rule.vector ids now carry the pack — with the
  **same 715 cases** —, the **same suites** — and the **same splits** ··.

## What is deliberately not here

- **The city packs themselves** — that is W4.5 ·, and it needs the owner's rate-list
  URLs ··. What is here is the machinery that gates them the moment they land ··.
- **The corpus per pack** — the RAG corpus is still one file
  (`spec/rag/rajuk-2008.corpus.jsonl` ·) ·; a city pack's clauses need their own corpus
  ·, and the RAG side is a separate slice ··.
- **The vectors' content** — W4.6 does not add vectors ·; it makes sure that *every* pack's
  vectors are counted ··.

## Checks

```powershell
uv run --directory core pytest -q tests/test_rule_pack_vectors.py   # 6 tests
uv run --directory core python ../tools/eval/build_cases.py --check
uv run --directory core python ../tools/eval/run_eval.py
```
