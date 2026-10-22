"""A small PDF text reader (stdlib only) - the price lists have to be readable to be honest.

The SoR price lists are **text PDFs** (not scans), so the rates in them can be read and cited
by page. This module is the reader that does it, with no new dependency: the plan's rule is
that a number in a rate card carries its source, and the source here is a page of a PDF, so the
PDF has to be readable and the reading has to be repeatable.

What it does:

- finds the objects (the classic ``N G obj`` form **and** the compressed object streams a
  PDF 1.5 file keeps its objects in);
- walks the page tree, so the **page order** is the book's order, not the file's;
- decodes each page's content stream (Flate ✓) and reads the text-showing operators;
- maps the fonts through their **ToUnicode CMaps**, so Bangla and English come out as text
  rather than as glyph codes.

What it deliberately does not do: it does not interpret the layout, it does not guess, and it
does not produce rates. It reads the words on a page; a human (or an agent with the page in
front of it) decides what a line means, and the line cites the page it came from.
"""

from __future__ import annotations

import pathlib
import re
import zlib
from dataclasses import dataclass, field
from typing import Any


class PdfError(RuntimeError):
    """The PDF could not be read (never a silent gap)."""


@dataclass
class PdfPage:
    """One page: its number in the book and the text on it."""

    number: int
    text: str


@dataclass
class PdfDocument:
    """A PDF that has been read: its pages, and the text on them."""

    path: pathlib.Path
    pages: list[PdfPage] = field(default_factory=list)

    def page_text(self, number: int) -> str:
        for page in self.pages:
            if page.number == number:
                return page.text
        raise PdfError(f"the document has no page {number}")

    def find(self, needle: str, *, case_sensitive: bool = False) -> list[tuple[int, str]]:
        """The pages that contain the needle (the page number and the matching lines)."""
        hits: list[tuple[int, str]] = []
        for page in self.pages:
            haystack = page.text if case_sensitive else page.text.lower()
            if needle.lower() in haystack:
                for line in page.text.splitlines():
                    if needle.lower() in (line if case_sensitive else line.lower()):
                        hits.append((page.number, line.strip()))
        return hits


_OBJ_RE = re.compile(rb"(?<![0-9])(\d+)\s+(\d+)\s+obj\b")
_STREAM_RE = re.compile(rb"stream\r?\n")


def _decompress(data: bytes) -> bytes:
    """Flate-decompress a stream, tolerating the truncated tails some writers leave."""
    try:
        return zlib.decompress(data)
    except zlib.error:
        try:
            return zlib.decompressobj().decompress(data)
        except zlib.error as exc:
            raise PdfError(f"the stream did not decompress: {exc}") from exc


def _stream_bytes(raw: bytes) -> bytes | None:
    """The (decompressed) content of a stream inside an object, or None."""
    match = _STREAM_RE.search(raw)
    if not match:
        return None
    start = match.end()
    end = raw.find(b"endstream", start)
    if end < 0:
        end = len(raw)
    payload = raw[start:end]
    if b"FlateDecode" in raw[: match.start()]:
        try:
            return _decompress(payload)
        except PdfError:
            return None
    return payload


class _Pdf:
    """The parsed object store."""

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.objects: dict[int, bytes] = {}
        self._scan_plain_objects()
        self._scan_object_streams()

    def _scan_plain_objects(self) -> None:
        for match in _OBJ_RE.finditer(self.data):
            number = int(match.group(1))
            start = match.end()
            end = self.data.find(b"endobj", start)
            if end < 0:
                end = len(self.data)
            self.objects[number] = self.data[start:end]

    def _scan_object_streams(self) -> None:
        """PDF 1.5 keeps its objects inside compressed object streams."""
        for number, raw in list(self.objects.items()):
            if b"/ObjStm" not in raw:
                continue
            payload = _stream_bytes(raw)
            if payload is None:
                continue
            count = _int_value(raw, b"/N")
            first = _int_value(raw, b"/First")
            if count is None or first is None:
                continue
            header = payload[:first].split()
            pairs = [
                (int(header[index]), int(header[index + 1]))
                for index in range(0, min(len(header), count * 2), 2)
                if index + 1 < len(header)
            ]
            for index, (obj_number, offset) in enumerate(pairs):
                start = first + offset
                end = first + pairs[index + 1][1] if index + 1 < len(pairs) else len(payload)
                self.objects.setdefault(obj_number, payload[start:end])

    def get(self, number: int) -> bytes:
        if number not in self.objects:
            raise PdfError(f"the object {number} is not in the file")
        return self.objects[number]

    def resolve(self, value: str | bytes) -> bytes:
        """Follow an indirect reference (``N 0 R``) - or a bare object number - to its object."""
        text = value.decode("latin-1") if isinstance(value, bytes) else value
        match = re.match(r"\s*(\d+)\s+\d+\s+R", text)
        if match:
            return self.get(int(match.group(1)))
        if text.strip().isdigit():
            return self.get(int(text.strip()))
        raise PdfError(f"not an indirect reference: {text!r}")

    def stream(self, value: str | bytes) -> bytes:
        raw = self.resolve(value)
        payload = _stream_bytes(raw)
        if payload is None:
            raise PdfError("the object holds no stream")
        return payload


