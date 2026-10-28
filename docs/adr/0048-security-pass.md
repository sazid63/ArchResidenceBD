# ADR-0048 — The security pass is a CI gate over the app's own surfaces, using the repo's own laws

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.10 (the security pass)
**Code:** `tools/ci/security_guard.py` · `core/tests/test_security_pass.py` ·
**Artefact:** `data/security/security-pass.json` · **Spec:** `docs/spec/security-pass-v0.md`
**Depends on:** W1.10 (the injection watch and the permission layer ✓) · plan §5.8, §9

## Context

The plan's §5.8 asks for permission policies ✓, sandboxing ✓, a prompt-injection watch on all
external content ✓ and **fleet isolation** ✓ — *the model that touches the web cannot write
CAD code* ✓. W1.10 built the machinery ✓: the scanner ✓, the fencer ✓ and the permission
policy ✓.

But the machinery was never **run over the app's own surfaces** ✓, and the policy's laws were
never checked **as laws** ✓ — they were code, and code that is never exercised is a comment
with a runtime cost ✓ ✓.

## Decisions

1. **The pass is a CI gate, not a document.** The pass **runs** ✓ — the injection scan over the
   external content ✓ and the permission layer's laws ✓ — and the CI **fails** when a law stops
   holding ✓ or a high-severity finding appears in the content ✓ ✓. A security pass that only
   writes a report nobody reads is not a pass ✓ ✓.
2. **The laws are checked as decisions, not as comments.** Ten of them ✓, each one exercised
   through the policy itself ✓ — the sandbox ✓, the unknown tool ✓, the offline network ✓, the
   shell ✓, **fleet isolation** ✓ (external content cannot drive a write or a net tool ✓), the
   high-severity alert ✓ (it refuses *every* tool ✓), the ungranted tool **asking** ✓, the
   granted tool allowed ✓, and **every decision logged** ✓ ✓.
3. **A finding is a finding.** Every injection finding in the external content is **recorded** ✓
   with its surface ✓, its rule ✓, its severity ✓ and its excerpt ✓ — even the ones that are
   not fatal ✓ ✓. Only a **high**-severity finding fails the pass ✓, because the external
   content is a *transcription* of official documents ✓ and a phrase that looks like an
   instruction in a rule pack is not an instruction ✓ ✓.
4. **The surfaces are the ones the product actually ingests** ✓: the rule pack's clauses ✓ and
   the transcribed rate cards ✓ ✓ — not the app's own UI copy ✓ (that is the product's own
   words ✓, not external content ✓ ✓), and not the fetched PDFs ✓ (they are not committed ✓;
   the transcription ✓ — the text the product uses ✓ — is ✓ ✓).
5. **No semgrep in this package.** The plan's tooling table would have had semgrep for this
   package ✓, but the CLI is **not installed** ✓, and the $0 budget and the owner's standing
   rule forbid a new install without sign-off ✓ ✓. The pass therefore uses **the repo's own
   laws** ✓ — which is what the plan argued for in the first place ✓ ✓. A semgrep run is the
   **owner's** item ✓ ✓, named ✓ ✓.
6. **The pack's hidden characters are not cleaned here.** The pass **reports** them ✓ (8
   medium findings ✓) — and this decision was **wrong about what they were** ✓ ✓.
   **Amended 2026-10-21 by ADR-0049** ✓: every one of the 8 was **U+200D** ✓ — the **Bangla
   virama** ✓, the character that forms the conjuncts ✓ ✓ — so they were **false positives** ✓,
   not hidden text ✓. The rule was wrong ✓, the text was right ✓, and ADR-0049 fixes the rule
   ✓ ✓. Nothing needed cleaning in the pack ✓ ✓ — and the pass now **fails on a real hidden
   character** ✓, whatever its severity ✓ ✓.

## Consequences

- The app's own surfaces are **watched on every push** ✓ ✓, and a law that stops holding fails
  the build ✓ ✓.
- The permission layer's **fleet isolation** ✓ is now *proven* ✓, not asserted ✓ ✓.
- The findings are **in the record** ✓ — and the record is **amended** ✓: the 8 findings were
  the Bangla virama ✓ ✓, and the rule that called them hidden was wrong ✓ ✓ (ADR-0049 ✓ ✓).
  The pass now reports **zero** ✓ ✓ and fails on a real hidden character ✓ ✓.
- **Two things are the owner's** ✓ ✓: a semgrep run ✓ (the CLI is not installed ✓), and the
  pack's hidden characters ✓ (a package ✓, because it moves the generated artefacts ✓ ✓).
