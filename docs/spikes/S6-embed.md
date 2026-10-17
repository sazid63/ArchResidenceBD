# S6 — Embed + brand + theme: the engine inside the app frame

**Status:** done 2026-10-17 · **Verdict: yes, with one hard layout constraint** — the engine's main window can be reparented into the app window (`SetParent`: exact client fit, resize, modal dialogs, stable), and every branding/theme surface we can reach at launch is controllable via an injected boot script (title, icons, QSS theme, menu-action pruning). **Constraint found: WebView2 content always paints above classic child windows of the same top-level window, no matter the z-order — so the webview surface must never overlap the CAD region.** The product layout that works: webview chrome (strip) + engine CAD region (asset `S6-region-strip.png`); proven fallback: swap mode (hide the webview while the CAD tab is active).

**Question.** Can the engine's GUI be embedded as a NativeCAD "CAD tab" (ADR-0004: zero engine branding on product surfaces) — reparented into our app frame, themed from our design tokens, with engine-branded dialogs catalogued/replaced — and what breaks?

## Method

- **Engine:** FreeCAD 1.1.4 GUI (`freecad.exe`).
- **Boot-script injection (new mechanism found):** passing a `.py` file as a CLI argument makes the GUI run it at startup — verified (it executes before the window is shown; all overrides apply from the first frame). Combined with `FREECAD_USER_HOME=<dir>` (a fully isolated user profile per run, no touching the real `%APPDATA%\FreeCAD`), this is the product's engine bootstrap channel. Boot script: `tools/spikes/s6/s6_ui_init.py` (applies theme/icon/title/action-pruning; dumps UI facts incl. the main window's HWND as JSON).
- **Harness:** `tools/spikes/s6/embed_test.ps1` (PowerShell + Win32): launches the engine with the boot script, waits for `ui_facts.json`, creates a host window, reparents the engine into it, relays geometry, captures evidence.
- **Hosts tested:** plain WinForms host (raw reparent mechanics) and the **S1 Tauri window** (the real product pattern — engine as a child over a live WebView2 surface).
- **Captures:** screen-region + `PrintWindow(PW_RENDERFULLCONTENT)` (occlusion-proof — needed because the harness runs on the user's desktop behind other windows) + `GetWindowDC` + full-screen; window geometry/flags read back via Win32 after every step.
- **Brand/theme artifacts:** `nativecad-dark.qss` (from `docs/design/design-tokens-v0.md`) + `make_nativecad_icon.py` (placeholder coral icon; real icon set is P1 design work).

## Results

| Test | Result | Evidence |
|---|---|---|
| Boot-script injection | script runs at GUI startup (argv = `[freecad.exe, script]`); isolated profile honored | `ui_facts.json` |
| Reparent into WinForms host | child window at **exact client rect** (host 1280×800 client → engine 1280×800 at client origin); engine alive before/after; screenshot = host chrome + full engine | `assets/S6-winforms-host.png` |
| Reparent into Tauri host (inset 64 px) | child 1264×757 at client y=64 inside 1264×821 client; alive | harness log |
| Resize relay | host → 940×660 ⇒ engine 924×557, re-render OK | `host_pw_tauri_resized.png` (data/) |
| Modal dialog (About) | opens as owned popup **inside the host rect** (612×579 at (386,170) vs host (60,60)–(1356,899)); engine stable | `assets/S6-about-dialog-themed.png` |
| Theme (QSS, 2149 chars) | dark tokens visible across menubar/toolbars/docks/trees/tabs/status bar **and dialogs** | `S6-embedded-themed.png`, `S6-about-dialog-themed.png` |
| Icon override | coral icon applied to window **and application** (shows in dialog chrome) | dialog asset (chrome icon) |
| Title override | `FreeCAD 1.1.4` → `NativeCAD` at boot ✓ (but see gotcha 2) | `ui_facts.json` |
| Brand action prune | `Std_About` ("About FreeCAD") hidden ✓; **still visible: `Std_FreeCADForum`, `Std_FreeCADWebsite`, `Std_FreeCADDonation`** (catalogue) | `ui_facts.json` |
| Menu/toolbar census | 559 QActions (378 with text) dumped for the branding catalogue; menu bar = File/Edit/View/Tools/Macro/Sketch/Part Design/Windows/Help | `ui_facts.json` |
| Engine above webview (z-order) | **fails even when the engine is the topmost child** (child0/6); "firewall" container for the webview doesn't help; hiding the webview child (SW_HIDE) reveals the engine instantly | `embed_tauri_webviewhidden.png` (data/) |
| Webview region split | **works** — shrink the webview surface to a 64 px chrome strip ⇒ strip shows the page, engine fully visible below, single window | **`assets/S6-region-strip.png`** |

## The WebView2 finding (the real output of this spike)

WebView2 (wry/Tauri) presents its content as a DirectComposition surface that composites **above all classic child windows of the same top-level window**, regardless of Win32 z-order (verified: engine reparented, raised to topmost child, still visually covered). Consequences for the product:

1. **Layout law:** the CAD region must not be covered by a webview surface. Layout = webview chrome region(s) + engine child in the CAD region. In W1 this is implemented with Tauri v2 child webviews (`Window::add_child` with explicit bounds); the spike proves the composition behaviour with a manually-shrunk webview surface.
2. **Proven fallback (swap mode):** when the CAD tab is active, hide the webview and show the engine full-window (verified — hiding the webview reveals the engine instantly); app chrome returns on tab switch.
3. Owned/floating-window variants were attempted and **not proven** in this harness (topmost-host interplay; cross-process owner/z manipulation is unreliable). If ever needed, build it in-process (Rust) in W1 — do not repeat the cross-process approach.
4. No z-order "guard loop" is needed in the region layout (no overlap ⇒ no fight); re-validate once the real UI is in place.

## Gotchas

1. **WebView2 paints above classic children** — see above; this is a layout constraint, not a bug to fight.
2. **The window title is recomposed by the application** on document events: after `newDocument()` the title became `* S6Demo - FreeCAD 1.1.4` (doc name + engine name + version). Title override is not sticky — in embedded mode the caption is stripped anyway (no surface); for any windowed fallback mode, re-apply the title on events (or accept a docked caption-less frame).
3. **Qt dialogs are separate top-level owned popups** — they float *above* the host (correctly positioned relative to the engine's screen rect) and are not clipped to it; near screen edges they could extend outside the app frame (W1: keep the engine inset, or patch dialog parenting).
4. **Engine-branded surfaces beyond dialogs remain:** document/Start **tab icons** carry engine icon resources (replace at runtime via `QTabBar.setTabIcon`, or hide the tab bar in the CAD tab); the default **menubar/toolbars** are engine-org menus (hiding them for a seamless CAD tab is a W1 product choice — mechanism = plain Qt visibility calls); the **startup splash was NOT evaluated** (captures start ~10 s after launch; plan: capture the first seconds in W1 and cover with the NativeCAD splash if present). **Gap noted deliberately — no silent coverage claims.**
5. **Stale profile state:** force-killed engines leave lock files; the harness clears the isolated profile temp before each run. The product must own profile lifecycle (fresh or managed profile per launch).
6. **Harness/capture notes:** screen-region captures need the window visible; `PrintWindow(PW_RENDERFULLCONTENT)` is the reliable occlusion-proof path (it captures child composition too — used for all evidence assets); PowerShell doesn't wait for GUI apps (`Start-Process -PassThru` + polling instead).

## Carry-forward

- **W0.9 (freeze interfaces):** engine bootstrap contract — `freecad.exe <boot.py>`; `FREECAD_USER_HOME` per profile; boot script owns theme (QSS from design tokens), icons, action pruning, title policy; warnings/errors surface as data (no dialogs to the user).
- **W1 (skeleton):** CAD-tab layout with Tauri v2 child webviews (bounds = chrome area) + engine child in the CAD region; resize/move relay; swap-mode fallback; engine lifecycle (start with app, restart on crash — pairs with the S4 supervisor); splash strategy; full branding sweep using the action census from `ui_facts.json` (extend the dump to toolbars/docks/icons).
- **W2.x:** reuse the boot script as the engine-side half of the job protocol (S4 workers launch with the same branding/theme contract).

## Reproduce

```
# boot script + harness (theme/icon optional via env):
$env:S6_THEME = (Resolve-Path tools\spikes\s6\nativecad-dark.qss).Path
$env:S6_ICON  = (Resolve-Path data\spikes\s6\nativecad.ico).Path
$env:S6_BRAND = '1'
python tools\spikes\s6\make_nativecad_icon.py data\spikes\s6\nativecad.ico
.\tools\spikes\s6\embed_test.ps1 -HostKind winforms            # raw mechanics
.\tools\spikes\s6\embed_test.ps1 -HostKind tauri -Region       # the product pattern
# outputs: data/spikes/s6/ (ui_facts.json, captures); assets committed under docs/spikes/assets/S6-*.png
```
