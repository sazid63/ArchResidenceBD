# S5 — reinforcement scripting spike scripts

Evidence: `docs/spikes/S5-reinforcement.md`. All scripts run inside the bundled
engine's console (no GUI):

```
$env:QT_QPA_PLATFORM = 'offscreen'
& 'C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe' tools\spikes\s5\rebar_bbs.py
```

- `rebar_bbs.py` — builds C1 (column, two ties + six mains), B1 (beam,
  two-legged stirrups + bars) and F1 (footing, mesh + starter) with the
  FreeCAD-Reinforcement presets, stamps explicit marks, measures every rebar
  solid by volume, writes `data/downloads/s5/{frame.FCStd,run.json,bbs.svg}`
  and runs range checks (exit code 0 = pass).
- `probe_objects.py` — diagnostic: dumps object internals (shape solids, base
  wire, distribution properties) from the saved FCStd; used to decode the
  selected-face convention (evidence doc gotcha #1).

Setup — clone the addon (LGPL-2.1, engine-side only later; already listed in
`docs/licenses/THIRD_PARTY.md`):

```
git clone https://github.com/amrit3701/FreeCAD-Reinforcement.git data/spikes/s5/FreeCAD-Reinforcement   # tested at 9f424ac
```

Headless notes: `freecadcmd` needs two stubs for the addon (both set up inside
`rebar_bbs.py`) — a fake `DraftGui` module with a no-op `todo` (the footing
path imports it and would build a Qt toolbar), and a console replacement for
`PySide.QtGui.QMessageBox` (the addon's `showWarning` hard-aborts headless).
`BentAngle` / `BentFactor` are integer properties — pass `int`, not `float`.

The one rule to remember: the face you pass to a preset **defines the whole
build** — bars/rings are drawn in that face's plane and distributed along its
normal. Select a member's cross-section face (column: bottom/top, beam: an
end, footing: a side face); the addon resolves everything else itself.
