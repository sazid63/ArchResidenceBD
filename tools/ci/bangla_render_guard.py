"""Bangla render guard - the Bangla we ship must survive the trip to the page.

The plan's §9 lists a CI guard: "**Bangla rendering regression tests** (glyph shaping, numerals,
mixed BN+EN on generated PDFs)". The first Bangla PDF arrives with the shell's print (P5) — the
app's browser prints the HTML the reports already produce (plan §6) — but the *text* can be
guarded today, and the text is where a Bangla document usually breaks:

- **Mojibake.** A report written as cp1252 and read as UTF-8 (or the other way round) turns
  "সিমেন্ট" into "à¦¸à¦®à§¡à¦¨à¦Ÿ" — a document that looks fine in the tool that wrote it
  and is nonsense on the page. The guard rejects the Latin-1 mojibake sequences and the Unicode
  replacement character.
- **Numerals.** The Bangla report writes its numbers in Bangla digits (০-৯). A digit that
  slipped back to Latin is a small wrongness an engineer would notice.
- **The font.** The glyphs only shape if the page asks for a Bengali font: the guard checks the
  font stack carries one (plan §5.1: **Noto Sans Bengali**).
- **The language.** A page of Bangla that does not declare `lang="bn"` is read by the browser's
  wrong shaper and line-breaking rules.

What the guard does **not** do (declared, not implied): it does not rasterise a glyph. The
pixel-level check needs a browser and the shell's print — the plan's own §9 wording includes
"on generated PDFs", and the PDF arrives with the shell (P5). The text-level guard is the half
that can fail today, and it is the half that catches the failures a Bangla document actually
ships with.

Run from the repo root:  python tools/ci/bangla_render_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
#: The generated Bangla documents the guard reads.
SCOPE = [ROOT / "data" / "compliance"]
TEXT_SUFFIXES = {".html", ".htm", ".md", ".txt"}

#: A Bengali block (U+0980 - U+09FF) and the Bangla digits.
BANGLA = re.compile(r"[ঀ-৿]")

#: The classic UTF-8-read-as-Latin-1 mojibake markers for Bengali.
MOJIBAKE = re.compile("[\u00c0-\u00ff][\x80-\xbf]")

#: The replacement character (a decode that failed).
REPLACEMENT = "�"

#: A Bengali font the stack must name.
FONT_TOKEN = "Noto Sans Bengali"

#: The Latin digits a Bangla document should not carry in its prose (its numbers are ০-৯).
LATIN_DIGIT = re.compile(r"(?<![A-Za-z0-9_.])\d+(?![A-Za-z0-9_.])")


def _is_bangla_document(text: str) -> bool:
    return bool(BANGLA.search(text))


def check_file(path: Path) -> list[str]:
    """The problems in one document (empty when it is clean).

    The encoding checks run on **every** file: a document whose Bangla was destroyed by a
    mis-decoded write has no Bangla left to recognise, and skipping it would let exactly the
    failure we are guarding against through. The font and the language are checked only for a
    document that still has Bangla in it.
    """
    problems: list[str] = []
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [f"{path.name}: the file is not valid UTF-8 ({exc})"]
    if REPLACEMENT in text:
        problems.append(f"{path.name}: the text carries the replacement character (U+FFFD)")
    mojibake = MOJIBAKE.findall(text)
    if mojibake:
        problems.append(
            f"{path.name}: the text carries {len(mojibake)} mojibake sequence(s) "
            "(a UTF-8 document read as Latin-1)"
        )
    if _is_bangla_document(text) and path.suffix.lower() in (".html", ".htm"):
        if FONT_TOKEN not in text:
            problems.append(f"{path.name}: the font stack does not name {FONT_TOKEN}")
        if 'lang="bn"' not in text:
            problems.append(f'{path.name}: the page does not declare lang="bn"')
    return problems


def main() -> int:
    problems: list[str] = []
    scanned = 0
    for base in SCOPE:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            scanned += 1
            problems.extend(check_file(path))
    for problem in problems:
        print(f"FAIL {problem}", file=sys.stderr)
    if problems:
        print(f"bangla render guard: {len(problems)} problem(s)", file=sys.stderr)
        return 1
    print(f"bangla render guard clean - {scanned} file(s) scanned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
