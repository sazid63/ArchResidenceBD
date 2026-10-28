# ADR-0069 — The theme reaches everywhere, and the i18n is measured by a guard

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.6 (the UI polish) ·
**Plan:** §5.1 (the design system: the tokens · the corner policy · BN/EN i18n from day one ·)
· **Related:** ADR-0059 (the legal surface), ADR-0044 (the branding)
**Code:** `tools/ci/ui_guard.py` (the guard ·) · `app/src/cad/workspace.css` (the tokens ·) ·
`app/src/screens/ProjectsScreen.tsx` (the dashboard ·) · `core/src/archres_core/bridge.py`
(`projects.list` ·) · **Spec:** `docs/spec/ui-polish-v0.md`

## Context

The plan's W5.6 asks for the **theme applied everywhere** ✓ and the **i18n completion** ✓.
The repo had the tokens ✓ and the UI kit ✓ — and the plan's own rule is that a claim is
only real when it is **measured** ✓ (a number nobody measured is a candidate ✓ ✓). So both
halves of W5.6 were, until now, **assertions** ✓ — and the guard found them to be partly
false ✓ ✓.

The guard found **five colours written outside the theme** ✓ — all in the CAD workspace's
own stylesheet ✓ — and **one label still English in the Bangla dictionary** ✓ (a version
number ✓, which is a named exception ✓ and not a gap ✓ ✓).

## Decisions

1. **A colour is written only in the theme** ✓ — the guard fails on any colour literal
   outside `app/src/theme/` ✓ ✓. The CAD workspace's own palette went ✓ — it uses the
   tokens now ✓ (`--paper` ✓, `--surface-2` ✓, `--surface-3` ✓, `--ink-soft` ✓, `--line` ✓)
   ✓, so the dark theme reaches it ✓ ✓.
2. **Every label has a Bangla** ✓ — an empty translation is a gap ✓ and the guard fails ✓ ✓.
3. **A label that is still English in Bangla is either a named exception or a gap** ✓ — and
   the named list carries its **reason** ✓ (the product's own name ✓, the abbreviations
   Bangladeshi engineers use ✓, a version number ✓) ✓ — so the list is the **review
   record** ✓ and it cannot grow silently ✓ ✓.
4. **The dashboard lists the real projects** ✓ — the core's `projects.list` ✓ reads the
   projects on this machine ✓, each from its own **tip** ✓, so the dashboard shows the
   project's facts ✓ and not a mock ✓ — and a folder that is not a project is **not
   listed** ✓ ✓.
5. **The browser keeps the mock** ✓ — in the prototype (no core ✓) the screen shows the
   mock project it always did ✓ ✓.

## Consequences

- **The theme reaches everywhere** ✓ — and the guard keeps it there ✓ ✓.
- **The i18n is measured** ✓ — **152 labels** ✓ in both languages ✓, with **6** named
  exceptions ✓ ✓ — and a label that goes untranslated is caught ✓ ✓.
- **The dashboard is real** ✓ where the core is ✓ ✓.
- **What is not here** ✓: **Simple/Pro** ✓ (the tier is a **product decision** ✓ — the
  owner's ✓ — and the guard does not invent one ✓), and the **installer's own theme** ✓
  (the installer's look is the shell's ✓) ✓.
