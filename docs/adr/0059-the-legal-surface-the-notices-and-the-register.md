# ADR-0059 — The legal surface: the notices live on one screen, and the register holds them

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W5.1 (the installer v0 — the
licence-notice slice) · **Plan:** §4 (the shell) · §5.9 (the runtime stack the installer
ships) · **Related:** ADR-0004 (the engine's name belongs in the notice, not the branding)
**Code:** `app/src/legal/notices.ts` (the notices) · `app/src/screens/LicencesScreen.tsx` ·
`app/src/screens/AboutScreen.tsx` · `tools/ci/licence_notice_guard.py` (the guard) ·
**Spec:** `docs/spec/licence-notices-v0.md`

## Context

ADR-0004 put the required LGPL-2.1 notices on **one legal surface**: a *Licences* screen
reachable from About, plus licence files in the install folder. The repo carried the
register of bundled components (`docs/licenses/THIRD_PARTY.md`) — and the **app had no
Licences screen and no About** ·. So the legal surface the plan names did not exist, and
W5.1 (the installer) has to put it there.

## Decisions

1. **The app's legal surface is `app/src/legal/notices.ts`** · — the one path the brand guard
   skips, by design · (ADR-0004) ·, and the only place in the app where a bundled
   component may be named · ·.
2. **The app's notices are the register's components with the register's licences** · — and
   the app's **own** terms are the owner's decision (OWNER-ATTENTION #10 ·), so the screen
   *says so* rather than inventing a licence · — an invented licence is a false statement
   about a legal fact · ·.
3. **One copy of a legal fact.** The app's list and the register are two files that must
   agree ·, so a CI guard holds them together — every component the app names is in the
   register with the licence the register gives it · · — and a licence the register has not
   verified **cannot be a notice** ·: a candidate is not a notice · ·.
4. **About carries no "powered by" line** · — it links to the Licences screen · (ADR-0004)
   ·.
5. **The components that are not bundled yet are listed as such** · — the screen says
   *not bundled yet* · — because an app must not claim to bundle what it does not bundle
   · ·.

## Consequences

- **The legal surface exists** · — the notices are on one screen, the About links to it, and
  the engine's name is nowhere else in the app · (the brand guard holds that ·) ·.
- **The screen and the register cannot drift** · — the guard is in CI · ·.
- **The app's own terms wait on the owner** · — and the screen says so rather than
  inventing them · ·.
- **What is not here** ·: the **desktop shell** and the **installer** itself (the app, the
  CAD engine ·, the Python runtime ·, the model pack ·, laid down progressively ·) and the
  **licence files in the install folder** · — those are the rest of W5.1 ·, and the
  installer's own slice (W5.2 ·) · ·.
