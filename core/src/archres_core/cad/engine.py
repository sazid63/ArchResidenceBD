"""Finding the CAD engine without guessing (W1.8).

The harness must never *assume* an engine: a run that silently degrades to "no CAD" would
turn a real verification into a green check with nothing behind it. So discovery is explicit
and its failure is loud. Order:

1. an explicit path from the caller (``--engine``),
2. ``ARCHRES_FREECADCMD`` (the same override the spikes use),
3. a small list of known install locations,
4. ``freecadcmd`` on ``PATH``.

Nothing here imports FreeCAD: the engine is a separate process, and the app package must
stay importable on a machine with no CAD installed (CI's unit job).
"""

from __future__ import annotations

import os
import pathlib
import shutil

__all__ = ["CadError", "EngineMissing", "EngineInfo", "find_engine"]


class CadError(RuntimeError):
    """A CAD execution problem the caller must see (never a silent pass)."""


class EngineMissing(CadError):
    """The CAD engine could not be located."""


KNOWN_PATHS = (
    pathlib.Path(r"C:\1_SAJID\CE tools\FreeCAD\bin\freecadcmd.exe"),
    pathlib.Path(r"C:\Program Files\FreeCAD 1.1\bin\freecadcmd.exe"),
    pathlib.Path(r"C:\Program Files\FreeCAD 1.0\bin\freecadcmd.exe"),
    pathlib.Path("/usr/bin/freecadcmd"),
    pathlib.Path("/usr/lib/freecad/bin/freecadcmd"),
    pathlib.Path("/usr/lib/freecad-daily/bin/freecadcmd"),
    pathlib.Path("/usr/lib/freecad/lib/freecadcmd"),
    pathlib.Path("/opt/freecad/bin/freecadcmd"),
)

ENV_VAR = "ARCHRES_FREECADCMD"


class EngineInfo:
    """Where the engine is and why we trust that location."""

    __slots__ = ("path", "source")

    def __init__(self, path: pathlib.Path, source: str) -> None:
        self.path = path
        self.source = source

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"EngineInfo(path={self.path!r}, source={self.source!r})"

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, EngineInfo):
            return NotImplemented
        return (self.path, self.source) == (other.path, other.source)


def _existing(path: pathlib.Path | str) -> pathlib.Path | None:
    candidate = pathlib.Path(path)
    if candidate.is_file():
        return candidate
    return None


def find_engine(explicit: str | pathlib.Path | None = None) -> EngineInfo:
    """Locate ``freecadcmd``; raise :class:`EngineMissing` instead of returning ``None``."""
    if explicit is not None:
        found = _existing(explicit)
        if found is None:
            raise EngineMissing(f"CAD engine not found at the given path: {explicit}")
        return EngineInfo(found, "argument")

    from_env = os.environ.get(ENV_VAR)
    if from_env:
        found = _existing(from_env)
        if found is None:
            raise EngineMissing(f"{ENV_VAR} points at a missing file: {from_env}")
        return EngineInfo(found, ENV_VAR)

    for known in KNOWN_PATHS:
        found = _existing(known)
        if found is not None:
            return EngineInfo(found, "known-path")

    on_path = shutil.which("freecadcmd") or shutil.which("FreeCADCmd")
    if on_path:
        return EngineInfo(pathlib.Path(on_path), "path")

    raise EngineMissing(
        "CAD engine (freecadcmd) not found: install FreeCAD, pass --engine, or set "
        f"{ENV_VAR} to the freecadcmd binary"
    )
