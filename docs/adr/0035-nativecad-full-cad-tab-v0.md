# ADR-0035 — The full-CAD tab is a branded engine, and the app decides the mode from what the engine reports

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.13
**Code:** `cad/boot/nativecad_boot.py` · `core/src/archres_core/cad/launch_contract.py` ·
`tools/cad/boot_probe.py` · **Spec:** `docs/spec/nativecad-full-cad-tab-v0.md`
**Depends on:** S6 (the spike ✓), W0.2 (the tokens) · plan §4, §5.3 · ADR-0004 (branding)

## Context

Spike S6 answered the hard question: the engine's GUI **can** be reparented into the app frame
(exact client fit, resize, modal dialogs, stable), the branding and theme surfaces are
controllable through a boot script, and one layout constraint is unavoidable — a WebView2
surface always paints above a classic child window, so the CAD region must never overlap the
webview (the proven fallback is to hide the webview while the CAD tab is active).

What the spike left open was the *product* half: which brand surfaces are ours, who decides
whether the window is embedded or windowed, and what the app measures to know the branding
worked. The app also has no desktop shell yet, so the **host** that holds the engine does not
exist.

## Decisions

1. **The engine is launched with a boot script, and the script is the product's channel.**
   Passing a `.py` file as a CLI argument makes the engine run it at startup, before the window
   is shown (S6's discovery). The script sets the title, applies the theme and the icon, prunes
   the brand actions and **reports what it did**.
2. **The brand catalogue is a list, and the probe measures it.** S6's census found 559 QActions
   and three brand actions still visible after the spike's own prune. The product's catalogue is
   the full list (`Std_About`, `Std_AboutQt`, `Std_FreeCADForum`, `Std_FreeCADWebsite`,
   `Std_FreeCADDonation`), the boot script hides all of them, and the probe **fails** if any is
   still visible in the running engine. A "the branding should work" claim is not a measurement.
3. **Our title is re-asserted.** The engine recomposes its title on document events ("* doc -
   FreeCAD 1.1.4" — S6's gotcha 2), so the boot script keeps ours on a timer. The embedded mode
   has no caption anyway; the **windowed fallback** does, and it must not say "FreeCAD".
4. **The mode is decided by a pure function of the engine's facts.** Embedded needs a window
   handle, our title and the theme; anything missing is the **windowed fallback** — a supported
   mode, not an error (the plan: "if a machine refuses embedding → fallback opens it in its own
   window from inside the app"). Because the decision is pure, it is tested without an engine.
5. **The profile is isolated and the app owns it.** `FREECAD_USER_HOME` points at a per-launch
   profile: a force-killed engine leaves nothing behind in the user's real settings and no lock
   file survives into the next launch (S6's gotcha 5).
6. **The theme cannot drift from the tokens.** The engine's stylesheet is checked against the
   app's `tokens.css` by a test: a colour the app does not define fails the build. The icon is
   **generated** from the tokens rather than committed (a binary nobody can review is a binary
   nobody should ship).
7. **One catalogue, two places, and a test that says so.** The boot script and the app-side
   contract both carry the brand list; a test compares them, so the two cannot drift.

## Consequences

- The app has everything the host needs to open the full-CAD tab: the command, the
  environment, the handle, the branding state and the mode decision — and the branding is
  **measured** on the real engine (title "NativeCAD", theme ✓, icon ✓, 4 brand actions hidden,
  mode embedded, 13.4 s).
- The **reparent itself** is still the shell's job: the app has no desktop host yet, so the half
  of the embed the app performs has no frame to happen in. S6 proved the mechanics; the seam is
  here ✓.
- The WebView2 layout law (the CAD region must not overlap the webview; the swap-mode fallback)
  is recorded in the spec, so it is not lost when the shell is built ✓.
- The engine's remaining surfaces (the start tab's icons, the default menubars, the startup
  splash) stay a **catalogue** until the host can hide or replace them — declared, not implied ✓.
- The licence notices stay on the app's Licences screen and nowhere else ✓ (ADR-0004).
