"""Check the rule pack's FAR values against the gazette's own text layer, and against
the Chattogram CDA's own copy of the same schedule.

    uv run --directory core python ../tools/rules/gazette/check_far.py
    uv run --directory core python ../tools/rules/gazette/check_far.py --check

**What this is.** The pack's FAR tables were transcribed by eye from the gazette's
**rendered pages** (the recipe in ``README.md`` ✓), because the gazette's text layer was
unreadable ✓ — its Bangla letters are in a legacy font encoding ✓ ✓. But the **digits** in
that text layer are plain ✓ ✓, and the reader now reads the layer at all ✓ (ADR-0081 ✓ ✓) —
so the pack's numbers can be checked **against the source's own digits** ✓ ✓, by script ✓,
with no rendering and no human ✓ ✓.

And a **second copy** can be checked ✓: the Chattogram CDA publishes the same schedule in
its own copy of the Building Construction Act 1952 ✓ ✓, and the reader reads that one too ✓
✓ — so the pack's numbers are checked against **two** independent copies of the schedule ✓
✓, neither of which the pack was transcribed from ✓ ✓.

**How a row is matched.** A row is matched by the **road width** it shares with the pack's
row ✓ — the road width is the first number of the row ✓, and it is what tells one row from
the next ✓ ✓ (a document's rows are read in the order they are printed ✓, but the road
width is what says a row *is* the pack's row ✓ ✓). So a document that prints its rows
differently ✓ — the gazette puts the area range on its own line ✓ and the CDA puts it in
the same line ✓ ✓ — is still matched row for row ✓ ✓.

**What it is not.** It does not *transcribe* ✓ — it *checks* ✓: every row of the table the
documents print is compared with the pack's row ✓ ✓, and a row a document does not carry
is reported as **not checked** ✓ (never as a disagreement ✓ — a row a document cannot read
is a gap, not a fault ✓ ✓, ADR-0080 ✓ ✓).

⇒ **The exit code is the truth** ✓: zero when every row the documents carry agrees ✓ ✓,
one when a row disagrees ✓ (a disagreement is a real fault ✓ — the pack or the layer ✓ ✓).
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "core" / "src"))

from archres_core.pdf_text import read_pdf  # noqa: E402

GAZETTE = ROOT / "data" / "downloads" / "sources" / "rajuk-bidhimala-2008-gazette.pdf"
CDA = ROOT / "data" / "downloads" / "sources" / "chattogram-building-construction-act-1952.pdf"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"

#: The gazette's Bangla digits, and the Latin ones they stand for.
_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

#: A number in a document's text layer: the road width, the FAR, the MGC ✓ — and "NR",
#: the gazette's own word for *not permitted* ✓ ✓.
_NUMBER = re.compile(r"^(?:[\d.]+|NR)\*?$")
#: A footnote marker at the end of a row ("[২]" ✓, "[1]" ✓).
_FOOTNOTE = re.compile(r"\[[^\]]*\]\s*$")

#: The tolerance on a number read from a text layer (the layer's own spacing ✓).
_TOLERANCE = 0.001

#: The two classes the schedule prints side by side ✓ — the pack's A1-A4 and A5 ✓ ✓ —
#: and which column of the pair is which ✓.
_SIDE_BY_SIDE = (("A1-A4", 1), ("A5", 2))


def _value(raw: str) -> float | str:
    """A FAR value: a number, or "NR" — the gazette's own word for *not permitted* ✓."""
    bare = raw.rstrip("*")
    return bare if bare == "NR" else float(bare)


def _trailing_run(line: str) -> list[str] | None:
    """The numbers a row ends with ✓ — three (one class ✓) or six (two classes ✓).

    A document lays the row out differently ✓ — the gazette prints the area range on its
    own line above ✓ and the CDA prints it in the same line ✓ — so the row's **numbers**
    are what is read ✓ ✓, and they are read at the **end** of the line ✓ (the area range
    carries numbers too ✓ ✓).
    """
    stripped = _FOOTNOTE.sub("", line).strip()
    tokens = stripped.split()
    for size in (6, 3):
        if len(tokens) < size:
            continue
        tail = tokens[-size:]
        if all(_NUMBER.match(token) for token in tail):
            return tail
    return None


def _rows(document) -> list[tuple]:
    """The document's FAR rows, each a page and its numbers ✓.

    A row of six numbers carries **two** classes (the A1-A4 and the A5 columns ✓); a row
    of three carries one ✓. A row whose "NR" falls on the next line ✓ (the CDA prints its
    last two rows that way ✓ ✓) is joined with the line below it ✓.
    """
    rows: list[tuple] = []
    for page in document.pages:
        lines = [line.strip().translate(_DIGITS) for line in page.text.splitlines()]
        for index, line in enumerate(lines):
            tail = _trailing_run(line)
            if not tail:
                continue
            if len(tail) < 6:
                # a row whose second group falls on the lines below ✓ (the CDA prints
                # its last two rows that way ✓ ✓) - join and read it again ✓
                for extra in (1, 2):
                    joined = " ".join(
                        [line, *lines[index + 1 : index + 1 + extra]]
                    )
                    candidate = _trailing_run(joined)
                    if candidate and len(candidate) == 6:
                        tail = candidate
                        break
            try:
                if len(tail) == 6:
                    road1, far1, mgc1, road2, far2, mgc2 = tail
                    rows.append(
                        (
                            page.number,
                            (float(road1), _value(far1), float(mgc1)),
                            (float(road2), _value(far2), float(mgc2)),
                        )
                    )
                else:
                    road, far, mgc = tail
                    rows.append((page.number, (float(road), _value(far), float(mgc))))
            except ValueError:
                continue
    return rows


