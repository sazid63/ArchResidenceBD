# ADR-0074 — A project is created by the core: the app names it, the core writes it

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the shell's last wiring)
· **Plan:** §4 (the shell) · §5.1 (the left navigation: *Project Setup* ·) · **Related:**
ADR-0073 (the conversation is the core's), ADR-0009 (the interview engine)
**Code:** `core/src/archres_core/bridge.py` (`project.create` ·) ·
`app/src/screens/ProjectSetupScreen.tsx` (the setup screen ·) · **Tests:**
`core/tests/test_bridge_project.py` (4) · **Spec:** `docs/spec/desktop-shell-v0.md`

## Context

The app's *New Project* button led to a setup screen that **changed nothing** ✓ — the
form's fields were local state ✓ and the button navigated away ✓ ✓. For a commercial app
that is the first thing a user does ✓, and it did not exist ✓ ✓.

## Decisions

1. **The project is the core's** ✓ — the app names it ✓ and picks the template it starts
   from ✓, and the core writes the spec ✓ (revision 0 ✓) and opens the interview ✓ ✓.
   The app never writes a spec ✓ ✓ (one implementation ✓ ✓).
2. **A template is a committed example spec** ✓ (ADR-0070 ✓) — so a new project starts
   from something the repo holds ✓ ✓.
3. **The name becomes a safe folder** ✓ — spaces and marks become dashes ✓, the name is
   lowercased ✓, and an empty one falls back ✓ ✓ — so the path is the same on every
   machine ✓ ✓.
4. **A name that is taken is refused** ✓ — with the reason ✓ — and never overwrites ✓ ✓.
5. **In a browser there is no core** ✓, and the screen **says so** ✓ — and it says when a
   name is missing ✓ ✓.

## Consequences

- **The app's first action is real** ✓ — a user names a project ✓ and the interview
  opens ✓ ✓.
- **The interview's own questions follow** ✓ — the setup screen's form is the *shortcut* ✓
  (the flow asks the same things one by one ✓) ✓ ✓.
- **What is not here** ✓: the setup screen's **own** fields ✓ (the location ✓, the plot ✓,
  the stories ✓ — the interview asks them ✓ ✓), and the **design** that follows ✓ ✓.
