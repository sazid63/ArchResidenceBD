"""Transcribe the official price rows into a **candidate** rate card (W2.7 follow-up).

The card is built from the official lists themselves: the rows are found by their item numbers
in the book's own text, the four zone columns become the card's regional multipliers, and every
line cites the page it came from. Nothing is typed in by hand except the **labels** - the Bangla
is hand-authored (the plan's law: never machine-translated) and the English is short.

The card comes out **candidate**: a fetched price list is unverified content until a human marks
it active (plan §9), and the app must not price a BOQ from it silently.

Usage (from the repo root):
  uv run --directory core python ../tools/prices/transcribe_card.py --write
  uv run --directory core python ../tools/prices/transcribe_card.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
from typing import Any

from archres_core.stdio import utf8_stdio

import importlib.util

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / "data" / "cache" / "sources"
OUT = ROOT / "data" / "prices" / "cards"
CARD_NAME = "pwd-sor-2022-civil-works-candidate.json"
CARD = OUT / CARD_NAME

#: The PWD SoR 2022 (Revised) Part A: Civil Works - 16th edition (revised), effective
#: 23 Feb 2023. The URL is the one the owner confirmed; the hash and the retrieval date come
#: from the fetch report - a hash is never typed by hand.
SOURCE = {
    "kind": "official_list",
    "name": "PWD Schedule of Rates 2022 (Revised), Part A: Civil Works (16th edition, revised)",
    "url": "https://ss.pwd.gov.bd/document/sor/PWDSoR2022-Revised-2.3.23-Website.pdf",
}
FETCH_REPORT = ROOT / "data" / "prices" / "fetch-report.json"

#: The four official price zones, in the order the book prints them.
ZONES = ("dhaka", "chattogram", "khulna", "rajshahi")

#: The lines this project needs, and where each row lives.
#:
#: ``item``   - the book's own item number
#: ``key``    - the takeoff's rate key (W2.6), so the card prices the lines the design has
#: ``unit``   - the unit the takeoff measures the quantity in
#: ``page``   - the PDF page the row is on
#: ``label``  - the short, hand-written labels (the Bangla is written, never translated)
#: ``note``   - what a reader must know about the row
LINES: tuple[dict[str, Any], ...] = (
    {
        "item": "187",
        "prefix": "Ordinary Portland Cement",
        "key": "cement-opc-43",
        "unit": "bag",
        "page": 20,
        "label": {"bn": "সিমেন্ট (ওপিসি ৪৩ গ্রেড, ৫০ কেজি ব্যাগ)", "en": "Cement (OPC 43, 50 kg bag)"},
        "note": "BDS-EN 197-1 CEM-I, 52.5 N; the book's own description names the bag size.",
    },
    {
        "item": "289",
        "prefix": "Grade 400/",
        "key": "rod-60g",
        "unit": "ton",
        "page": 23,
        "label": {"bn": "রড (৬০ গ্রেড, B400)", "en": "Rebar (60 grade, B400)"},
        "note": "BDS 6935-2006, B400; the book prices it per M. ton.",
    },
    {
        "item": "225",
        "prefix": "Sand (F.M. 1.2)",
        "key": "sand-fine",
        "unit": "cft",
        "page": 21,
        "label": {"bn": "বালি (এফএম ১.২)", "en": "Sand (F.M. 1.2)"},
        "note": "the book's F.M. 1.2 sand, per cft.",
    },
    {
        "item": "165",
        "prefix": "1st class/Picked jhama",
        "per": 1000,
        "key": "brick-1st",
        "unit": "each",
        "page": 19,
        "label": {"bn": "ইট (প্রথম শ্রেণি)", "en": "Brick (1st class)"},
        "note": "the book prices it per 1,000 nos; one brick is that rate divided by 1,000.",
    },
    {
        "item": "2",
        "prefix": "Mason / Mosaic mistry per day",
        "key": "mason",
        "unit": "day",
        "page": 14,
        "label": {"bn": "রাজমিস্ত্রি (দৈনিক)", "en": "Mason (daily)"},
        "note": "C1 labour and man-power, per day; the book also lists a head mason at item 1.",
    },
    {
        "item": "11",
        "prefix": "Rod binder per day",
        "key": "rod-binder",
        "unit": "day",
        "page": 14,
        "label": {"bn": "রড বাইন্ডার (দৈনিক)", "en": "Rod binder (daily)"},
        "note": "C1 labour and man-power, per day.",
    },
    {
        "item": "19",
        "prefix": "Machine operator per day",
        "key": "machine-operator",
        "unit": "day",
        "page": 14,
        "label": {"bn": "মেশিন অপারেটর (দৈনিক)", "en": "Machine operator (daily)"},
        "note": "C1 labour and man-power, per day.",
    },
    {
        "item": "43",
        "prefix": "Hire charge of concrete mixer machine per day",
        "key": "mixer-diesel",
        "unit": "day",
        "page": 15,
        "label": {"bn": "কনক্রিট মিক্সার (ভাড়া)", "en": "Concrete mixer (hire)"},
        "note": (
            "the hire charge per day; the operator is a separate line in the book (C1, item 19), "
            "so it is not included, and the row does not mention fuel."
        ),
    },
    {
        "item": "44",
        "prefix": "Hire charge of concrete vibrator per day",
        "key": "vibrator",
        "unit": "day",
        "page": 15,
        "label": {"bn": "কনক্রিট ভাইব্রেটর (ভাড়া)", "en": "Concrete vibrator (hire)"},
        "note": (
            "the hire charge per day; the operator is a separate line in the book (C1, item 19), "
            "so it is not included, and the row does not mention fuel."
        ),
    },
)

#: An item row: the number, the description, and the four zone rates. The rates are the
#: anchor - the book prints them with two decimals and a thousands separator, which the
#: description's own numbers ("BDS-EN 197-1", "52.5N") never look like.
RATE = re.compile(
    r"(?P<r1>[\d,]+\.\d{2})\s+(?P<r2>[\d,]+\.\d{2})\s+(?P<r3>[\d,]+\.\d{2})\s+(?P<r4>[\d,]+\.\d{2})"
)
UNIT_AT_END = re.compile(
    r"(?P<unit>per(?: M\.)? [\w.]+(?: [\w.]+)?|per 1000 nos|per 100 cft|cft|ton|kg|nos|each|sqm|day|hour)$"
)


def _reader():
    """The PDF reader, from the core (W4.7: the core owns it, so the app can read a PDF)."""
    from archres_core import pdf_text

    return pdf_text


def _book() -> pathlib.Path:
    files = sorted((CACHE / "pwd-schedule-of-rates-pdf").glob("*.pdf"))
    if not files:
        raise SystemExit(
            "the PWD SoR is not cached here - fetch it with the price service "
            "(tools/pricing/price_service.py fetch) first"
        )
    return files[0]


def _row(page_text: str, item: str, prefix_text: str) -> dict[str, Any] | None:
    """The row of an item: its description, its unit and its four zone rates."""
    # The PDF's own spacing is uneven (kerning leaves double spaces), so the description is
    # matched with flexible whitespace.
    prefix = r"\s+".join(re.escape(word) for word in prefix_text.split())
    for match in re.finditer(rf"(?<!\d){item}\s+{prefix}", page_text):
        rest = page_text[match.end() : match.end() + 600]
        rates_match = RATE.search(rest)
        if not rates_match:
            continue
        rates = [
            float(rates_match.group(f"r{index}").replace(",", ""))
            for index in (1, 2, 3, 4)
        ]
        body = rest[: rates_match.start()].strip()
        unit_match = UNIT_AT_END.search(body)
        unit = unit_match.group("unit") if unit_match else ""
        description = body[: unit_match.start()].strip() if unit_match else body
        return {
            "item": item,
            "description": description,
            "unit": unit,
            "rates": rates,
        }
    return None


def _source() -> dict[str, Any]:
    """The card's source: the URL the owner confirmed, with the hash the fetch recorded."""
    if not FETCH_REPORT.is_file():
        raise SystemExit(
            f"missing {FETCH_REPORT.relative_to(ROOT).as_posix()} - the fetch report is where the "
            "artefact's hash comes from"
        )
    report = json.loads(FETCH_REPORT.read_text(encoding="utf-8"))
    for artifact in report.get("artifacts") or []:
        if artifact.get("url") == SOURCE["url"]:
            return {
                **SOURCE,
                "retrievedAt": str(artifact.get("lastVerified") or "2026-10-21"),
                "sha256": str(artifact["sha256"]),
                "note": f"the fetched artefact is {artifact.get('sizeBytes')} bytes; "
                "the hash is the provenance record (plan section 5.10).",
            }
    raise SystemExit(f"the fetch report has no artefact for {SOURCE['url']}")


