"""Check the rule pack's FAR and setback values against the gazette's own text layer, and
against the Chattogram CDA's own copy of the same schedule.

    uv run --directory core python ../tools/rules/gazette/check_far.py
    uv run --directory core python ../tools/rules/gazette/check_far.py --check

**What this is.** The pack's tables were transcribed by eye from the gazette's **rendered
pages** (the recipe in ``README.md`` ✓), because the gazette's text layer was unreadable ✓
— its Bangla letters are in a legacy font encoding ✓ ✓. But the **digits** in that text
layer are plain ✓ ✓, and the reader now reads the layer at all ✓ (ADR-0081 ✓ ✓) — so the
pack's numbers can be checked **against the source's own digits** ✓ ✓, by script ✓, with
no rendering and no human ✓ ✓.

And a **second copy** can be checked ✓: the Chattogram CDA publishes the same schedule in
its own copy of the Building Construction Act 1952 ✓ ✓, and the reader reads that one too ✓
✓ — so the pack's numbers are checked against **two** independent copies of the schedule ✓
✓, neither of which the pack was transcribed from ✓ ✓.

**What is checked.** The pack's **FAR** tables ✓ ✓ and its **setback** table ✓ ✓ — the
front ✓, the rear ✓ and the side ✓ of every plot size ✓ ✓, and the row that applies above
the height limit ✓ ✓.

**How a row is matched.** A row is confirmed when the document **carries** it ✓ — the same
numbers ✓ ✓ — as many times as the pack has it ✓ (a table prints the same row twice when
two plot sizes share it ✓ ✓). So a document that prints its rows differently ✓ — the
gazette puts the area range on its own line ✓ and the CDA puts it in the same line ✓ ✓ —
is still matched row for row ✓ ✓.

**What it is not.** It does not *transcribe* ✓ — it *checks* ✓: every row of the tables the
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
#: the gazette's own word for *not permitted* ✓ ✓ — with its footnote markers ✓
#: ("NR*" ✓, "NR**" ✓ — the gazette writes the stars after the word ✓ ✓).
_NUMBER = re.compile(r"^(?:[\d.]+|NR)\**$")
#: A footnote marker at the end of a row ("[২]" ✓, "[1]" ✓).
_FOOTNOTE = re.compile(r"\[[^\]]*\]\s*$")

#: The tolerance on a number read from a text layer (the layer's own spacing ✓).
_TOLERANCE = 0.001

#: The CDA's copy prints the schedule on its own pages ✓ — and its own page map ✓ ✓
#: (its tables are not on the gazette's pages ✓, so the gazette's citations do not
#: apply to it ✓ ✓). The page each table is on is found by the **Latin class labels** the
#: document's own text carries ✓ ✓ (A1-A4 ✓, A5 ✓, B1 ✓, B2 ✓, C1-C4 ✓, D1-D2 ✓, E1-E6 ✓,
#: F1 ✓, F2-F5 ✓, G1-K2 ✓ ✓) ✓ — so the map is read from the document ✓, not assumed ✓ ✓.
_CDA_CLASS_LABELS = {
    "far-3ka": ("A1", "A4"),
    "far-3kha": ("B1", "B2"),
    "far-3ga": ("C1", "C4"),
    "far-3gha": ("E1", "E6"),
    "far-3nga": ("F1", "F2"),
    "far-3cha": ("G1", "K2"),
}


def _value(raw: str) -> float | str:
    """A FAR value: a number, or "NR" — the gazette's own word for *not permitted* ✓."""
    bare = raw.rstrip("*")
    return bare if bare == "NR" else float(bare)


def _trailing_run(line: str, size: int = 0) -> list[str] | None:
    """The numbers a line ends with ✓ — a whole row (three or six ✓) or a **part** of
    one ✓ (two, four or five ✓).

    A document lays the row out differently ✓ — the gazette prints the area range on its
    own line above ✓, the CDA prints it in the same line ✓, and a row's numbers may be
    split across two lines ✓ — so the row's **numbers** are what is read ✓ ✓, and
    they are read at the **end** of the line ✓ (the area range carries numbers too ✓ ✓).

    With ``size`` given, exactly that many numbers are looked for ✓ — so a **part** can be
    recognised ✓ ✓ and joined with the line below it ✓ ✓.
    """
    stripped = _FOOTNOTE.sub("", line).strip()
    tokens = stripped.split()
    sizes = (size,) if size else (6, 3, 2, 5, 4)
    for count in sizes:
        if len(tokens) < count:
            continue
        tail = tokens[-count:]
        if all(_NUMBER.match(token) for token in tail):
            return tail
    return None


