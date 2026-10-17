"""Generate a minimal valid 32x32 .ico (BMP-based, classic format) for the S1 Tauri
hello app - tauri-build requires icons/icon.ico for the Windows resource file."""

import struct
import sys
from pathlib import Path

w = h = 32
bih = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, w * h * 4, 0, 0, 0, 0)
px = bytes([95, 58, 31, 255]) * (w * h)  # BGRA, dark blue, opaque
and_mask = b"\x00" * (h * 4)  # 32 px per row -> 4 bytes, rows bottom-up
img = bih + px + and_mask
icondir = struct.pack("<HHH", 0, 1, 1)
entry = struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(img), 22)

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(icondir + entry + img)
print(f"wrote {out} ({out.stat().st_size} bytes)")
