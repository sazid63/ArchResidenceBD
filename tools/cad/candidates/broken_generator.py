"""Candidate: a broken generator, on purpose (W1.8).

The harness must be able to *fail* a candidate and say why in a form a repair model can use.
This script is that negative case: it builds a pad, then asks for a column that does not exist
on the document. The harness must report ``engine_error`` with the candidate's own traceback,
and the geometry it did build must not be counted as a pass.

Never a fixture for anything but failure: a case that expects this script to succeed would be
a lie about the harness.
"""

from __future__ import annotations

import os

import FreeCAD as App  # noqa: N813 - the engine's canonical import name
import Part


def main() -> None:
    document = App.ActiveDocument
    if document is None:
        raise RuntimeError("no active document: the launcher always creates one")
    pad = Part.makeBox(1200.0, 1200.0, 300.0, App.Vector(0.0, 0.0, -300.0))
    obj = document.addObject("Part::Feature", "Pad_Root")
    obj.Shape = pad
    document.recompute()
    # The defect: the candidate assumes a column already exists instead of building one.
    column = document.getObject("Column_1")
    if column is None:
        raise RuntimeError(
            "Column_1 is missing: the foundation needs a column on every pad"
        )
    obj.Shape = obj.Shape.fuse(column.Shape)


if __name__ == "__main__":  # noqa: SIM108 - freecadcmd sets __name__ to the stem, so also:
    main()
else:  # pragma: no cover - the path freecadcmd takes
    main()
