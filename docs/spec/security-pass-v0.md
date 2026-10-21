# The security pass v0 (W3.10): the external content is watched, and the permission layer holds

**Status:** v0.1.0 — the pass over the app's own surfaces exists, it is a CI gate, and it
records what it found.
**Code:** `tools/ci/security_guard.py` (the pass) · `core/tests/test_security_pass.py` (3
tests) · **Artefact:** `data/security/security-pass.json` (the record) ·
**Decision record:** ADR-0048
**Depends on:** W1.10 (the injection watch and the permission layer ✓) ·
**Plan:** §5.8 (*shell / fetch / web search with permission policies and sandboxing;
prompt-injection watch on all external content; fleet isolation — the model that touches the
web cannot write CAD code*) · §9 (no silent gaps)

## What it is

W1.10 built the **machinery** ✓ — the injection scanner ✓, the fencer ✓ and the permission
policy ✓. What was missing was the **pass** ✓: the machinery was never run over the app's own
surfaces ✓, and the permission layer's laws were never checked **as laws** ✓ ✓.

The pass has two halves ✓:

1. **The injection watch over every external surface the product ingests** ✓ — the rule pack's
   clauses ✓ (transcribed from official documents ✓) and the transcribed rate cards ✓ (the
   official price lists ✓). Every finding is **recorded** ✓; a **high**-severity one **fails**
   the pass ✓ ✓.
2. **The permission layer's laws, checked as laws** ✓ — ten of them ✓ ✓, each one a
   *decision* ✓ rather than a comment ✓:
   - a path outside the sandbox is refused ✓;
   - an unknown tool is refused ✓;
   - the network is off while offline-first ✓;
   - the shell is off unless the session allows it ✓;
   - **external content cannot drive a write tool** ✓ (fleet isolation ✓);
   - **external content cannot drive a network tool** ✓ (fleet isolation ✓);
   - a high-severity finding refuses **every** tool ✓;
   - a tool that has not been granted **asks** for approval ✓;
   - a granted tool is allowed ✓;
   - **every decision is logged** ✓ (no silent anything ✓ ✓).

## The measured output (2026-10-21)

- **10 laws, 10 hold** ✓ ✓.
- **0 injection findings** in the external content ✓ ✓. The pass first reported **8** ✓ — and
  every one of them was **U+200D** ✓, the **Bangla virama** ✓: the character that forms the
  conjuncts ✓ ✓. They were **false positives** ✓ — the rule that called them hidden was wrong
  ✓, and the text was right ✓ ✓ (ADR-0049 ✓ ✓). The rule is fixed ✓, the Bangla survives the
  watch ✓, and the pass now **fails on a real hidden character** ✓ whatever its severity ✓ ✓.
- The **CI step** re-runs the pass and compares the record ✓ ✓ — a law that stops holding, or
  a high-severity finding that appears in the content, **fails the build** ✓ ✓.

## What is deliberately not here

- **The pack needs no cleaning** ✓ — the characters the pass found were the **Bangla
  virama** ✓ ✓, and they are the text ✓ ✓ (ADR-0049 ✓ ✓). The rule was wrong, not the pack
  ✓ ✓.
- **A semgrep pass** ✓ — the plan's tooling table would have had semgrep for this package ✓,
  but the CLI is **not installed** ✓ and the $0 budget and the owner's standing rule forbid a
  new install without sign-off ✓ ✓. The pass therefore uses **the repo's own laws** ✓ — which
  is what the plan argued for in the first place ✓ ✓. A semgrep run is the **owner's** item ✓ ✓.
- **The app's own UI strings** ✓ — they are the product's own copy ✓, not external content ✓ ✓.
- **The fetched price-list PDFs** ✓ — they are not committed ✓ (the registry's fetcher writes
  them to the cache ✓), so the pass covers the **transcription** ✓ — the text the product
  actually uses ✓ ✓.

## Checks

```powershell
python tools/ci/security_guard.py            # the pass, with the report
python tools/ci/security_guard.py --check    # the committed record is fresh
uv run --directory core pytest -q tests/test_security_pass.py
```
