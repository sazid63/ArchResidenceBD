# The NativeCAD full-CAD tab v0 (W2.13): the engine's own window, branded

**Status:** v0.1.0 — the engine is launched as **NativeCAD**: our title, our icon, our theme, our
brand catalogue, our isolated profile — and the app knows whether it can embed that window or
must run it windowed.
**Code:** `cad/boot/nativecad_boot.py` (the engine-side boot script) · `cad/boot/nativecad.qss`
(the theme) · `cad/boot/make_nativecad_icon.py` (the icon, generated from the tokens) ·
`core/src/archres_core/cad/launch_contract.py` (the app-side contract) ·
`tools/cad/boot_probe.py` (the live probe) · `core/tests/test_cad_launch_contract.py` (7 tests) ·
**Artefacts:** `data/cad/generated/boot-report.json` · **Decision record:** ADR-0035
**Depends on:** S6 (the embed/brand/theme spike ✓), W0.2 (the design tokens) · **Plan:** §5.3
(NativeCAD's three layers: the invisible engine, the workspace, the full CAD tab — branded,
themed, embedded, with a windowed fallback) · §4 (the engine's name stays out of the product) ·
ADR-0004 (the branding and attribution policy)

## What it is

The plan's NativeCAD has three layers: the **invisible engine** (the workers ✓, W2.1), the
**NativeCAD workspace** (ours ✓, W2.8) and the **full CAD tab** — the engine's own power
surface, branded "NativeCAD", themed from our tokens, embedded in the app window where the
machine allows it and **windowed from inside the app** where it does not (plan §5.3).

This package delivers the **engine half and the contract**: how the app starts the branded
engine, and how the app decides what to do with the window it gets. The host side (the app
frame that holds the engine) is the desktop shell's work — see below.

## The two halves

**The engine side** — `cad/boot/nativecad_boot.py` is passed to the engine as a CLI argument,
and the engine runs it at startup, before the window is shown (spike S6's discovery). It:

- sets the window title to **NativeCAD** and **keeps it** (the engine recomposes its title on
  document events — "* doc - FreeCAD 1.1.4" — so ours is re-asserted on a timer);
- applies the **theme** (`nativecad.qss`, our tokens in the engine's QSS);
- applies the **icon** (generated from the tokens, not committed — a binary nobody can review
  is a binary nobody should ship);
- **prunes the engine's brand actions** — `Std_About`, `Std_AboutQt`, `Std_FreeCADForum`,
  `Std_FreeCADWebsite`, `Std_FreeCADDonation` — the spike found the last three still visible
  after its own prune, so the product's catalogue is the full list;
- **reports what it did** in a facts file: the window handle, the title, the theme, the icon,
  the hidden actions and the action census.

**The app side** — `archres_core.cad.launch_contract` builds the command line and the
environment (the **isolated profile** the app owns, so a force-killed engine leaves nothing
behind in the user's settings — spike S6's gotcha 5), and decides the mode:

| The engine reported | The tab runs |
|---|---|
| a window handle, our title, the theme | **embedded** — the app reparents the window into its CAD region |
| anything missing | **windowed** — the engine keeps its own window, the app's chrome stays around it, and the engine's name is still not on screen |

The decision is a **pure function** of the facts, so it is tested without an engine ✓ — and a
failure to embed is a supported mode, not an error.

## The measured output (2026-10-21, the real GUI engine)

`tools/cad/boot_probe.py` launches the engine exactly as the app would and reads what it
reported:

- the window title is **"NativeCAD"** ✓ (the engine's name is not on it ✓);
- the **theme applied** ✓ and the **icon applied** ✓;
- **4 brand actions hidden** ✓ (the whole catalogue ✓), out of 559 actions in the engine ✓;
- the mode resolved to **embedded** ✓ (the window handle is there ✓);
- 13.4 s from launch to the facts file ✓.

The probe is a **dev-machine** probe (the branding is a GUI property and it needs a desktop
session); the CI runs the contract's tests instead — the command line, the environment, the
fallback decision, the catalogue and the theme's colours.

**The theme cannot drift from the tokens:** a test reads the app's `tokens.css` and fails if the
engine's stylesheet carries a colour the app does not define ✓.

## What is deliberately not here

- **The host frame.** The app has no desktop shell yet (the W0.2 deliverable is a browser
  prototype), so the **reparent** — the half of the embed the app performs — has no host to
  happen in. Spike S6 proved the reparent mechanics against a WinForms host and the real Tauri
  window; the product's host arrives with the shell (P5), and the contract is the seam it will
  use. What is delivered here is everything the host needs: the command, the environment, the
  handle, the branding state and the mode decision.
- **The swap-mode fallback** (spike S6's WebView2 finding: the webview surface always paints
  above a classic child window, so the CAD region must not overlap it, and the proven fallback
  is to hide the webview while the CAD tab is active). That is the host's layout law ✓ — recorded
  here so it is not lost ✓.
- **The remaining engine surfaces** (spike S6's gotcha 4): the start tab's icons still carry
  engine icon resources, the default menubars are the engine's, and the startup splash was
  never evaluated. The tab hides or replaces them when the host is built ✓; until then they are
  a **catalogue**, not a claim ✓.
- **The theme's completeness** — the plan says "~95 % best effort" ✓; v0's stylesheet is the
  spike's ✓ and the tokens' colours ✓, not a full restyle of every engine widget ✓.

## Checks

```powershell
uv run --directory core pytest -q tests/test_cad_launch_contract.py    # 7 tests (no engine)
uv run --directory core python ../tools/cad/boot_probe.py --engine "<freecad.exe>"   # the live probe
```
