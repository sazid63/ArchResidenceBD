# ADR-0049 — The spec's fields are read, the joiners are letters, and both are guarded

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** the two packages the last two
packages found ✓ (the foundation's footing depth ✓ and the hidden characters ✓)
**Code:** `core/src/archres_core/design/foundation.py` ·
`core/src/archres_core/design/commons.py` · `core/src/archres_core/agent/injection.py` ·
`core/tests/test_spec_fields.py` · `core/tests/test_agent_injection.py` ·
`tools/ci/security_guard.py` · **Spec:** `docs/spec/spec-fields-and-hidden-text-v0.md`
**Depends on:** W2.2 (the foundation ✓), W2.12 (the common services ✓), W1.10 (the injection
watch ✓) · plan §5.8, §9

## Context

Two packages found two defects in the packages before them ✓ — which is the point of a package
that checks its own neighbours ✓.

**The cost meter's test** needed a design change that moves the quantities ✓, and found that
**the foundation ignored the spec's footing depth** ✓: the example's foundation phase carries
`"footingDepthM": 1.5` ✓ and the design read `/phases/foundation/data/footingDepthMm` — a key
the spec does not have ✓ — so the spec's depth was **silently ignored** ✓ and a 300 mm footing
was built instead ✓ ✓. The common services had the same shape of defect ✓: the spec says
`"hasLift": false` ✓ and the design built a lift anyway ✓ ✓.

**The security pass** found **8 hidden characters** in the rule pack ✓ — and every one of them
was **U+200D** ✓, which is the **Bangla virama** ✓, the character that forms the conjuncts ✓ ✓.
The scanner called them hidden characters ✓ — a false positive ✓ ✓ — and `strip_hidden()` would
have **stripped every conjunct out of a Bangla clause** ✓ ✗ ✓.

## Decisions

1. **The design reads the spec's key, and the assumption points at that same key.** The
   foundation reads `footingDepthM` ✓ and the common services read `hasLift` ✓ ✓. The
   assumption they hand back — when the spec says nothing ✓ — points at **the spec's own
   key** ✓, so the app writes the assumption where the design will read it ✓ ✓. The loop
   closes ✓, and a field that is *not* read is now a named fact ✓ rather than a silence ✓ ✓.
2. **Every field in the spec is accounted for, and the test holds it.** `core/tests/
   test_spec_fields.py` ✓ — each field in the example's phase data is either **used** ✓ (the
   design reads it ✓ and the value carries the spec's provenance ✓) or **declared** ✓ (the
   design does not, and this is why ✓) ✓. A **new field fails the test** until someone
   decides what it means ✓ ✓, and a field that disappears fails it too ✓ — a stale list is a
   lie ✓ ✓. This is the guard for the whole class ✓ ✓.
3. **The joiners are letters, not hidden characters.** The hidden class holds the characters
   that hide text from a human but not from a model ✓ — the zero-width space ✓, the word
   joiner ✓, the BOM ✓, the bidi overrides ✓ and the isolates ✓ — and **not** U+200C/U+200D ✓,
   because in the scripts this product speaks they are **letters** ✓ ✓. A Bangla clause without
   its conjuncts is not the clause ✓ ✓.
4. **The patterns still see through the joiners.** The rules match against a copy with the
   joiners removed ✓, so an instruction hidden with a joiner is still caught ✓ — and the
   reported spans are the **original's** ✓, so an excerpt points at the text the caller holds
   ✓ ✓. The security is not traded for the Bangla ✓ ✓.
5. **A hidden character in the product's content is a defect, not a note.** The security pass
   now **fails on a hidden character** whatever its severity ✓ ✓ — it hides text from a human
   reader ✓, and the product's content is read by humans ✓ ✓.
6. **The numbers move, and every document that quotes them moves with them.** The footing is
   **1,500 mm** deep now ✓, the BOQ is **154,276.09 BDT** ✓, the model is **12.36375 m³** ✓ —
   and the docs, the boards and the ADRs are updated in the same pass ✓ ✓. A quoted number
   that is not the number is a false document ✓ ✓.

## Consequences

- The **spec's values reach the geometry** ✓ ✓ — a user who types a footing depth gets that
  footing ✓ ✓, and a user who says "no lift" gets no lift ✓ ✓.
- A **new spec field cannot be added silently** ✓ ✓ — the test asks ✓.
- The **Bangla survives the injection watch** ✓ ✓, and a joiner still cannot hide an
  instruction ✓ ✓.
- The **pass is stricter** ✓ ✓ (a hidden character fails it ✓) and its findings are **zero**
  ✓ ✓ — the eight were false positives ✓ ✓.
- The **numbers moved** ✓ ✓, and so did the documents that quote them ✓ ✓. The one thing left
  open is **named**: the design's other assumptions still point at keys the design does not
  read ✓ — the app writes them ✓ and the design does not read them back ✓ — which is **a
  package of its own** ✓ because it touches every design ✓ ✓.
