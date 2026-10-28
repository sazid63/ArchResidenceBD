# The licence notices v0 (W5.1): one legal surface, held to the register

**Status:** v0.1.0 — the app has the legal surface ADR-0004 names: a Licences screen with
the required notices, and an About that links to it.
**Code:** `app/src/legal/notices.ts` · `app/src/screens/LicencesScreen.tsx` ·
`app/src/screens/AboutScreen.tsx` · `tools/ci/licence_notice_guard.py` (the CI guard) ·
**Decision record:** ADR-0059 · **Plan:** §4 (the shell), §5.9 (the runtime stack)

## What it was

ADR-0004 put the required LGPL-2.1 notices on **one legal surface**: a *Licences* screen
reachable from About, plus licence files in the install folder. The repo carried the
register of bundled components (`docs/licenses/THIRD_PARTY.md`) — and the app had **no
Licences screen and no About**. The legal surface the plan names did not exist.

## What it is now

- **The app's legal surface is `app/src/legal/notices.ts`** — the one path the brand guard
  skips, by design (ADR-0004), and the only place in the app where a bundled component may
  be named.
- **The app's notices are the register's components with the register's licences** — and
  the app's **own** terms are the owner's decision (OWNER-ATTENTION #10), so the screen
  *says so* rather than inventing a licence.
- **One copy of a legal fact** — a CI guard holds the app's list to the register: every
  component the app names is in the register with the licence the register gives it, and a
  licence the register has not verified **cannot be a notice** (a candidate is not a
  notice).
- **About carries no "powered by" line** — it links to the Licences screen (ADR-0004).
- **The components that are not bundled yet are listed as such** — the screen says *not
  bundled yet*, because an app must not claim to bundle what it does not bundle.

## The measured output (2026-10-21)

- The **Licences screen** lists every notice with its role, its licence and the licence
  file the install folder carries ·.
- The **About screen** shows the product's own name and version · and links to the legal
  surface · — with no "powered by" line anywhere ·.
- The **guard** passes ·: 5 notices match the register's 7 components · — and it fails when
  a notice names a component the register does not have ·, when the licences differ ·, or
  when the register's licence is not verified yet ·.
- The **brand guard** still passes · — the engine's name is nowhere in the app except the
  legal path ·.

## What is deliberately not here

- **The desktop shell and the installer** — the app, the CAD engine, the Python runtime and
  the model pack, laid down progressively — and the **licence files in the install folder**.
  That is the rest of W5.1 (and W5.2 is the installer's download slice).
- **The app's own terms** — the owner's decision (OWNER-ATTENTION #10).

## Checks

```powershell
python tools/ci/licence_notice_guard.py
python tools/ci/brand_guard.py
pnpm --dir app typecheck
```