def _int_value(raw: bytes, key: bytes) -> int | None:
    match = re.search(re.escape(key) + rb"\s+(\d+)", raw)
    return int(match.group(1)) if match else None


def _dict_value(raw: bytes, key: bytes) -> str | None:
    match = re.search(re.escape(key) + rb"\s*(\d+)\s+\d+\s+R", raw)
    if match:
        return match.group(1).decode("ascii")
    match = re.search(re.escape(key) + rb"\s*/([^\s/>\]]+)", raw)
    if match:
        return "/" + match.group(1).decode("latin-1")
    return None


# --------------------------------------------------------------------- the fonts


def _parse_cmap(payload: bytes) -> dict[int, str]:
    """The ToUnicode CMap: the code points a font's glyphs stand for."""
    mapping: dict[int, str] = {}
    text = payload.decode("latin-1", errors="replace")

    def decode(value: str) -> str:
        try:
            return bytes.fromhex(value).decode("utf-16-be", errors="replace")
        except ValueError:
            return ""

    for block in re.findall(r"beginbfchar(.*?)endbfchar", text, re.S):
        for source, target in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            mapping[int(source, 16)] = decode(target)
    for block in re.findall(r"beginbfrange(.*?)endbfrange", text, re.S):
        for low, high, target in re.findall(
            r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block
        ):
            start, end = int(low, 16), int(high, 16)
            base = int(target, 16)
            for offset in range(end - start + 1):
                mapping[start + offset] = chr(base + offset)
    return mapping


# ----------------------------------------------------------------- the text stream


_TOKEN_RE = re.compile(
    rb"(?P<name>/[^\s/\[\]()<>{}]+)"  # a name, e.g. /F1
    rb"|(?P<number>-?\d+(?:\.\d+)?)"  # a number
    rb"|(?P<string>\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>)"  # a literal or hex string
    rb"|(?P<open>\[)"  # an array
    rb"|(?P<close>\])"  # the array's end
    rb"|(?P<other>[A-Za-z'\"*]+)",  # an operator
    re.S,
)


def _decode_string(token: bytes, cmap: dict[int, str]) -> str:
    if token.startswith(b"<"):
        hex_text = re.sub(rb"[^0-9A-Fa-f]", b"", token)
        if len(hex_text) % 2:
            hex_text += b"0"
        raw = bytes.fromhex(hex_text.decode("ascii"))
    else:
        body = token[1:-1]
        out = bytearray()
        index = 0
        while index < len(body):
            char = body[index : index + 1]
            if char == b"\\":
                nxt = body[index + 1 : index + 2]
                if nxt in b"nrtbf":
                    out.append({b"n": 10, b"r": 13, b"t": 9, b"b": 8, b"f": 12}[nxt])
                    index += 2
                    continue
                if nxt.isdigit():
                    octal = body[index + 1 : index + 4]
                    out.append(int(octal, 8) & 0xFF)
                    index += 4
                    continue
                out.append(nxt[0])
                index += 2
                continue
            out.append(char[0])
            index += 1
        raw = bytes(out)
    if not cmap:
        return raw.decode("latin-1", errors="replace")
    # A CID font's codes are two bytes each; a simple font's are one. The map tells us which:
    # if the single-byte reading is unknown and the length is even, the codes are pairs.
    single = all(code in cmap for code in raw)
    if not single and len(raw) % 2 == 0:
        pieces = []
        for index in range(0, len(raw), 2):
            code = (raw[index] << 8) | raw[index + 1]
            piece = cmap.get(code)
            pieces.append(piece if piece is not None else "")
        return "".join(pieces)
    pieces: list[str] = []
    for code in raw:
        piece = cmap.get(code)
        pieces.append(piece if piece is not None else chr(code))
    return "".join(pieces)


