"""Console encoding for the BN+EN command-line tools (Windows-first).

The product ships on Windows, where a **redirected or piped** stream is encoded in the
locale code page (cp1252 on the dev machine) instead of UTF-8. Every tool here prints
hand-authored Bangla - a question, a clause, a gazette citation - so `print()` raises
``UnicodeEncodeError`` the moment output is captured by a shell, a CI runner, a log file,
or the desktop shell's sidecar channel. The interactive console survives only because
PEP 528 made it UTF-8; that accident is not a contract.

Call :func:`utf8_stdio` once at the top of ``main()``: stdout and stderr then carry
UTF-8 bytes on every platform, and the same bytes come back from
``subprocess.run(..., encoding="utf-8")``.
"""

from __future__ import annotations

import sys
from typing import TextIO

__all__ = ["utf8_stdio"]

_UTF8 = "utf-8"


def utf8_stdio(streams: tuple[TextIO, ...] = (sys.stdout, sys.stderr)) -> None:
    """Reconfigure the given streams to UTF-8, ignoring anything that cannot be reconfigured.

    ``TextIOWrapper.reconfigure`` exists on CPython 3.7+; anything else (a test double, a
    wrapped stream) is left alone rather than crashing the tool.
    """
    for stream in streams:
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:  # not a CPython text stream - nothing to do
            continue
        try:
            reconfigure(encoding=_UTF8)
        except (OSError, ValueError):  # detached/closed stream - the caller still prints
            continue
