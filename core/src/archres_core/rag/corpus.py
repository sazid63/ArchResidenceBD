"""Clause corpus (W1.1): the rule pack turned into retrievable, cited documents.

The corpus is **generated data**, not hand-written prose: every document is derived from
``spec/rules/<pack>.yaml`` (the only home for rule numbers and clause text) and carries the
gazette citation of the entity it came from. Two honesty rules are enforced at build time:

* **No document without a citation** - a provision/table/footnote document whose ``cite``
  key does not resolve in the pack's ``citations`` map is a build error, never a document
  with an empty citation.
* **No silent corpus gaps** - the reference set is declared in ``spec/rag/sources.yaml``;
  every declared source that is not ingested is listed in the manifest and in
  :attr:`Corpus.missing` with a reason.

``textKind`` says what the words are: ``gazette_quote`` (transcribed gazette text),
``pack_summary`` (our own summary of the provision, numbers pinned by the pack),
``pack_note`` (an explanatory note) or ``declared_gap`` (a known unreadable/untranscribed
item - never retrievable as law). The RAG consumer must never present a summary as the
gazette's wording; the citation says what was read and where.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
from dataclasses import dataclass, field
from typing import Any, Iterable

import yaml

from ..compliance.pack import RulePackError, load_pack, pack_sha256

CORPUS_VERSION = "build_rag_corpus-0.1.0"
SCHEMA_VERSION = "0.1.0"
LANGS = ("bn", "en")

TEXT_KINDS = ("gazette_quote", "pack_summary", "pack_note", "declared_gap")
DOC_KINDS = (
    "provision",
    "far_table",
    "setback_table",
    "parking_schedule",
    "parking_row",
    "parking_note",
    "geometry_rule",
    "footnote",
    "declared_gap",
)

_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


class RagError(ValueError):
    """The corpus, a retrieval request or a model call cannot be served as asked."""


def bn_digits(value: Any) -> str:
    """ASCII digits -> Bengali digits (display only; retrieval normalises back)."""
    return str(value).translate(_BN_DIGITS)


def _num(value: Any) -> str:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value)


def _far_by_road(rows: list[dict[str, Any]], lang: str) -> str:
    """Compact ``6 m: 3.15-4.25; 9 m: 4.5-5.25`` label so road-width queries can hit."""
    grouped: dict[float, list[float]] = {}
    for row in rows:
        width = row.get("roadWidthM")
        far = row.get("far")
        if width is None or far is None:
            continue
        try:
            grouped.setdefault(float(width), []).append(float(far))
        except (TypeError, ValueError):
            continue
    parts = []
    for width in sorted(grouped):
        label = _fmt_range(grouped[width], lang)
        width_text = bn_digits(_num(width)) if lang == "bn" else _num(width)
        parts.append(f"{width_text} {'মি.' if lang == 'bn' else 'm'}: {label}")
    return "; ".join(parts)


def _fmt_range(values: Iterable[Any], lang: str) -> str:
    """Numeric min-max label; non-numeric table cells (e.g. "NR") are skipped."""
    numeric: list[float] = []
    for value in values:
        if isinstance(value, bool):
            continue
        try:
            numeric.append(float(value))
        except (TypeError, ValueError):
            continue
    if not numeric:
        return ""
    low, high = _num(min(numeric)), _num(max(numeric))
    low, high = (bn_digits(low), bn_digits(high)) if lang == "bn" else (low, high)
    return low if low == high else f"{low}–{high}"


@dataclass(frozen=True)
class ClauseDoc:
    """One retrievable clause-level document."""

    id: str
    kind: str
    lang: str
    entity_id: str
    clause: str
    title: str
    text: str
    text_kind: str
    citation: dict[str, Any] | None
    pack_id: str
    pack_version: str
    pack_sha256: str
    refs: tuple[str, ...] = ()
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def corpus_key(self) -> tuple[str, str, str]:
        return (self.pack_id, self.pack_version, self.pack_sha256)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "lang": self.lang,
            "entityId": self.entity_id,
            "clause": self.clause,
            "title": self.title,
            "text": self.text,
            "textKind": self.text_kind,
            "citation": self.citation,
            "packId": self.pack_id,
            "packVersion": self.pack_version,
            "packSha256": self.pack_sha256,
            "refs": list(self.refs),
            "meta": self.meta,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ClauseDoc":
        return cls(
            id=data["id"],
            kind=data["kind"],
            lang=data["lang"],
            entity_id=data.get("entityId", ""),
            clause=data.get("clause", ""),
            title=data.get("title", ""),
            text=data["text"],
            text_kind=data["textKind"],
            citation=data.get("citation"),
            pack_id=data["packId"],
            pack_version=data["packVersion"],
            pack_sha256=data["packSha256"],
            refs=tuple(data.get("refs") or ()),
            meta=dict(data.get("meta") or {}),
        )


@dataclass(frozen=True)
class Corpus:
    """A pinned corpus: documents plus the coverage it can honestly claim."""

    pack_id: str
    pack_version: str
    pack_sha256: str
    docs: tuple[ClauseDoc, ...]
    sources: tuple[dict[str, Any], ...]
    missing: tuple[dict[str, Any], ...]
    coverage: dict[str, Any]
    manifest: dict[str, Any] | None = None

    @property
    def sha256(self) -> str:
        return hashlib.sha256(corpus_bytes(self.docs)).hexdigest()

    def by_id(self) -> dict[str, ClauseDoc]:
        return {doc.id: doc for doc in self.docs}

    def languages(self) -> tuple[str, ...]:
        return tuple(sorted({doc.lang for doc in self.docs}))

    def counts(self) -> dict[str, dict[str, int]]:
        return {
            "byKind": _count(doc.kind for doc in self.docs),
            "byLang": _count(doc.lang for doc in self.docs),
            "byTextKind": _count(doc.text_kind for doc in self.docs),
        }


def _count(values: Iterable[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for value in values:
        out[value] = out.get(value, 0) + 1
    return dict(sorted(out.items()))


# ------------------------------------------------------------------ build


def load_sources(path: str | pathlib.Path) -> list[dict[str, Any]]:
    """Read the declared RAG reference set (what is ingested and what is not)."""
    file = pathlib.Path(path)
    if not file.is_file():
        raise RagError(f"RAG source list not found: {file}")
    try:
        data = yaml.safe_load(file.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise RagError(f"{file} is not valid YAML: {exc}") from exc
    entries = (data or {}).get("sources") if isinstance(data, dict) else None
    if not isinstance(entries, list) or not entries:
        raise RagError(f"{file} declares no sources")
    for entry in entries:
        if not isinstance(entry, dict) or not entry.get("id") or not entry.get("status"):
            raise RagError(f"{file}: every source needs an id and a status")
        if entry["status"] not in {"ingested", "not_ingested"}:
            raise RagError(f"{file}: unknown status {entry['status']!r} for {entry['id']}")
        if entry["status"] == "ingested" and not entry.get("pack"):
            raise RagError(f"{file}: ingested source {entry['id']} must name its pack")
        if entry["status"] == "not_ingested" and not entry.get("reason"):
            raise RagError(f"{file}: not_ingested source {entry['id']} must state a reason")
    return entries


def build_corpus(
    pack_path: str | pathlib.Path,
    sources_path: str | pathlib.Path | None = None,
) -> Corpus:
    """Derive the clause corpus from one rule pack (+ the declared source list)."""
    file = pathlib.Path(pack_path)
    try:
        pack = load_pack(file)
    except RulePackError as exc:
        raise RagError(str(exc)) from exc
    pack_sha = pack_sha256(file)
    base = {
        "pack_id": str(pack["id"]),
        "pack_version": str(pack.get("packVersion", "")),
        "pack_sha256": pack_sha,
    }
    citations = dict(pack.get("citations") or {})

    def cite(key: str | None, owner: str) -> dict[str, Any]:
        if not key:
            raise RagError(f"{owner}: no citation key - refusing an uncited document")
        entry = citations.get(key)
        if not isinstance(entry, dict):
            raise RagError(f"{owner}: citation {key!r} is not declared in the pack")
        citation = {"citeKey": key}
        citation.update(entry)
        for required in ("gazettePage", "pdfPage", "tier"):
            if not citation.get(required):
                raise RagError(f"{owner}: citation {key!r} is missing {required}")
        return citation

    def doc(
        kind: str,
        entity_id: str,
        *,
        clause: str,
        title: str,
        text: str,
        text_kind: str,
        citation: dict[str, Any] | None,
        lang: str,
        refs: Iterable[str] = (),
        meta: dict[str, Any] | None = None,
    ) -> ClauseDoc:
        if kind not in DOC_KINDS:
            raise RagError(f"unknown document kind {kind!r}")
        if text_kind not in TEXT_KINDS:
            raise RagError(f"unknown text kind {text_kind!r}")
        if not text.strip():
            raise RagError(f"{entity_id}: empty document text")
        if text_kind != "declared_gap" and citation is None:
            raise RagError(f"{entity_id}: uncited document of kind {kind}")
        return ClauseDoc(
            id=f"{base['pack_id']}:{kind}:{entity_id}:{lang}",
            kind=kind,
            lang=lang,
            entity_id=entity_id,
            clause=clause,
            title=title,
            text=text,
            text_kind=text_kind,
            citation=citation,
            pack_id=base["pack_id"],
            pack_version=base["pack_version"],
            pack_sha256=pack_sha,
            refs=tuple(refs),
            meta=dict(meta or {}),
        )

    docs: list[ClauseDoc] = []

    # -- provisions (23): clause-level summaries, numbers pinned by the pack
    for provision in pack.get("provisions") or []:
        citation = cite(provision.get("cite"), f"provision {provision.get('id')}")
        for lang in LANGS:
            title = str((provision.get("title") or {}).get(lang, "")).strip()
            summary = str((provision.get("summary") or {}).get(lang, "")).strip()
            clause = str(provision.get("clause", "")).strip()
            text = f"{clause} — {title}. {summary}" if clause else f"{title}. {summary}"
            docs.append(
                doc(
                    "provision",
                    provision["id"],
                    clause=clause,
                    title=title,
                    text=text,
                    text_kind="pack_summary",
                    citation=citation,
                    lang=lang,
                    refs=(provision["id"],),
                )
            )

    # -- FAR tables (10): derived bounds for retrieval, full rows in meta
    for table in pack.get("farTables") or []:
        citation = cite(table.get("cite"), f"FAR table {table.get('id')}")
        rows = table.get("rows") or []
        for lang in LANGS:
            title = str(table.get("tableBn" if lang == "bn" else "tableEn", "")).strip()
            clause = str(table.get("clause", "")).strip()
            fars = [row["far"] for row in rows if row.get("far") is not None]
            coverages = [row["mgcPercent"] for row in rows if row.get("mgcPercent") is not None]
            widths = sorted({row["roadWidthM"] for row in rows if row.get("roadWidthM") is not None})
            areas = [row[key] for row in rows for key in ("areaSqmFrom", "areaSqmTo") if row.get(key)]
            kathas = [row[key] for row in rows for key in ("areaKathaFrom", "areaKathaTo") if row.get(key)]
            per_road = _far_by_road(rows, lang)
            if lang == "bn":
                text = (
                    f"{clause} — {title}. {bn_digits(len(rows))}টি সারি (জমির আকার × রাস্তার প্রস্থ)। "
                    f"জমি {_fmt_range(kathas, lang)} কাঠা ({_fmt_range(areas, lang)} বর্গমিটার); "
                    f"রাস্তার প্রস্থ {_fmt_range(widths, lang)} মিটার। FAR {_fmt_range(fars, lang)}; "
                    f"সর্বোচ্চ ভূমি আচ্ছাদন {_fmt_range(coverages, lang)}%। "
                    f"রাস্তা অনুযায়ী FAR: {per_road}।"
                )
            else:
                text = (
                    f"{clause} — {title}. {len(rows)} plot-size × road-width rows: "
                    f"plot {_fmt_range(kathas, lang)} katha ({_fmt_range(areas, lang)} sqm); "
                    f"road widths {_fmt_range(widths, lang)} m. FAR {_fmt_range(fars, lang)}; "
                    f"maximum ground coverage {_fmt_range(coverages, lang)}%. "
                    f"FAR by road width: {per_road}."
                )
            docs.append(
                doc(
                    "far_table",
                    table["id"],
                    clause=clause,
                    title=title,
                    text=text,
                    text_kind="pack_summary",
                    citation=citation,
                    lang=lang,
                    refs=(table["id"],),
                    meta={
                        "classId": table.get("classId"),
                        "rows": rows,
                        "rowCount": len(rows),
                    },
                )
            )

    # -- setbacks (§46(1)-(2))
    setback = pack.get("setbackTable") or {}
    if setback:
        citation = cite(setback.get("cite"), "setback table")
        rows = setback.get("rows") or []
        beyond = setback.get("beyondHeight") or {}
        for lang in LANGS:
            fronts = [row["frontM"] for row in rows if row.get("frontM") is not None]
            rears = [row["rearM"] for row in rows if row.get("rearM") is not None]
            sides = [row["sideM"] for row in rows if row.get("sideM") is not None]
            kathas = [row[key] for row in rows for key in ("areaKathaFrom", "areaKathaTo") if row.get(key)]
            areas = [row[key] for row in rows for key in ("areaSqmFrom", "areaSqmTo") if row.get(key)]
            if lang == "bn":
                text = (
                    f"§৪৬(১)-(২) সেটব্যাক সারণি — {bn_digits(len(rows))}টি জমির আকার সারি "
                    f"({_fmt_range(kathas, lang)} কাঠা / {_fmt_range(areas, lang)} বর্গমিটার)। "
                    f"সামনে {_fmt_range(fronts, lang)} মি.; পিছনে {_fmt_range(rears, lang)} মি.; "
                    f"পাশে {_fmt_range(sides, lang)} মি.। "
                    f"{_num(beyond.get('overHeightM'))} মিটার বা {bn_digits(beyond.get('overStoreys'))} তলার ঊর্ধ্বে: "
                    f"সামনে {bn_digits(_num(beyond.get('frontM')))} মি., পিছনে {bn_digits(_num(beyond.get('rearM')))} মি., "
                    f"পাশে {bn_digits(_num(beyond.get('sideM')))} মি.।"
                )
            else:
                text = (
                    f"Setback table §46(1)-(2) — {len(rows)} plot-size rows "
                    f"({_fmt_range(kathas, lang)} katha / {_fmt_range(areas, lang)} sqm): front "
                    f"{_fmt_range(fronts, lang)} m; rear {_fmt_range(rears, lang)} m; sides "
                    f"{_fmt_range(sides, lang)} m. Above {_num(beyond.get('overHeightM'))} m or "
                    f"{_num(beyond.get('overStoreys'))} storeys: front {_num(beyond.get('frontM'))} m, "
                    f"rear {_num(beyond.get('rearM'))} m, sides {_num(beyond.get('sideM'))} m."
                )
            docs.append(
                doc(
                    "setback_table",
                    setback["id"],
                    clause="§46(1)-(2)",
                    title="Setback table" if lang == "en" else "সেটব্যাক সারণি",
                    text=text,
                    text_kind="pack_summary",
                    citation=citation,
                    lang=lang,
                    refs=(setback["id"],),
                    meta={"rows": rows, "beyondHeight": beyond, "rowCount": len(rows)},
                )
            )

    # -- Schedule 4 parking: the table, its rows and its notes
    parking = pack.get("parkingSchedule") or {}
    if parking:
        citation = cite(parking.get("cite"), "parking schedule")
        rows = parking.get("rows") or []
        notes = parking.get("notes") or []
        for lang in LANGS:
            if lang == "bn":
                text = (
                    f"সূচি-৪ পার্কিং — {bn_digits(len(rows))}টি ব্যবহার-সারি ও "
                    f"{bn_digits(len(notes))}টি নোট: প্রতিটি ব্যবহারের জন্য প্রয়োজনীয় কার/ট্রাক স্পেস।"
                )
                title = "সূচি-৪ — পার্কিং প্রয়োজনীয়তা"
            else:
                text = (
                    f"Schedule 4 parking — {len(rows)} use rows and {len(notes)} notes: "
                    f"required car/truck spaces per use."
                )
                title = "Schedule 4 — parking requirements"
            docs.append(
                doc(
                    "parking_schedule",
                    parking["id"],
                    clause="সূচি-৪" if lang == "bn" else "Schedule 4",
                    title=title,
                    text=text,
                    text_kind="pack_summary",
                    citation=citation,
                    lang=lang,
                    refs=(parking["id"],),
                    meta={"rowCount": len(rows), "noteCount": len(notes)},
                )
            )
            for row in rows:
                spaces = row.get("spaces") or {}
                numerator = spaces.get("numerator")
                denominator = spaces.get("denominator")
                basis = spaces.get("basis")
                vehicle = str(row.get("vehicle") or "car")
                if lang == "bn":
                    vehicle_word = "ট্রাক" if vehicle == "truck" else "কার"
                    amount = (
                        f"{bn_digits(_num(denominator))} "
                        f"{'বর্গমিটার' if basis == 'sqm_gross' else 'সাইট'}-এ "
                        f"{bn_digits(_num(numerator))}টি {vehicle_word} স্পেস"
                        if denominator not in (None, 1)
                        else f"{bn_digits(_num(numerator))}টি {vehicle_word} স্পেস"
                    )
                    text = f"সূচি-৪ পার্কিং — {row.get('useBn', '')}: {amount}."
                    if row.get("minSpaces"):
                        text += f" ন্যূনতম {bn_digits(_num(row['minSpaces']))}টি।"
                else:
                    vehicle_word = "truck" if vehicle == "truck" else "car"
                    amount = (
                        f"{_num(numerator)} {vehicle_word} space per {_num(denominator)} "
                        f"{'sqm gross area' if basis == 'sqm_gross' else 'site'}"
                        if denominator not in (None, 1)
                        else f"{_num(numerator)} {vehicle_word} space"
                    )
                    text = f"Schedule 4 parking — {row.get('useEn', '')}: {amount}."
                    if row.get("minSpaces"):
                        text += f" Minimum {_num(row['minSpaces'])}."
                label = "সূচি-৪" if lang == "bn" else "Schedule 4"
                docs.append(
                    doc(
                        "parking_row",
                        row["id"],
                        clause=label,
                        title=str(row.get("useBn" if lang == "bn" else "useEn", "")),
                        text=text,
                        text_kind="pack_summary",
                        citation=citation,
                        lang=lang,
                        refs=(parking["id"], row["id"]),
                        meta={
                            "vehicle": row.get("vehicle"),
                            "spaces": spaces,
                            "basis": basis,
                            "minSpaces": row.get("minSpaces"),
                        },
                    )
                )
            for note in notes:
                note_text = str((note.get("text") or {}).get(lang, "")).strip()
                docs.append(
                    doc(
                        "parking_note",
                        note["id"],
                        clause="সূচি-৪" if lang == "bn" else "Schedule 4",
                        title="পার্কিং নোট" if lang == "bn" else "Parking note",
                        text=note_text,
                        text_kind="pack_note",
                        citation=citation,
                        lang=lang,
                        refs=(parking["id"], note["id"]),
                    )
                )

    # -- parking geometry rules (§56(4)-(15))
    geometry = pack.get("parkingGeometry") or {}
    for rule in geometry.get("rules") or []:
        citation = cite(rule.get("cite"), f"parking geometry rule {rule.get('id')}")
        clause = str(rule.get("clause", "")).strip()
        for lang in LANGS:
            title = str((rule.get("title") or {}).get(lang, "")).strip()
            summary = str((rule.get("summary") or {}).get(lang, "")).strip()
            docs.append(
                doc(
                    "geometry_rule",
                    rule["id"],
                    clause=clause,
                    title=title,
                    text=f"{clause} — {title}. {summary}",
                    text_kind="pack_summary",
                    citation=citation,
                    lang=lang,
                    refs=(geometry.get("id") or "", rule["id"]),
                    meta={"ruleId": rule["id"]},
                )
            )

    # -- footnotes: transcribed gazette wording
    for footnote in pack.get("footnotes") or []:
        citation = cite(footnote.get("cite"), f"footnote {footnote.get('id')}")
        mark = str(footnote.get("mark", "")).strip()
        for lang in LANGS:
            applies = [str(item) for item in footnote.get("appliesTo") or []]
            body = str((footnote.get("text") or {}).get(lang, "")).strip()
            label = ", ".join(applies)
            title = f"Footnote {mark} — applies to {label}" if lang == "en" else f"পাদটীকা {mark} — প্রযোজ্য: {label}"
            docs.append(
                doc(
                    "footnote",
                    footnote["id"],
                    clause=mark,
                    title=title,
                    text=f"{mark} {body}",
                    text_kind="gazette_quote",
                    citation=citation,
                    lang=lang,
                    refs=(footnote["id"],),
                    meta={"mark": mark, "appliesTo": applies},
                )
            )

    # -- declared gaps: retrievable as "we do not know this", never as law
    for gap in pack.get("gaps") or []:
        for lang in LANGS:
            what = str(gap.get("what", "")).strip()
            why = str(gap.get("why", "")).strip()
            text = f"{what} {why}".strip()
            docs.append(
                doc(
                    "declared_gap",
                    gap["id"],
                    clause="",
                    title="Declared gap" if lang == "en" else "ঘোষিত ফাঁক",
                    text=text,
                    text_kind="declared_gap",
                    citation=None,
                    lang=lang,
                    meta={"candidateRef": gap.get("candidateRef")},
                )
            )

    docs.sort(key=lambda item: item.id)
    sources = tuple(load_sources(sources_path)) if sources_path is not None else ()
    missing = tuple(
        {"id": entry["id"], "status": entry["status"], "reason": entry.get("reason", "")}
        for entry in sources
        if entry["status"] != "ingested"
    )
    coverage = _coverage(pack, docs, citations, sources, missing)
    return Corpus(
        pack_id=base["pack_id"],
        pack_version=base["pack_version"],
        pack_sha256=pack_sha,
        docs=tuple(docs),
        sources=sources,
        missing=missing,
        coverage=coverage,
    )


def _coverage(
    pack: dict[str, Any],
    docs: list[ClauseDoc],
    citations: dict[str, Any],
    sources: tuple[dict[str, Any], ...],
    missing: tuple[dict[str, Any], ...],
) -> dict[str, Any]:
    provision_ids = {str(item.get("id")) for item in pack.get("provisions") or []}
    covered = {doc.entity_id for doc in docs if doc.kind == "provision"}
    used = {doc.citation["citeKey"] for doc in docs if doc.citation and doc.citation.get("citeKey")}
    return {
        "provisions": len(provision_ids),
        "provisionsWithDocs": len(provision_ids & covered),
        "citationsDeclared": len(citations),
        "citationsUsed": len(used),
        "citationsUnused": sorted(set(citations) - used),
        "declaredGapsInPack": len(pack.get("gaps") or []),
        "declaredGapsInCorpus": len({doc.entity_id for doc in docs if doc.kind == "declared_gap"}),
        "sourcesIngested": len([entry for entry in sources if entry["status"] == "ingested"]),
        "sourcesMissing": len(missing),
    }


# ---------------------------------------------------------------- storage


def dumps_doc(doc: ClauseDoc | dict[str, Any]) -> str:
    """Canonical single-line JSON for one document (stable bytes, diffable)."""
    payload = doc.as_dict() if isinstance(doc, ClauseDoc) else doc
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def corpus_text(docs: Iterable[ClauseDoc]) -> str:
    return "".join(f"{dumps_doc(doc)}\n" for doc in sorted(docs, key=lambda item: item.id))


def corpus_bytes(docs: Iterable[ClauseDoc]) -> bytes:
    return corpus_text(docs).encode("utf-8")


def write_corpus(corpus: Corpus, path: str | pathlib.Path) -> dict[str, Any]:
    """Write the corpus JSONL; returns {path, documents, bytes, sha256}."""
    file = pathlib.Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    payload = corpus_bytes(corpus.docs)
    file.write_bytes(payload)
    return {
        "path": str(file),
        "documents": len(corpus.docs),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


def load_corpus(
    path: str | pathlib.Path, manifest_path: str | pathlib.Path | None = None
) -> Corpus:
    """Read a committed corpus JSONL back, with its manifest when one sits beside it.

    The manifest carries the declared reference gaps, so production entry points require it
    (``service_from_paths``); retrieval itself does not need it.
    """
    file = pathlib.Path(path)
    if not file.is_file():
        raise RagError(f"corpus not found: {file}")
    if manifest_path is None:
        # Only a ``*.corpus.jsonl`` file has a sidecar by naming convention; a corpus stored
        # under any other name has no sibling manifest to guess (never re-read the corpus
        # file itself as its own manifest).
        if file.name.endswith(".corpus.jsonl"):
            candidate = file.with_name(file.name[: -len(".corpus.jsonl")] + ".manifest.json")
            manifest_path = candidate if candidate.is_file() else None
        else:
            manifest_path = None
    docs: list[ClauseDoc] = []
    for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            docs.append(ClauseDoc.from_dict(json.loads(line)))
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            raise RagError(f"{file}:{number}: unusable corpus line ({exc})") from exc
    if not docs:
        raise RagError(f"corpus is empty: {file}")
    first = docs[0]
    mismatch = [doc.id for doc in docs if doc.corpus_key != first.corpus_key]
    if mismatch:
        raise RagError(f"corpus mixes pack versions ({mismatch[0]}) - rebuild it")
    sidecar: dict[str, Any] | None = None
    if manifest_path is not None:
        sidecar_file = pathlib.Path(manifest_path)
        if not sidecar_file.is_file():
            raise RagError(f"corpus manifest not found: {sidecar_file}")
        try:
            sidecar = json.loads(sidecar_file.read_text(encoding="utf-8"))
        except ValueError as exc:
            raise RagError(f"{sidecar_file} is not valid JSON: {exc}") from exc
        if sidecar.get("packSha256") != first.pack_sha256:
            raise RagError(
                f"corpus manifest pins a different pack ({sidecar.get('packSha256')})"
            )
        if sidecar.get("documents") != len(docs):
            raise RagError(
                f"corpus manifest counts {sidecar.get('documents')} documents, file has {len(docs)}"
            )
    return Corpus(
        pack_id=first.pack_id,
        pack_version=first.pack_version,
        pack_sha256=first.pack_sha256,
        docs=tuple(sorted(docs, key=lambda item: item.id)),
        sources=tuple((sidecar or {}).get("sources") or ()),
        missing=tuple((sidecar or {}).get("missing") or ()),
        coverage=dict((sidecar or {}).get("coverage") or {}),
        manifest=sidecar,
    )


def manifest(corpus: Corpus, *, corpus_sha: str, corpus_bytes_count: int) -> dict[str, Any]:
    """The committed sidecar: pins, counts and every declared corpus gap."""
    counts = corpus.counts()
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generator": CORPUS_VERSION,
        "packId": corpus.pack_id,
        "packVersion": corpus.pack_version,
        "packSha256": corpus.pack_sha256,
        "corpusSha256": corpus_sha,
        "corpusBytes": corpus_bytes_count,
        "documents": len(corpus.docs),
        "byKind": counts["byKind"],
        "byLang": counts["byLang"],
        "byTextKind": counts["byTextKind"],
        "coverage": corpus.coverage,
        "sources": list(corpus.sources),
        "missing": list(corpus.missing),
    }