#: How far the text must move on the page before it counts as a new line (points).
_LINE_EPSILON = 0.5


def _numbers(stack: list[Any]) -> list[float]:
    """The numbers on an operator's stack, in the order they were written."""
    values: list[float] = []
    for kind, value in stack:
        if kind != "number":
            continue
        try:
            values.append(float(value))
        except (TypeError, ValueError):
            continue
    return values


def _page_text(
    content: bytes, cmaps: dict[str, dict[int, str]], *, lines: bool = False
) -> str:
    """The text of a content stream, with the words separated by spaces.

    With ``lines`` the page keeps its **lines** - a newline is written whenever the text
    moves to a different height on the page. That is the lightest reading of the layout:
    it says where one line ends and the next begins, and nothing about columns, tables or
    reading order. The default (``lines=False``) is the page's words run together, which is
    what the price cards are read with.
    """
    out: list[str] = []
    current: dict[int, str] = {}
    stack: list[Any] = []
    # The text position: the line start (what Td is relative to) and the current point.
    line_x = line_y = x = y = 0.0
    leading = 0.0
    last_y: float | None = None
    for match in _TOKEN_RE.finditer(content):
        if match.group("name"):
            stack.append(("name", match.group("name").decode("latin-1")))
        elif match.group("number"):
            stack.append(("number", match.group("number").decode("latin-1")))
        elif match.group("string"):
            stack.append(("string", match.group("string")))
        elif match.group("open"):
            stack.append(("array-start", None))
        elif match.group("close"):
            items: list[Any] = []
            while stack and stack[-1][0] != "array-start":
                items.append(stack.pop())
            stack.append(("array", list(reversed(items))))
        elif match.group("other"):
            operator = match.group("other").decode("latin-1")
            if operator == "BT":
                line_x = line_y = x = y = 0.0
                leading = 0.0
            elif operator in ("Td", "TD"):
                numbers = _numbers(stack)
                if len(numbers) >= 2:
                    line_x += numbers[-2]
                    line_y += numbers[-1]
                    x, y = line_x, line_y
                    if operator == "TD":
                        leading = -numbers[-1]
            elif operator == "Tm":
                numbers = _numbers(stack)
                if len(numbers) >= 6:
                    line_x = x = numbers[-2]
                    line_y = y = numbers[-1]
            elif operator == "TL":
                numbers = _numbers(stack)
                if numbers:
                    leading = numbers[-1]
            elif operator == "T*":
                line_y -= leading
                x, y = line_x, line_y
            elif operator == "Tf" and len(stack) >= 2:
                name = next(
                    (value for kind, value in reversed(stack) if kind == "name"), None
                )
                if name:
                    current = cmaps.get(name.lstrip("/"), {})
            elif operator in ("Tj", "'", '"'):
                if lines and last_y is not None and abs(y - last_y) > _LINE_EPSILON:
                    out.append("\n")
                for kind, value in reversed(stack):
                    if kind == "string":
                        out.append(_decode_string(value, current))
                        break
                last_y = y
            elif operator == "TJ":
                if lines and last_y is not None and abs(y - last_y) > _LINE_EPSILON:
                    out.append("\n")
                for kind, value in reversed(stack):
                    if kind == "array":
                        for element in value:
                            if element[0] == "string":
                                out.append(_decode_string(element[1], current))
                            elif element[0] == "number":
                                try:
                                    if float(element[1]) < -120:
                                        out.append(" ")
                                except ValueError:
                                    pass
                        break
                last_y = y
            stack.clear()
    return "".join(out)


