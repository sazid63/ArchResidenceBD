# S6 — embed + brand + theme spike scripts

Evidence: `docs/spikes/S6-embed.md`. All scripts target the bundled engine
(`C:\1_SAJID\CE tools\FreeCAD\bin\freecad.exe`; FreeCAD 1.1.4).

- `s6_ui_init.py` — the engine **boot script** (product artifact seed). Passed
  as a CLI argument to `freecad.exe`, it runs at GUI startup and is the whole
  branding/theme channel. Env contract:
  - `S6_OUT` — dir for `ui_facts.json` (required for the harness)
  - `S6_THEME` — path to a `.qss` applied to the main window (e.g. `nativecad-dark.qss`)
  - `S6_ICON` — `.ico`/`.png` applied to the window **and** the application
  - `S6_TITLE` — window title override (default `NativeCAD`)
  - `S6_BRAND=1` — hide engine-branded menu actions (About/Qt-About)
  - `S6_DUMP_MENUS=1` — dump every QAction (objectName, text, visible) + menus into `ui_facts.json`
  - `S6_DEMO_DOC=1` — create a demo document with a Part box for screenshots
  - `S6_DIALOG=about` — open the engine About dialog ~6 s after start (dialog catalogue/testing)
- `embed_test.ps1` — the harness. Launch + isolate + reparent + capture:
  - `-HostKind winforms|tauri` — plain WinForms host (mechanics) or the S1 Tauri window (product pattern)
  - `-Region` — shrink the webview surface to a 64 px strip (proves chrome-strip + CAD-region layout)
  - `-Owned` — owned-window variant attempt (not proven; see evidence doc)
  - `-Firewall` — webview z-order isolation attempt (does not work; kept for the record)
  - `-Resize` / `-Dialog` — extra captures
  - Outputs to `data/spikes/s6/` (`ui_facts.json`, `*.png`, `top_windows_*.txt`)
- `nativecad-dark.qss` — dark theme from `docs/design/design-tokens-v0.md`
  (proves QSS theming; the full token→widget mapping lands in W1).
- `make_nativecad_icon.py` — placeholder coral `.ico` (real icon set = P1 design task).

Notes:
- The engine profile is isolated per run via `FREECAD_USER_HOME=data/spikes/s6/user`
  (the harness clears it first — force-kills leave stale locks).
- The engine's window handle comes from `ui_facts.json` (`winid`), not from
  title search — robust and race-free.
- On the real desktop the harness makes its host window topmost so screen
  captures see it; committed evidence uses occlusion-proof `PrintWindow` captures.
