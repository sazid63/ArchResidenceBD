"""The shell's icon: a 512x512 PNG written by hand (no image library, no new dependency).

The icon is the product's own mark - the plan's warm coral on the paper base (design tokens
v0) - and it carries no third-party name (ADR-0004).
"""

import pathlib
import struct
import zlib

SIZE = 512
PAPER = (250, 246, 240)
CORAL = (214, 106, 84)
INK = (60, 54, 50)


def _pixel(x: int, y: int) -> tuple[int, int, int]:
    """A simple mark: a coral disc on the paper base, with an ink baseline."""
    cx = cy = SIZE / 2
    dx = x - cx
    dy = y - cy
    radius = (dx * dx + dy * dy) ** 0.5
    if radius > SIZE * 0.36:
        return PAPER
    if abs(dy - SIZE * 0.30) < SIZE * 0.012 and abs(dx) < SIZE * 0.22:
        return INK
    if abs(dx) < SIZE * 0.012 and abs(dy + SIZE * 0.12) < SIZE * 0.20:
        return INK
    return CORAL


def _png(path: pathlib.Path) -> None:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # the filter byte: none
        for x in range(SIZE):
            red, green, blue = _pixel(x, y)
            raw.extend((red, green, blue, 255))  # RGBA - the shell's icon reader wants it

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    # colour type 6 is RGBA (8 bits per channel, with alpha).
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)
    data = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    print(f"wrote {path} ({len(data)} bytes)")


if __name__ == "__main__":
    _png(pathlib.Path("../app/src-tauri/icons/icon.png"))
