# ADR-0055 — The rule-pack vectors follow the packs: the pack set is discovered, not wired

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W4.6 (the rule-pack vectors
+ CI) · **Plan:** §9 (*rule-pack test vectors* in CI ·), §5.6 (the law system) ·
§6 (the P4 track: *rule packs for remaining cities*) · **Related:** ADR-0015 (the eval
harness), ADR-0003 (the rule pack)
**Code:** `core/src/archres_core/eval/build.py` (`load_pack_set` · `build_rule_cases_for_packs`) ·
`core/src/archres_core/eval/run.py` (`run_rule_suite` over the set) ·
`core/tests/test_rule_pack_vectors.py` (6 tests) · **Spec:**
`docs/spec/rule-pack-vectors-v0.md`

## Context

The plan's §9 lists the CI guards, and one of them is *"rule-pack test vectors"*. The guard
exists — 49 vectors in the RAJUK pack, scored by the `rule.vector` suite, gated at 1.000 — but it
is **wired to one file**: `spec/rules/rajuk-2008.yaml`, named as a constant in the eval tools.

W4.5 adds the city packs (Chattogram, then Khulna/Rajshahi/Sylhet). A pack that arrives with no
vectors is a pack whose numbers nobody checks — and the failure would be silent, because the
suite would simply not see the new pack — so the guard would be green for a pack it never
looked at.

## Decisions

1. **The pack set is discovered.** Every pack in `spec/rules/` is loaded ✓ — so a city pack
   lands **already gated** ✓, with no code change and no second path to forget ··. A pack
   that does not load is an **error**, not a skip — a rule pack whose numbers cannot be read
   is a rule pack nobody can rely on ··.
2. **Every pack's vectors become cases**, and each case is scored against **its own** pack —
   the case names the pack it came from ··. One suite, every pack ··.
3. **The case id carries the pack.** The vector ids are the pack's own names — and two
   authorities may well use the same one (a FAR table row named the same in two regimes) — so
   the **case** id is pack-qualified ✓ and what must be unique is the **(pack, vector) pair**
   ··. A pack that carries the same vector twice is an error — or the gate would count
   one vector twice and call it two ··.
4. **A pack with no vectors is an error, never a silent pass.** The builder refuses it —
   because a pack whose numbers nobody checks is a pack whose numbers are guesses ··.
5. **The committed case set is rebuilt** — the 49 rule.vector ids are now pack-qualified
   (… the *same* 715 cases — the same suites — the same splits ··) and the
   manifest pins the pack set ··.

## Consequences

- **W4.5's city pack arrives gated** — its vectors become cases the moment the pack lands
  ··, and the `rule.vector` gate covers them ··.
- **The plan's §9 guard is now about the pack set**, not about one pack — which is what
  the plan meant ··.
- A **pack that breaks** breaks the gate — the same as any other pack ··, with no
  special case to keep in step ··.
- The **case set's shape changed** (the rule.vector ids carry the pack) — so the committed
  case file and its manifest were rebuilt ··. The count, the suites and the splits are
  unchanged ··.
