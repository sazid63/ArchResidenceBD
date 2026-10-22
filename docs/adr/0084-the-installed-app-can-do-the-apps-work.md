# ADR-0084 — The install is complete when the installed app can do the app's work

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the installer v0
— the completeness slice) · **Plan:** §4 (the shell) · §5.9 (the runtime stack the
installer ships) · §9 (the quality gates) · **Related:** ADR-0061 (the install
layout), ADR-0065 (the install is complete), ADR-0072 (the install carries the core as a
package)
**Code:** `core/src/archres_core/install.py` (the plan carries the app's data) ·
`core/src/archres_core/bridge.py` (the app's data is found in both trees) ·
**Tests:** `core/tests/test_install_layout.py` (13) · **Spec:**
`docs/spec/install-layout-v0.md`

## Context

The install was **declared complete** ✓ ✓ (ADR-0065 ✓ ✓) · and the check
proved it ✓ ✓ by asking the installed core for a **ping** ✓ ✓.

But a ping does not need the app's data ✓ ✓ — so the check could not see what was
missing ✓ ✓. The installed app was then measured ✓ ✓ by asking it the
questions the app asks ✓ ✓, and **three failed** ✓ ✓:

1. **the app could not start a project** ✓ ✓ — the **templates** ✓ ✓ (the
   examples the project setup screen offers ✓ ✓) were not in the install ✓ ✓,
   so the app said *"no template is available"* ✓ ✓ ✓;
2. **the app could not run the interview** ✓ ✓ — the flow book was found in
   **two** ways ✓ ✓ — the manual's way ✓ ✓ (the install's place ✓ ✓,
   then the dev tree's ✓ ✓) and the interview's way ✓ ✓ (the dev tree's place
   only ✓ ✓) ✓ ✓ — and the install has no `spec/` folder ✓ ✓;
3. **the app could not price a BOQ** ✓ ✓ — the **rate cards** ✓ ✓ were not
   in the install ✓ ✓ — and the money law says the prices are *missing* ✓ ✓,
   not zero ✓ ✓.

⇒ The thing the owner sells ✓ ✓ — the installed app ✓ ✓ — could not
start its first project ✓ ✓ — and could not price ✓ ✓ ✓.

## Decisions

1. **The install carries the app's data** ✓ ✓ — the **templates** ✓ ✓ and the
   **rate cards** ✓ ✓ — beside the core's own data ✓ ✓ (`runtime/core/` ✓
   ✓) ✓ ✓, because the app reads them at runtime ✓ ✓ ✓.
2. **One rule for the app's data** ✓ ✓ — the core finds every piece of it in the
   **install's** place or the dev tree's ✓ ✓, and **loudly** ✓ when neither has it
   ✓ ✓ (the CAD engine's rule ✓: discovery is explicit ✓ and its failure is loud
   ✓ ✓) ✓ ✓ · and there is **one** way to find the flow book ✓ ✓
   · so the manual and the interview cannot disagree ✓ ✓ ✓.
3. **The check asks the app's questions** ✓ ✓ — the templates ✓ ✓, a project
   ✓ ✓, the interview ✓ ✓, the manual ✓ ✓ and the money ✓ ✓
   · not a ping ✓ ✓ · so a hole like this cannot pass again ✓ ✓ ✓.
4. **The app finds the engine it carries** ✓ ✓ — the install bundles the engine
   ✓ ✓ (the geometry is the app's own ✓ ✓) · and the discovery looked only at
   the build machine's places ✓ ✓ · so the app could not find the two gigabytes it
   carries ✓ ✓ · so the discovery looks in **the install's** engine folder ✓ ✓
   · the one the app ships with ✓ ✓ ✓.

## Consequences

- **The installed app can do the app's work** ✓ ✓ — the templates ✓ ✓, the
  project ✓ ✓, the interview ✓ ✓, the manual ✓ ✓ and the money
  ✓ ✓ · all measured on the installed folder ✓ ✓ ✓.
- **The card's status still travels** ✓ ✓ — the installed app prices from the
  **candidate** card ✓ ✓ and says so ✓ ✓ (the money law ✓ ✓) ✓ ✓.
- **The update path reads an installation too** ✓ ✓ — the check's own help says
  it reads *"the installation to read"* ✓ ✓ · and it read the repo's paths only
  ✓ ✓ · so the install now **records the version it installed** ✓ ✓ (a
  `version.json` at the install's root ✓ ✓ · written by the installer ✓ ✓ ·
  the exe's version is not a file anyone can read ✓ ✓) and carries the **model
  registry** ✓ ✓ (beside the GGUFs it names ✓ ✓) · and the check looks
  in the install's places too ✓ ✓ ✓.
- **The app's own data folder is in the layout** ✓ ✓ — the review ledger lives
  there ✓ ✓ (ADR-0083 ✓ ✓) · the same way the user's projects do ✓ ✓
  · and the app never has to invent a place to write ✓ ✓ ✓.
- **What is deliberately not here** ✓ ✓ — the **RAG corpus** ✓ ✓ (the app
  does not read it at runtime today ✓ ✓) · the **source registry** ✓ ✓ (the
  price service fetches from the network ✓ ✓, and an offline-first app prices from
  the card it carries ✓ ✓) · and the app's own **update screen** ✓ ✓ (the
  plan's W5.4 is the update *plan* ✓ ✓ · a screen that asks the network is the
  owner's call ✓ ✓) ✓ ✓.