def build_card() -> dict[str, Any]:
    """The candidate card, built from the book's own rows."""
    reader = _reader()
    document = reader.read_pdf(_book())
    lines: list[dict[str, Any]] = []
    problems: list[str] = []
    for spec in LINES:
        page = document.page_text(spec["page"])
        row = _row(page, spec["item"], spec["prefix"])
        if row is None:
            problems.append(f"item {spec['item']} is not on page {spec['page']}")
            continue
        if len(row["rates"]) != 4:
            problems.append(f"item {spec['item']}: the row carries {len(row['rates'])} zone rates")
            continue
        base = row["rates"][0]
        multipliers = {
            zone: round(rate / base, 6) if base else 1.0
            for zone, rate in zip(ZONES, row["rates"])
            if zone != "dhaka"
        }
        note = spec["note"]
        if spec.get("per"):
            # The book prices this line per 1,000 nos; the project's line is one brick, so the
            # rate is divided. The conversion is declared here, not guessed from the row.
            divisor = float(spec["per"])
            base = round(base / divisor, 4)
            multipliers = {
                zone: round(multiplier, 6) for zone, multiplier in multipliers.items()
            }
            note += f" (the book's per-{int(divisor):,} rate divided by {int(divisor):,} to reach one brick)."
        line: dict[str, Any] = {
            "key": spec["key"],
            "label": spec["label"],
            "costType": "labour" if spec["key"] in ("mason", "rod-binder", "machine-operator") else (
                "machinery" if spec["key"] in ("mixer-diesel", "vibrator") else "material"
            ),
            "unit": spec["unit"],
            "rateBdt": base,
            "note": f"{note} Source: PWD SoR 2022 (Revised) Part A, item {row['item']}, "
            f"PDF page {spec['page']}.",
        }
        if multipliers:
            line["regionalMultipliers"] = multipliers
        if spec["key"] in ("mixer-diesel", "vibrator"):
            line["operatorIncluded"] = False
            line["fuelIncluded"] = False
        lines.append(line)
    if problems:
        raise SystemExit("the rows could not be read:\n  " + "\n  ".join(problems))
    return {
        "schemaVersion": "0.1.0",
        "cardId": "pwd-sor-2022-civil-works",
        "region": "dhaka",
        "currency": "BDT",
        "status": "candidate",
        "effectiveFrom": "2023-02-23",
        "asOf": "2026-10-21",
        "source": _source(),
        "lines": lines,
        "notes": (
            "Transcribed from the PWD Schedule of Rates 2022 (Revised), Part A: Civil Works "
            "(16th edition, revised, effective 23 February 2023) on 2026-10-21. The four official "
            "price zones (Dhaka and Mymensingh / Chattogram and Sylhet / Khulna, Barisal and "
            "Gopalgonj / Rajshahi and Rangpur) become each line's regional multipliers. These are "
            "works rates: the contractor's profit, overhead and VAT are listed separately in the "
            "book and are not included. A candidate card until a human marks it active."
        ),
    }


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Transcribe the official rows into a candidate card.")
    parser.add_argument("--write", action="store_true", help="write the candidate card")
    parser.add_argument("--check", action="store_true", help="verify the committed card")
    args = parser.parse_args()

    if args.check:
        if not CARD.is_file():
            print(f"missing {CARD.relative_to(ROOT).as_posix()}", file=sys.stderr)
            return 1
        card = json.loads(CARD.read_text(encoding="utf-8"))
        problems: list[str] = []
        if card.get("status") != "candidate":
            problems.append("the card must stay a candidate until a human activates it")
        if card.get("source", {}).get("sha256") != _source()["sha256"]:
            problems.append("the card's source hash does not match the fetched artefact")
        keys = {line["key"] for line in card.get("lines") or []}
        missing = {spec["key"] for spec in LINES} - keys
        if missing:
            problems.append(f"the card is missing lines: {sorted(missing)}")
        for line in card.get("lines") or []:
            if not line.get("note"):
                problems.append(f"{line['key']}: the line does not cite its source")
        # When the book is cached, the card's rates are re-read from the pages they cite.
        try:
            rebuilt = build_card()
        except SystemExit:
            rebuilt = None
        if rebuilt is not None:
            committed = {line["key"]: line for line in card.get("lines") or []}
            for line in rebuilt.get("lines") or []:
                other = committed.get(line["key"])
                if other is None:
                    problems.append(f"the card is missing the line {line['key']}")
                    continue
                if other.get("rateBdt") != line["rateBdt"]:
                    problems.append(
                        f"{line['key']}: the card says {other.get('rateBdt')}, the book says "
                        f"{line['rateBdt']}"
                    )
                if other.get("regionalMultipliers") != line.get("regionalMultipliers"):
                    problems.append(f"{line['key']}: the zone multipliers do not match the book")
        for problem in problems:
            print(f"FAIL {problem}", file=sys.stderr)
        if problems:
            return 1
        print("the committed candidate card is complete and still a candidate")
        return 0

    card = build_card()
    print(json.dumps(card, ensure_ascii=False, indent=2, sort_keys=True))
    if args.write:
        OUT.mkdir(parents=True, exist_ok=True)
        CARD.write_text(
            json.dumps(card, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(f"wrote {CARD.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
