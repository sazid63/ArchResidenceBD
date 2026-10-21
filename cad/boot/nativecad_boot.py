"""NativeCAD's boot script (W2.13) - the engine's own window, branded.

The app launches the engine with this file as a CLI argument; the engine runs it at startup,
before the window is shown (spike S6's discovery). That makes it the product's engine
bootstrap channel: the title, the icon, the theme and the pruning of the engine's brand
actions all happen here, and the app reads what happened from the facts file.

The contract with the app side (``archres_core.cad.launch_contract``):

- ``NATIVECAD_OUT``   - the directory the facts file is written to
- ``NATIVECAD_TITLE`` - the title the window carries (the engine's own name never appears)
- ``NATIVECAD_THEME`` - the stylesheet to apply (our tokens, the engine's QSS)
- ``NATIVECAD_ICON``  - the window icon to apply
- ``FREECAD_USER_HOME`` - the isolated profile the app owns

The facts file reports what the engine actually did - not what was intended. A theme that did
not apply, a title the engine recomposed, a brand action that stayed visible: the probe reads
these and fails, because "the engine names itself" is a product defect, not a detail.
"""

import json
import os
import time
from pathlib import Path

#: The engine's brand-bearing actions (the product's catalogue - the app side holds the same
#: list, and the probe compares the two).
BRAND_ACTIONS = (
    "Std_About",
    "Std_AboutQt",
    "Std_FreeCADForum",
    "Std_FreeCADWebsite",
    "Std_FreeCADDonation",
)

#: How often the title is re-asserted. The engine recomposes its title on document events
#: ("* doc - FreeCAD 1.1.4" - spike S6's gotcha 2), so ours has to be put back.
TITLE_REFRESH_MS = 1500


def _out_dir() -> Path:
    raw = os.environ.get("NATIVECAD_OUT")
    if raw:
        path = Path(raw)
    else:
        path = Path(__file__).resolve().parents[2] / "data" / "tmp" / "nativecad-boot"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _write_facts(out: Path, facts: dict) -> None:
    (out / "ui_facts.json").write_text(
        json.dumps(facts, indent=2, sort_keys=True), encoding="utf-8"
    )


def main() -> None:
    out = _out_dir()
    facts = {"started": time.ctime(), "boot": "nativecad"}
    try:
        import FreeCAD  # noqa: F401  (the engine is always there)
        import FreeCADGui

        mw = FreeCADGui.getMainWindow()
        facts["main_window_class"] = mw.metaObject().className()
        facts["winid"] = int(mw.winId())
        facts["title_before"] = mw.windowTitle()

        title = os.environ.get("NATIVECAD_TITLE", "NativeCAD")
        mw.setWindowTitle(title)
        facts["title_after"] = mw.windowTitle()
        facts["title_applied"] = facts["title_after"] == title

        theme = os.environ.get("NATIVECAD_THEME")
        facts["theme_required"] = bool(theme)
        if theme and Path(theme).is_file():
            qss = Path(theme).read_text(encoding="utf-8")
            mw.setStyleSheet(qss)
            facts["theme_applied"] = bool(qss.strip())
            facts["theme_bytes"] = len(qss)
        else:
            facts["theme_applied"] = False

        from PySide import QtGui  # noqa: E402  (Qt6: QAction lives in QtGui)

        icon_file = os.environ.get("NATIVECAD_ICON")
        if icon_file and Path(icon_file).is_file():
            icon = QtGui.QIcon(str(icon_file))
            mw.setWindowIcon(icon)
            app = QtGui.QGuiApplication.instance()
            if app is not None:
                app.setWindowIcon(icon)
            facts["icon_applied"] = True
            facts["icon_file"] = Path(icon_file).name
        else:
            facts["icon_applied"] = False

        actions = mw.findChildren(QtGui.QAction)
        hidden = []
        for action in actions:
            if action.objectName() in BRAND_ACTIONS:
                action.setVisible(False)
                hidden.append(action.objectName())
        facts["brand_actions_hidden"] = sorted(hidden)
        facts["actions_total"] = len(actions)
        facts["action_texts"] = [
            [action.objectName(), action.text().replace("&", "").strip(), bool(action.isVisible())]
            for action in actions
            if action.text().strip()
        ]
        facts["menus"] = [action.text().replace("&", "") for action in mw.menuBar().actions()]

        # Keep our title: the engine recomposes it when a document event fires.
        from PySide.QtCore import QTimer  # noqa: E402

        def _retitle() -> None:
            try:
                if mw.windowTitle() != title:
                    mw.setWindowTitle(title)
            except Exception:  # noqa: BLE001  (the window may be closing)
                pass

        timer = QTimer()
        timer.timeout.connect(_retitle)
        timer.start(TITLE_REFRESH_MS)
        facts["title_timer"] = True

        facts["ok"] = True
    except Exception as exc:  # noqa: BLE001  (the facts must say what went wrong)
        facts["ok"] = False
        facts["error"] = repr(exc)
    _write_facts(out, facts)


main()
