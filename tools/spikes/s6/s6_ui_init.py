"""S6 engine boot script - passed as a CLI arg to freecad.exe, runs inside the GUI process.

This is the seed of the product's engine bootstrap: one script that applies
NativeCAD branding/theme overrides and reports UI facts, used by the S6 spike
harness (tools/spikes/s6/embed_test.ps1).

Env controls (all optional except S6_OUT):
  S6_OUT       output dir for ui_facts.json (default <repo>/data/spikes/s6)
  S6_THEME     path to a .qss file -> applied to the main window (theming proof)
  S6_TITLE     window title override (rebranding proof); default 'NativeCAD'
  S6_DIALOG    schedule an engine dialog after ~6 s ('about' or a command name)
  S6_DEMO_DOC  '1' -> create a demo document with a Part box and fit the view
"""

import json
import os
import time
from pathlib import Path


def _out_dir() -> Path:
    if os.environ.get("S6_OUT"):
        return Path(os.environ["S6_OUT"])
    return Path(__file__).resolve().parents[3] / "data" / "spikes" / "s6"


OUT = _out_dir()
OUT.mkdir(parents=True, exist_ok=True)

facts: dict = {"started": time.ctime()}

try:
    import FreeCAD
    import FreeCADGui

    mw = FreeCADGui.getMainWindow()
    facts["title_before"] = mw.windowTitle()
    facts["main_window_class"] = mw.metaObject().className()
    facts["winid"] = int(mw.winId())
    facts["style"] = mw.style().objectName()
    facts["stylesheet_len_before"] = len(mw.styleSheet())

    title = os.environ.get("S6_TITLE", "NativeCAD")
    mw.setWindowTitle(title)
    facts["title_after"] = mw.windowTitle()

    theme = os.environ.get("S6_THEME")
    if theme and Path(theme).is_file():
        qss = Path(theme).read_text(encoding="utf-8")
        mw.setStyleSheet(qss)
        facts["theme_applied_len"] = len(qss)
        facts["theme_applied"] = True
    else:
        facts["theme_applied"] = False

    from PySide import QtGui  # noqa: E402  (Qt6: QAction lives in QtGui)

    icon_file = os.environ.get("S6_ICON")
    if icon_file and Path(icon_file).is_file():
        icon = QtGui.QIcon(icon_file)
        mw.setWindowIcon(icon)
        app = QtGui.QGuiApplication.instance()
        if app is not None:
            app.setWindowIcon(icon)
            facts["app_icon_applied"] = True
        facts["icon_applied"] = Path(icon_file).name

    acts = mw.findChildren(QtGui.QAction)
    if os.environ.get("S6_BRAND") == "1":
        hidden = []
        for a in acts:
            if a.objectName() in ("Std_About", "Std_AboutQt"):
                a.setVisible(False)
                hidden.append(a.objectName())
        facts["brand_actions_hidden"] = hidden
    if os.environ.get("S6_DUMP_MENUS") == "1":
        facts["actions_total"] = len(acts)
        facts["action_texts"] = [
            [a.objectName(), a.text().replace("&", "").strip(), bool(a.isVisible())]
            for a in acts
            if a.text().strip()
        ]
        facts["menus"] = [a.text().replace("&", "") for a in mw.menuBar().actions()]

    if os.environ.get("S6_DEMO_DOC") == "1":
        doc = FreeCAD.newDocument("S6Demo")
        import Part  # noqa: F401  (registers Part objects - also validators)

        box = doc.addObject("Part::Box", "Box")
        box.Length, box.Width, box.Height = 6000, 4000, 3200
        doc.recompute()
        view = FreeCADGui.ActiveDocument.ActiveView
        view.viewIsometric()
        FreeCADGui.SendMsgToActiveView("ViewFit")
        facts["demo_doc"] = True

    dialog = os.environ.get("S6_DIALOG")
    if dialog:
        from PySide.QtCore import QTimer

        def _open_dialog() -> None:
            try:
                if dialog == "about":
                    cands = [
                        c for c in FreeCADGui.listCommands() if "about" in c.lower()
                    ]
                    facts["about_candidates"] = cands
                    name = "Std_About" if "Std_About" in cands else (cands[0] if cands else "")
                else:
                    name = dialog
                facts["dialog_command"] = name
                (OUT / "ui_facts.json").write_text(
                    json.dumps(facts, indent=2, sort_keys=True), encoding="utf-8"
                )
                if name:
                    FreeCADGui.runCommand(name)
                    facts["dialog_opened"] = True
            except Exception as exc:  # noqa: BLE001
                facts["dialog_error"] = repr(exc)
            finally:
                (OUT / "ui_facts.json").write_text(
                    json.dumps(facts, indent=2, sort_keys=True), encoding="utf-8"
                )

        QTimer.singleShot(6000, _open_dialog)

    facts["ok"] = True
except Exception as exc:  # noqa: BLE001
    facts["ok"] = False
    facts["error"] = repr(exc)

(OUT / "ui_facts.json").write_text(
    json.dumps(facts, indent=2, sort_keys=True), encoding="utf-8"
)
