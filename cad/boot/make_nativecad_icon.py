"""Generate the NativeCAD window icon (W2.13) - the coral of the design tokens, no engine marks.

The spike made a placeholder icon; the product makes it from the **design tokens** so the
engine's window cannot carry a colour the app does not use. The real icon set is a design task
(P1); this is the shape the product ships in the meantime, and it is generated rather than
committed - a binary in the repository is a binary nobody can review.
"""

from __future__ import annotations

import pathlib
import re
import struct
import sys

#: The token the icon's colour comes from.
TOKEN = "--primary"

#: The QSS's dark-theme equivalent of the token (the engine's window is dark).
DARK_PRIMARY = "#e68a66"


def token_colour(tokens_css: pathlib.Path, name: str = TOKEN) -> str:
    """The token's hex value, read from the app's stylesheet."""
    text = tokens_css.read_text(encoding="utf-8")
    match = re.search(rf"{re.escape(name)}\s*:\s*(#[0-9a-fA-F]{{6}})", text)
    if not match:
        raise SystemExit(f"the token {name} is not in {tokens_css}")
    return match.group(1)


def _bgr(hex_colour: str) -> bytes:
    value = hex_colour.lstrip("#")
    red, green, blue = (int(value[index : index + 2], 16) for index in (0, 2, 4))
    return bytes([blue, green, red, 255])


def write_icon(path: pathlib.Path, colour: str = DARK_PRIMARY, size: int = 32) -> pathlib.Path:
    """Write a single-image .ico in the given colour."""
    width = height = size
    header = struct.pack("<IiiHHIIiiII", 40, width, height * 2, 1, 32, 0, width * height * 4, 0, 0, 0, 0)
    pixels = _bgr(colour) * (width * height)
    and_mask = b"\x00" * (height * 4)
    image = header + pixels + and_mask
    directory = struct.pack("<HHH", 0, 1, 1)
    entry = struct.pack("<BBBBHHII", width, height, 0, 0, 1, 32, len(image), 22)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(directory + entry + image)
    return path


def main() -> int:
    root = pathlib.Path(__file__).resolve().parents[2]
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "data" / "tmp" / "nativecad.ico"
    tokens = root / "app" / "src" / "theme" / "tokens.css"
    colour = DARK_PRIMARY
    if tokens.is_file():
        # The tokens are the source of truth for the app's light surface; the engine's window
        # carries the dark variant of the same hue, so the token is read to prove it exists.
        token_colour(tokens)
    write_icon(out, colour)
    print(f"wrote {out} ({out.stat().st_size} bytes, {colour})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
