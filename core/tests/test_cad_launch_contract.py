"""The full-CAD tab's launch contract (W2.13): the command, the environment, the fallback."""

from __future__ import annotations

import pathlib
import re

from archres_core.cad.launch_contract import (
    BOOT_SCRIPT,
    BRAND_ACTIONS,
    MODE_EMBEDDED,
    MODE_WINDOWED,
    THEME_FILE,
    branding_report,
    decide_mode,
    is_branded,
    launch_command,
    launch_env,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOKENS = ROOT / "app" / "src" / "theme" / "tokens.css"


def test_the_command_starts_the_engine_with_the_boot_script() -> None:
    command = launch_command("C:/engine/freecad.exe")
    assert command[0].endswith("freecad.exe")
    assert command[1] == str(BOOT_SCRIPT)
    assert len(command) == 2
    assert launch_command("C:/engine/freecad.exe", document="C:/model.FCStd")[2] == "C:/model.FCStd"


def test_the_environment_isolates_the_profile_and_points_at_the_facts() -> None:
    env = launch_env("C:/profile", "C:/out")
    assert env["FREECAD_USER_HOME"] == "C:/profile"
    assert env["NATIVECAD_OUT"] == "C:/out"
    assert env["NATIVECAD_TITLE"] == "NativeCAD"
    assert env["NATIVECAD_THEME"] == str(THEME_FILE)


def test_a_healthy_engine_embeds_and_a_broken_one_falls_back() -> None:
    healthy = {"winid": 1234, "title_applied": True, "theme_required": True, "theme_applied": True}
    assert decide_mode(healthy)["mode"] == MODE_EMBEDDED
    assert decide_mode(healthy)["reasons"] == []

    broken = {"winid": 0, "title_applied": False, "theme_required": True, "theme_applied": False}
    decision = decide_mode(broken)
    assert decision["mode"] == MODE_WINDOWED
    assert len(decision["reasons"]) == 3


def test_the_branding_report_says_what_still_names_the_engine() -> None:
    facts = {
        "title_after": "NativeCAD",
        "title_applied": True,
        "theme_applied": True,
        "icon_applied": True,
        "brand_actions_hidden": list(BRAND_ACTIONS),
        "action_texts": [["Std_About", "About FreeCAD", True]],
        "actions_total": 559,
    }
    report = branding_report(facts)
    assert report["visibleBrandActions"] == ["Std_About"]
    assert report["engineNameOnTitle"] is False
    assert report["actionsTotal"] == 559
    assert is_branded(facts) == ["the engine's brand actions are still visible: Std_About"]


def test_a_title_that_names_the_engine_is_a_failure() -> None:
    facts = {
        "title_after": "* model - FreeCAD 1.1.4",
        "title_applied": False,
        "theme_required": False,
        "action_texts": [],
    }
    problems = is_branded(facts)
    assert any("still names the engine" in problem for problem in problems)


def test_the_boot_script_and_the_contract_carry_the_same_catalogue() -> None:
    """One list, two places - and a test that says so."""
    source = BOOT_SCRIPT.read_text(encoding="utf-8")
    match = re.search(r"BRAND_ACTIONS = \((.*?)\)", source, re.DOTALL)
    assert match, "the boot script must declare its brand actions"
    names = re.findall(r'"([A-Za-z_]+)"', match.group(1))
    assert tuple(names) == BRAND_ACTIONS


def test_the_theme_uses_only_the_design_tokens_colours() -> None:
    """The engine's stylesheet cannot drift from the app's design tokens."""
    tokens = TOKENS.read_text(encoding="utf-8")
    allowed = {value.lower() for value in re.findall(r"#[0-9a-fA-F]{6}", tokens)}
    qss = THEME_FILE.read_text(encoding="utf-8")
    used = {value.lower() for value in re.findall(r"#[0-9a-fA-F]{6}", qss)}
    assert used, "the theme must carry colours"
    assert used <= allowed, f"colours outside the tokens: {sorted(used - allowed)}"
