# ADR-0073 — The conversation is the core's: the app asks, the core writes

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W5.1 (the shell's last
wiring) · **Plan:** §4 (the shell) · §5.1 (the chat-driven phase planning ·) · **Related:**
ADR-0060 (the shell and the bridge), ADR-0009 (the interview engine)
**Code:** `app/src/screens/PhaseChatScreen.tsx` (the conversation ·) ·
`core/src/archres_core/bridge.py` (the session methods ·) · **Spec:**
`docs/spec/desktop-shell-v0.md`

## Context

The app's screens were **prototype screens** ✓ — the conversation was two hard-coded
bubbles ✓ and the input did nothing ✓. The core's **session** ✓ existed ✓ (the same one
the demo drives ✓) and the bridge could reach it ✓ — but the app never asked ✓ ✓.

For a commercial app that is the difference between a demo and a product ✓: the
conversation is the app's **main flow** ✓ ✓.

## Decisions

1. **The conversation is the core's** ✓ — the question asked is the **flow book's** ✓, the
   chips are the **flow book's** ✓, and the answer is written to the project by the
   interview's own engine ✓ — never the app's ✓ ✓ (one implementation ✓ ✓).
2. **The app resumes the project it lists** ✓ — the screen asks the core for the projects
   ✓ and resumes the first one ✓ ✓, so the conversation starts where the project stands ✓ ✓.
3. **A chip is the core's chip** ✓ — it carries an **id** ✓ and a **label** ✓, and clicking
   it answers **with that id** ✓ (the interview's own choice ✓ ✓) ✓ — not with its text ✓ ✓.
4. **In a browser there is no core** ✓, and the screen **says so** ✓ — rather than showing a
   conversation that is not happening ✓ ✓.
5. **No project is a first-class state** ✓ — the screen says to create one first ✓ ✓.

## Consequences

- **The app's main flow is real** ✓ — a user answers questions ✓ and the project is written
  ✓ ✓.
- **The interview's honesty shows through** ✓ — an answer the engine cannot read comes back
  as an **escalation** ✓ (the Bangla reply that says so ✓) ✓, not as a silent write ✓ ✓.
- **The Bangla survives the round trip** ✓ — the reply came back through the channel ✓ ✓
  (the locale fix ✓ — ADR-0060's ✓ ✓).
- **What is not here** ✓: the **design** step from the chat ✓ (the screen's button is the
  design's entry point ✓ — the design run is the CAD suite's ✓), and the app's **own** project
  creation ✓ (the setup screen's act ✓ ✓).
