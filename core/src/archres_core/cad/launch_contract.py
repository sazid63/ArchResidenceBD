"""The full-CAD tab's launch contract (W2.13): how the app starts the branded engine.

The plan's NativeCAD has three layers (plan §5.3): the invisible engine, the **NativeCAD
workspace** (W2.8 — ours), and the **full CAD tab** — the engine's own power surface, branded
"NativeCAD", themed from our design tokens, embedded in the app window where the machine allows
it and **windowed from inside the app** where it does not.

Spike S6 proved the mechanics and left the product's decisions open. This module is the
app-side half of those decisions; the engine-side half is the boot script the app launches the
engine with (``cad/boot/nativecad_boot.py``).

The laws:

- **The engine never names itself.** The window title is ours, the icon is ours, and the
  engine's own "About / forum / website / donation" actions are pruned (the catalogue below is
  the spike's census, turned into a product list). The licence notices live on the app's
  Licences screen and nowhere else (ADR-0004).
- **The window title is re-applied.** The engine recomposes its title on document events ("* doc
  - FreeCAD 1.1.4" — spike S6's gotcha 2), so the boot script keeps ours. The embedded mode has
  no caption anyway; the **windowed fallback** does, and it must not say "FreeCAD".
- **A failure to embed is a supported mode, not an error.** If the machine refuses the
  reparent, the engine runs in its own window and the app still shows its chrome around it
  (one app, zero installs). The decision is a pure function of what the engine reported, so it
  is testable without an engine.
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

#: The engine's boot script (the app launches the engine with it as a CLI argument — spike S6's
#: discovery that a .py argument runs inside the GUI at startup).
BOOT_SCRIPT = pathlib.Path(__file__).resolve().parents[4] / "cad" / "boot" / "nativecad_boot.py"

#: The engine's stylesheet (our tokens, the engine's QSS).
THEME_FILE = BOOT_SCRIPT.with_name("nativecad.qss")

#: The window title the engine carries (the engine's own name never appears).
WINDOW_TITLE = "NativeCAD"

#: The engine's brand-bearing actions, and what the product does with each one.
#:
#: Spike S6's census found 559 QActions and three brand actions still visible after the
#: spike's own prune (``Std_About`` alone was hidden). The product prunes all four, and the
#: catalogue is a *list*, not a hope: a new brand action is a change to this file, and the
#: probe checks that none of them is visible in the running engine.
BRAND_ACTIONS: tuple[str, ...] = (
    "Std_About",
    "Std_AboutQt",
    "Std_FreeCADForum",
    "Std_FreeCADWebsite",
    "Std_FreeCADDonation",
)

#: The environment variable the boot script writes its facts to.
FACTS_ENV = "NATIVECAD_OUT"

#: The environment variable that points the engine at its isolated profile.
PROFILE_ENV = "FREECAD_USER_HOME"

#: The two modes the full-CAD tab can run in.
MODE_EMBEDDED = "embedded"
MODE_WINDOWED = "windowed"


def launch_command(engine: str | pathlib.Path, *, document: str | pathlib.Path | None = None) -> list[str]:
    """The command line that starts the branded engine.

    The engine binary, then the boot script (the engine runs it at startup, before the window
    is shown), then an optional document to open.
    """
    command = [str(engine), str(BOOT_SCRIPT)]
    if document is not None:
        command.append(str(document))
    return command


def launch_env(
    profile_dir: str | pathlib.Path,
    out_dir: str | pathlib.Path,
    *,
    theme: str | pathlib.Path | None = None,
    icon: str | pathlib.Path | None = None,
    title: str = WINDOW_TITLE,
) -> dict[str, str]:
    """The environment the branded engine starts with.

    The profile is **isolated** (the engine's own user directory, per launch): the app owns
    the profile's lifecycle, so a force-killed engine leaves nothing behind in the user's real
    settings and no lock file survives into the next launch (spike S6's gotcha 5).
    """
    env = {
        PROFILE_ENV: str(profile_dir),
        FACTS_ENV: str(out_dir),
        "NATIVECAD_TITLE": title,
    }
    theme_path = pathlib.Path(theme) if theme else THEME_FILE
    if theme_path.is_file():
        env["NATIVECAD_THEME"] = str(theme_path)
    icon_path = pathlib.Path(icon) if icon else None
    if icon_path is not None and icon_path.is_file():
        env["NATIVECAD_ICON"] = str(icon_path)
    return env


def decide_mode(facts: dict[str, Any]) -> dict[str, Any]:
    """The mode the tab runs in, decided by what the engine reported.

    ``embedded`` needs a window handle to reparent into and a branding pass that actually
    applied. Anything else is the **windowed fallback**: the engine keeps its own window, the
    app shows its chrome around it, and the engine's name is still not on screen (the boot
    script keeps the title ours).
    """
    reasons: list[str] = []
    handle = facts.get("winid")
    if not handle:
        reasons.append("the engine reported no window handle")
    if not facts.get("title_applied"):
        reasons.append("the title override did not apply")
    if facts.get("theme_required") and not facts.get("theme_applied"):
        reasons.append("the theme did not apply")
    mode = MODE_EMBEDDED if not reasons else MODE_WINDOWED
    return {"mode": mode, "reasons": reasons}


def branding_report(facts: dict[str, Any]) -> dict[str, Any]:
    """What is branded, and what still carries the engine's own brand.

    The report is a *measurement* of the running engine, not a claim: the probe compares it
    with the catalogue, and a brand action that is still visible is a failure, not a note.
    """
    visible_brand = [
        str(item[0])
        for item in facts.get("action_texts") or []
        if item and str(item[0]) in BRAND_ACTIONS and len(item) > 2 and item[2]
    ]
    return {
        "title": facts.get("title_after"),
        "titleApplied": bool(facts.get("title_applied")),
        "themeApplied": bool(facts.get("theme_applied")),
        "iconApplied": bool(facts.get("icon_applied")),
        "hiddenBrandActions": list(facts.get("brand_actions_hidden") or []),
        "visibleBrandActions": sorted(visible_brand),
        "engineNameOnTitle": "freecad" in str(facts.get("title_after") or "").lower(),
        "actionsTotal": int(facts.get("actions_total") or 0),
    }


def is_branded(facts: dict[str, Any]) -> list[str]:
    """The branding failures in a facts document (empty when the engine is fully branded)."""
    report = branding_report(facts)
    problems: list[str] = []
    if not report["titleApplied"]:
        problems.append("the title override did not apply")
    if report["engineNameOnTitle"]:
        problems.append(f"the window title still names the engine: {report['title']!r}")
    if report["visibleBrandActions"]:
        problems.append(
            "the engine's brand actions are still visible: "
            + ", ".join(report["visibleBrandActions"])
        )
    if facts.get("theme_required") and not report["themeApplied"]:
        problems.append("the theme did not apply")
    return problems


def read_facts(path: str | pathlib.Path) -> dict[str, Any]:
    """Read the facts the boot script wrote."""
    return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))


__all__ = [
    "BOOT_SCRIPT",
    "BRAND_ACTIONS",
    "FACTS_ENV",
    "MODE_EMBEDDED",
    "MODE_WINDOWED",
    "PROFILE_ENV",
    "THEME_FILE",
    "WINDOW_TITLE",
    "branding_report",
    "decide_mode",
    "is_branded",
    "launch_command",
    "launch_env",
    "read_facts",
]
