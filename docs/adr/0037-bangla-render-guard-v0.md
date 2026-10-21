# ADR-0037 — The Bangla guard watches the text, and the text is where the failures live

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.9
**Code:** `tools/ci/bangla_render_guard.py` · `core/tests/test_bangla_render_guard.py`
**Spec:** `docs/spec/bangla-render-guard-v0.md`
**Depends on:** W3.6 (the first Bangla documents) · plan §3, §5.1, §9

## Context

The plan's §9 lists a CI guard that has had no package since P0: "**Bangla rendering
regression tests** (glyph shaping, numerals, mixed BN+EN on generated PDFs)". The P2 audit
recorded it as a declared gap, and W3.6 has now produced the first Bangla documents — the
compliance audit and the Deviation Register, rendered as HTML for the plan's
HTML→print-PDF route.

The full guard needs a browser and the app's print, and the desktop shell is P5's. The question
this package answers is: **what can be guarded now, and does guarding it mean anything?**

## Decisions

1. **The text is guarded now; the pixels are declared.** A Bangla document breaks in the text
   long before it breaks in the glyphs: a mis-decoded write turns "সিমেন্ট" into
   "à¦¸à¦®à§¡à¦¨à¦Ÿ", a failed decode leaves "�", and a page that does not ask for a
   Bengali font or declare `lang="bn"` is shaped and broken by the wrong rules. All of those
   are checkable without a browser ✓ — and all of them are failures a Bangla document actually
   ships with ✓. The pixel-level check waits for the shell's print ✓ and is declared, not
   implied ✓.
2. **The encoding checks run on every file, not only the Bangla ones.** The first version
   skipped a file that had no Bangla in it — and a document whose Bangla was *destroyed* by a
   mis-decoded write has no Bangla left to recognise ✗. Skipping it would have let exactly the
   failure we guard against through ✓. The font and the language are checked for the documents
   that still have Bangla ✓ (an English document needs neither ✓).
3. **The guard is a CI step, like the brand guard.** `python tools/ci/bangla_render_guard.py`
   runs in the `sanity` job on every push ✓ — a fast, dependency-free check ✓ (stdlib only ✓).
4. **The scope is a list, and it grows with the documents.** Today it is `data/compliance/`
   ✓; every new Bangla document joins it when it is committed ✓. The guard is not a one-off
   check of one file ✓.
5. **The tests prove the guard can fail.** A clean document passes ✓; a mojibake document ✓, a
   replacement character ✓, a missing font ✓, a missing language ✓ and a non-UTF-8 file ✓ are
   each caught ✓. A guard that cannot fail is a comment.

## Consequences

- One of the plan's §9 guards now exists and runs on every push ✓ — the gap the P2 audit
  recorded is closed ✓ (the *pixel* half of it waits for the shell ✓, and says so ✓).
- The Bangla the product ships is checked for the failures that actually reach a user ✓ — and
  the check is cheap enough to run always ✓.
- W3.6's contract (the Bangla numerals, the font stack, `lang="bn"`) is now enforced by CI ✓
  rather than by a convention ✓.
- The mixed BN+EN *layout* and the rendered PDF are still the shell's ✓ — the next step of this
  guard, when the print exists ✓.