def read_pdf(path: str | pathlib.Path, *, lines: bool = False) -> PdfDocument:
    """Read a PDF's pages and their text.

    With ``lines`` the pages keep their **lines** (a newline where the text moves down the
    page) - the BYO-PDF importer needs them, because a numbered provision opens a line
    (W4.7). The default is the page's words run together, which is what the price cards
    are read with.
    """
    data = pathlib.Path(path).read_bytes()
    if not data.startswith(b"%PDF"):
        raise PdfError(f"{path} is not a PDF")
    pdf = _Pdf(data)

    root = None
    for raw in pdf.objects.values():
        if b"/Type" in raw and b"/Catalog" in raw:
            root = raw
            break
    if root is None:
        raise PdfError("the PDF has no document catalog")
    pages_ref = _dict_value(root, b"/Pages")
    if pages_ref is None:
        raise PdfError("the PDF's catalog has no page tree")
    pages_root = pdf.resolve(pages_ref)

    # The page order, walked from the page tree.
    order: list[int] = []

    def walk(raw: bytes, number: int, depth: int = 0) -> None:
        if depth > 32:
            return
        if b"/Type" in raw and b"/Pages" in raw and b"/Kids" in raw:
            kids = re.search(rb"/Kids\s*\[(.*?)\]", raw, re.S)
            if not kids:
                return
            for child in re.findall(rb"(\d+)\s+\d+\s+R", kids.group(1)):
                walk(pdf.get(int(child)), int(child), depth + 1)
        elif b"/Type" in raw and b"/Page" in raw:
            order.append(number)

    walk(pages_root, -1)

    document = PdfDocument(path=pathlib.Path(path))
    for index, page_number in enumerate(order, start=1):
        raw = pdf.get(page_number)
        content = b""
        contents = re.search(rb"/Contents\s*(?:(\d+)\s+\d+\s+R|\[(.*?)\])", raw, re.S)
        if contents:
            try:
                if contents.group(1):
                    content = pdf.stream(contents.group(1).decode("ascii"))
                elif contents.group(2):
                    pieces = []
                    for number in re.findall(rb"(\d+)\s+\d+\s+R", contents.group(2)):
                        pieces.append(pdf.stream(number.decode("ascii")))
                    content = b"\n".join(pieces)
            except PdfError:
                # A page whose content stream will not decompress: the page reads empty
                # rather than taking the whole book down.
                content = b""
        # The page's fonts, and their ToUnicode maps.
        cmaps: dict[str, dict[int, str]] = {}
        resources = re.search(rb"/Resources\s*(?:(\d+)\s+\d+\s+R|<<)", raw)
        resources_raw = raw
        if resources and resources.group(1):
            try:
                resources_raw = pdf.get(int(resources.group(1)))
            except PdfError:
                resources_raw = raw
        fonts = re.search(rb"/Font\s*(?:(\d+)\s+\d+\s+R|<<)", resources_raw)
        block = b""
        if fonts and fonts.group(1):
            # The font dictionary is an indirect object (a PDF that keeps it aside): its
            # body is the name -> font map.
            try:
                block = pdf.get(int(fonts.group(1)))
            except PdfError:
                block = b""
        else:
            font_map = re.search(rb"/Font\s*<<(.*?)>>", resources_raw, re.S)
            if font_map:
                block = font_map.group(1)
        for name, number in re.findall(rb"/([^\s/]+)\s+(\d+)\s+\d+\s+R", block):
            try:
                font_raw = pdf.get(int(number))
            except PdfError:
                # A font the file points at but does not carry: the page still reads.
                continue
            to_unicode = _dict_value(font_raw, b"/ToUnicode")
            if to_unicode is None:
                continue
            try:
                cmaps[name.decode("latin-1")] = _parse_cmap(pdf.stream(to_unicode))
            except PdfError:
                continue
        text = _page_text(content, cmaps, lines=lines)
        document.pages.append(PdfPage(number=index, text=text))
    return document


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Read a PDF's pages (stdlib only).")
    parser.add_argument("pdf")
    parser.add_argument("--pages", help="the pages to print, e.g. 1-5,12")
    parser.add_argument("--find", help="print the pages and lines that contain this text")
    parser.add_argument("--page", type=int, help="print one page's text")
    args = parser.parse_args()

    document = read_pdf(args.pdf)
    if args.find:
        for number, line in document.find(args.find)[:80]:
            print(f"[p{number}] {line[:200]}")
        return 0
    if args.page:
        print(document.page_text(args.page))
        return 0
    if args.pages:
        start, _, end = args.pages.partition("-")
        low = int(start)
        high = int(end or start)
        for number in range(low, high + 1):
            print(f"===== page {number} =====")
            print(document.page_text(number)[:4000])
        return 0
    print(f"{len(document.pages)} pages")
    for page in document.pages[:3]:
        print(f"===== page {page.number} =====")
        print(page.text[:1500])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