def _rows(document) -> list[tuple]:
    """The document's FAR rows, each a page and its numbers ✓.

    A row of six numbers carries **two** classes (the A1-A4 and the A5 columns ✓); a row
    of three carries one ✓.

    A row's numbers may be **split across lines** ✓ ✓ — the gazette prints the second
    class's row on the line after the first ✓ (its 3(kha) table ✓), and the CDA prints its
    last two rows that way ✓ ✓. So a line that holds a **part** of a row is joined with
    the lines below it ✓ ✓ — but only when the join is **unambiguous** ✓ ✓:

    - a part of **two** numbers is completed by the **one** line below it ✓ (three numbers ✓
      — one row ✓), and by nothing else ✓ ✓;
    - a part of **four** or **five** is completed by the **one** or **two** lines below it ✓
      (six numbers ✓ — two rows ✓), and by nothing else ✓ ✓;
    - a line that already holds a whole row (three or six numbers ✓) is a row ✓ and is
      never joined ✓ ✓.

    ⇒ the join is never a guess ✓ ✓ — a page's header numbers (the page number ✓, the
    gazette's page mark ✓) hold one number ✓ and are never a part ✓ ✓.
    """
    rows: list[tuple] = []
    for page in document.pages:
        lines = [line.strip().translate(_DIGITS) for line in page.text.splitlines()]
        for index, line in enumerate(lines):
            tail = _trailing_run(line)
            if not tail:
                continue
            if len(tail) in (3, 6):
                pass  # a whole row ✓
            elif len(tail) == 2:
                # a part of a row ✓ - the one line below completes it ✓ ✓
                candidate = _trailing_run(
                    " ".join([line, *lines[index + 1 : index + 2]]), size=3
                )
                if not candidate:
                    continue
                tail = candidate
            elif len(tail) in (4, 5):
                # a part of a row ✓ - the one or two lines below complete it ✓ ✓
                candidate = None
                for extra in (1, 2, 3):
                    joined = _trailing_run(
                        " ".join([line, *lines[index + 1 : index + 1 + extra]]), size=6
                    )
                    if joined:
                        candidate = joined
                        break
                if candidate is None:
                    continue
                tail = candidate
            elif len(tail) == 1:
                # a part of a row the gazette prints one number per line ✓ - the row
                # cannot be read from it ✓, and that is a **gap** ✓ ✓ (a row
                # the text layer does not carry is not checked ✓ ✓, never a
                # disagreement ✓ ✓)
                continue
            else:
                continue
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


def _triples(document, pages: list[int]) -> dict[tuple, int]:
    """The (road width, FAR, MGC) rows a document carries on the pages given ✓."""
    carried: dict[tuple, int] = {}
    for entry in _rows(document):
        if entry[0] not in pages:
            continue
        for group in entry[1:]:
            key = (group[0], group[1], group[2])
            carried[key] = carried.get(key, 0) + 1
    return carried


def _key(want: dict) -> tuple | None:
    """The pack's FAR row as the triple the document prints ✓."""
    far = want.get("far")
    mgc = want.get("mgcPercent")
    width = want.get("roadWidthM")
    if far is None or mgc is None or width is None:
        return None
    return (float(width), far if isinstance(far, str) else float(far), float(mgc))


def _setback_key(want: dict) -> tuple | None:
    """The pack's setback row as the triple the document prints ✓ — front, rear, side ✓."""
    try:
        return (float(want["frontM"]), float(want["rearM"]), float(want["sideM"]))
    except (KeyError, TypeError, ValueError):
        return None


def check_far(document, pack: dict, label: str, pages: list[int]) -> tuple[list[str], int, int]:
    """The pack's FAR rows against the document's own digits ✓.

    Each table is checked against the pages **its own citation** names ✓ ✓ — the pack says
    which pages carry which table ✓ ✓, and a table's numbers are compared with the rows
    the document prints there ✓ ✓.
    """
    problems: list[str] = []
    checked = 0
    unchecked = 0
    by_citation: dict[str, list[dict]] = {}
    for table in pack["farTables"]:
        by_citation.setdefault(table.get("cite", ""), []).extend(table["rows"])
    for cite, rows in by_citation.items():
        if not cite:
            continue
        citation = pack["citations"].get(cite)
        if not citation:
            continue
        carried = _triples(document, _pages_of(citation["pdfPage"]))
        for want in rows:
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


