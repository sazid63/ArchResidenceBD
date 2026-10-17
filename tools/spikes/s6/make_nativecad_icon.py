"""Generate a placeholder NativeCAD .ico (32x32, primary coral from the design
tokens) for the S6 icon-override test - the real icon set is a P1 design task."""

import struct
import sys
from pathlib import Path

w = h = 32
bih = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, w * h * 4, 0, 0, 0, 0)
px = bytes([102, 138, 230, 255]) * (w * h)  # BGRA of #e68a66 (--primary)
and_mask = b"\x00" * (h * 4)
img = bih + px + and_mask
icondir = struct.pack("<HHH", 0, 1, 1)
entry = struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(img), 22)

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(icondir + entry + img)
print(f"wrote {out} ({out.stat().st_size} bytes)")