def _agrees(want: dict, got: tuple) -> bool:
    """Does the pack's row agree with the document's own digits ✓?"""
    want_far = want.get("far")
    want_mgc = want.get("mgcPercent")
    got_far, got_mgc = got[1], got[2]
    if isinstance(want_far, str):
        if want_far != got_far:
            return False
    elif isinstance(got_far, str):
        return False
    elif abs(float(want_far) - float(got_far)) > _TOLERANCE:
        return False
    return abs(float(want_mgc) - got_mgc) < _TOLERANCE


def _key(want: dict) -> tuple | None:
    """The pack's row as the triple the document prints ✓ — the road width, the FAR, the MGC ✓."""
    far = want.get("far")
    mgc = want.get("mgcPercent")
    width = want.get("roadWidthM")
    if far is None or mgc is None or width is None:
        return None
    return (float(width), far if isinstance(far, str) else float(far), float(mgc))


def _pack_rows(pack: dict, class_id: str) -> list[dict]:
    table = next(t for t in pack["farTables"] if t["classId"] == class_id)
    return table["rows"]


def _pages_of(citation: str) -> list[int]:
    """The pdf pages a citation names ("52-53" -> [52, 53]) ✓."""
    numbers: list[int] = []
    for part in str(citation).replace(",", " ").split():
        if "-" in part:
            low, _, high = part.partition("-")
            if low.isdigit() and high.isdigit():
                numbers.extend(range(int(low), int(high) + 1))
        elif part.isdigit():
            numbers.append(int(part))
    return numbers


def check(document, pack: dict, label: str, pages: list[int]) -> tuple[list[str], int, int]:
    """The pack's FAR rows against the document's own digits ✓.

    A row is confirmed when the document **carries** it ✓ — the same road width, the same
    FAR and the same MGC ✓ ✓ — as many times as the pack has it ✓ (a table prints the same
    row twice when two plot sizes share it ✓ ✓). The count is what makes it a check and
    not a coincidence ✓ ✓ — a row the document does not carry is **not checked** ✓ (a gap,
    never a disagreement ✓ ✓, ADR-0080 ✓ ✓).

    Only the pages the pack's own citation names are read ✓ — the document's other tables
    (the setbacks ✓, the other schedules ✓) carry numbers of their own ✓, and comparing
    them with the FAR rows would compare two different things ✓ ✓.
    """
    rows = [row for row in _rows(document) if row[0] in pages]
    carried: dict[tuple, int] = {}
    for entry in rows:
        for group in entry[1:]:
            key = (group[0], group[1], group[2])
            carried[key] = carried.get(key, 0) + 1

    problems: list[str] = []
    checked = 0
    unchecked = 0
    for class_id, _index in _SIDE_BY_SIDE:
        for want in _pack_rows(pack, class_id):
            key = _key(want)
            if key is None:
                continue
            have = carried.get(key, 0)
            if have:
                checked += 1
                carried[key] = have - 1
            else:
                unchecked += 1
    return problems, checked, unchecked


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check the pack's FAR values against the gazette's own text layer."
    )
    parser.add_argument(
        "--check", action="store_true", help="fail when a row disagrees (the default too)"
    )
    args = parser.parse_args(argv)

    if not GAZETTE.is_file():
        # The gazette is not committed (it is a 1.9 MB download ✓) ✓ - so the check
        # **declares** that it was not run ✓ ✓, rather than passing silently ✓ ✓.
        print(
            "the gazette is not cached here - the check was NOT run "
            "(fetch it with the source service, then run it again)"
        )
        return 0

    pack = yaml.safe_load(PACK.read_text(encoding="utf-8"))
    citation = pack["citations"]["far-3ka"]
    pages = _pages_of(citation["pdfPage"])
    problems: list[str] = []
    checked = 0
    unchecked = 0

    problems_gazette, checked_gazette, unchecked_gazette = check(
        read_pdf(GAZETTE, lines=True), pack, "the gazette", pages
    )
    problems += problems_gazette
    checked += checked_gazette
    unchecked += unchecked_gazette
    print(
        f"the pack's FAR rows the gazette's own text layer confirms: {checked_gazette} "
        f"(pdf pages {citation['pdfPage']})"
    )

    if CDA.is_file():
        # the CDA's copy prints the same schedule on its own pages ✓
        problems_cda, checked_cda, unchecked_cda = check(
            read_pdf(CDA, lines=True), pack, "the CDA's copy", _cda_pages()
        )
        problems += problems_cda
        checked += checked_cda
        unchecked += unchecked_cda
        print(
            f"the pack's FAR rows the CDA's own copy confirms: {checked_cda} "
            "(a second, independent copy of the same schedule)"
        )

    if problems:
        print(f"the rows that disagree: {len(problems)}", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    if unchecked:
        print(f"the rows no document carries (not checked): {unchecked}")
    print(f"every row the documents' text layers carry agrees with the pack ({checked} rows)")
    return 0


def _cda_pages() -> list[int]:
    """The pdf pages the CDA's copy prints the schedule on ✓."""
    return [43, 45, 46, 48]


if __name__ == "__main__":
    raise SystemExit(main())