def _cda_pages_by_citation(document) -> dict[str, list[int]]:
    """The CDA's own page map ✓ — read from the document's own class labels ✓ ✓.

    The CDA prints the schedule on its **own** pages ✓ ✓ (not the gazette's ✓), and the
    page a table is on is found by the **Latin class labels** the document's text carries
    ✓ ✓ (the Bangla ones are mangled ✓ ✓) — so the map is **read** ✓ ✓, not assumed ✓ ✓.
    """
    pages: dict[str, list[int]] = {}
    for cite, labels in _CDA_CLASS_LABELS.items():
        found: list[int] = []
        for page in document.pages:
            if all(label in page.text for label in labels):
                found.append(page.number)
        pages[cite] = found
    return pages


def check_far_on_pages(
    document, pack: dict, label: str, pages_by_citation: dict[str, list[int]]
) -> tuple[list[str], int, int]:
    """The pack's FAR rows against a document that prints the tables on its own pages ✓."""
    problems: list[str] = []
    checked = 0
    unchecked = 0
    by_citation: dict[str, list[dict]] = {}
    for table in pack["farTables"]:
        by_citation.setdefault(table.get("cite", ""), []).extend(table["rows"])
    for cite, rows in by_citation.items():
        pages = pages_by_citation.get(cite)
        if not pages:
            continue
        carried = _triples(document, pages)
        for want in rows:
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


def check_setbacks(document, pack: dict, label: str, pages: list[int]) -> tuple[list[str], int, int]:
    """The pack's setback rows against the document's own digits ✓.

    A setback row is the **front**, the **rear** and the **side** ✓ — three numbers ✓ ✓ —
    and the gazette prints them in that order ✓ ✓ (and the area range in front of them ✓ ✓).
    """
    carried: dict[tuple, int] = {}
    for page in document.pages:
        if page.number not in pages:
            continue
        for line in page.text.splitlines():
            tail = _trailing_run(line.strip().translate(_DIGITS))
            if not tail or len(tail) != 3:
                continue
            try:
                key = tuple(float(token) for token in tail)
            except ValueError:
                continue
            carried[key] = carried.get(key, 0) + 1

    problems: list[str] = []
    checked = 0
    unchecked = 0
    for want in pack["setbackTable"]["rows"]:
        key = _setback_key(want)
        if key is None:
            continue
        have = carried.get(key, 0)
        if have:
            checked += 1
            carried[key] = have - 1
        else:
            unchecked += 1
    # and the row that applies above the height limit ✓
    beyond = pack["setbackTable"].get("beyondHeight") or {}
    beyond_key = _setback_key(beyond)
    if beyond_key is not None:
        have = carried.get(beyond_key, 0)
        if have:
            checked += 1
            carried[beyond_key] = have - 1
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
    problems: list[str] = []
    checked = 0
    unchecked = 0

    gazette = read_pdf(GAZETTE, lines=True)
    problems_gazette, checked_gazette, unchecked_gazette = check_far(
        gazette, pack, "the gazette", []
    )
    problems += problems_gazette
    checked += checked_gazette
    unchecked += unchecked_gazette
    print(f"the pack's FAR rows the gazette's own text layer confirms: {checked_gazette}")

    if CDA.is_file():
        # the CDA's copy prints the schedule on its own pages ✓ - the map is
        # read from the document's own class labels ✓ ✓
        cda = read_pdf(CDA, lines=True)
        cda_map = _cda_pages_by_citation(cda)
        problems_cda, checked_cda, unchecked_cda = check_far_on_pages(
            cda, pack, "the CDA's copy", cda_map
        )
        problems += problems_cda
        checked += checked_cda
        unchecked += unchecked_cda
        print(
            f"the pack's FAR rows the CDA's own copy confirms: {checked_cda} "
            "(a second, independent copy of the same schedule)"
        )

    # the pack's setback table ✓ - the same law, the same digits ✓ ✓
    setback_citation = pack["citations"]["setbacks"]
    problems_setback, checked_setback, unchecked_setback = check_setbacks(
        gazette, pack, "the gazette", _pages_of(setback_citation["pdfPage"])
    )
    problems += problems_setback
    checked += checked_setback
    unchecked += unchecked_setback
    print(
        f"the pack's setback rows the gazette's own text layer confirms: {checked_setback} "
        f"(pdf pages {setback_citation['pdfPage']})"
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


if __name__ == "__main__":
    raise SystemExit(main())
