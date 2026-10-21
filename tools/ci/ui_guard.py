"""The UI guard: the theme is applied everywhere, and the i18n is measured.

The plan's W5.6 asks for the **theme applied everywhere** ✓ and the **i18n completion** ✓.
Both are only real if they are **measured** ✓ — the repo's own rule ✓ (a number nobody
measured is a candidate ✓ ✓). So this guard checks three things ✓:

1. **the theme** ✓ — no colour is written outside the theme's files ✓ ✓. A hard-coded
   colour in a screen is a place the theme does not reach ✓, and the dark theme breaks it
   ✓ ✓;
2. **every label has a Bangla** ✓ — an empty translation is a gap ✓ ✓;
3. **a label that is still English in the Bangla dictionary** is either a **named
   exception** ✓ (with a reason ✓ — "BOQ" and the product's own name are the same in both
   languages ✓ ✓) or a **gap** ✓ — and the named list is the review record ✓, so it cannot
   grow silently ✓ ✓.

Run from the repo root:  python tools/ci/ui_guard.py
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
APP = ROOT / "app" / "src"

#: The theme's own files ✓ — the only place a colour may be written ✓ ✓.
THEME_DIRS = ("theme",)

#: A colour literal ✓ — hex ✓, rgb ✓ and hsl ✓ ✓.
COLOUR = re.compile(r"#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(")

#: The app's own files ✓ (the theme's excluded ✓) ✓.
def _app_files() -> list[pathlib.Path]:
    out: list[pathlib.Path] = []
    for path in sorted(APP.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix not in (".css", ".tsx", ".ts"):
            continue
        relative = path.relative_to(APP).as_posix()
        if relative.split("/")[0] in THEME_DIRS:
            continue
        out.append(path)
    return out


#: The labels that are the same in both languages ✓ — and why ✓ ✓.
#: (the product's own name ✓, the abbreviations the industry uses in Bangla too ✓)
IDENTICAL_LABELS = {
    "appName": "the product's own name",
    "boq": "the abbreviation Bangladeshi engineers use",
    "bbs": "the abbreviation Bangladeshi engineers use",
    "EN": "the language's own name",
    "aboutVersionValue": "a version number - the same in every language",
    "aboutBuildValue": "a build label - the same in every language",
}


def _labels() -> tuple[dict[str, str], dict[str, str]]:
    """The English and the Bangla dictionaries ✓ ✓."""
    text = (APP / "i18n.tsx").read_text(encoding="utf-8")
    english: dict[str, str] = {}
    bangla: dict[str, str] = {}
    for block_name, target in (("const en = {", english), ("const bn: typeof en = {", bangla)):
        start = text.index(block_name)
        end = text.index("\n};", start)
        block = text[start:end]
        for match in re.finditer(
            r'(?m)^\s{2}(\w+):\s*"(?:[^"\\]|\\.)*"', block
        ):
            target[match.group(1)] = match.group(0)
    return english, bangla


def _value(block_line: str) -> str:
    """The string a dictionary line holds ✓ (the escapes read ✓) ✓."""
    match = re.search(r':\s*"(.*)"\s*,?\s*$', block_line, re.S)
    if not match:
        return ""
    raw = match.group(1)
    return re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), raw)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    problems: list[str] = []

    # 1. the theme: no colour outside it ✓
    for path in _app_files():
        text = path.read_text(encoding="utf-8")
        for number, line in enumerate(text.splitlines(), start=1):
            if COLOUR.search(line):
                relative = path.relative_to(ROOT).as_posix()
                problems.append(
                    f"{relative}:{number}: a colour is written outside the theme: "
                    f"{line.strip()[:80]}"
                )

    # 2. and 3. the i18n ✓
    english, bangla = _labels()
    if not english:
        print("FAIL the English dictionary could not be read")
        return 1
    for key, line in english.items():
        if key not in bangla:
            problems.append(f"the label {key!r} has no Bangla")
            continue
        english_text = _value(line)
        bangla_text = _value(bangla[key])
        if not bangla_text.strip():
            problems.append(f"the label {key!r} has an empty Bangla")
            continue
        if english_text == bangla_text and key not in IDENTICAL_LABELS:
            problems.append(
                f"the label {key!r} is still English in the Bangla dictionary "
                "(add it to the named exceptions, with its reason, if that is right)"
            )

    if problems:
        print("FAIL the UI guard found:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print(
        f"ui guard clean - {len(english)} label(s) in both languages, "
        f"{len(IDENTICAL_LABELS)} named exception(s), no colour outside the theme"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
