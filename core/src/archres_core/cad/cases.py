"""CAD execution cases: input, script under test, expectation (W1.8).

A case is a claim that survives being executed:

```yaml
- id: geometry.build-pads-6-en
  kind: geometry.build
  script: tools/cad/candidates/geometry_build.py   # relative to the repo root
  params: {pads: 6, columnsPerPad: 3}
  expect:
    status: ok
    documentObjects: {min: 6}
    totals: {volumeM3: {min: 8.9, max: 8.95}}
    objects:
      - {name: Pad_Pad_1, solids: 1, valid: true}
  determinism: true          # run twice, demand byte-identical verdicts
  timeoutMs: 120000
  notes: "pads fused with columns"
```

Every field is exact: an unknown key is a load error, never a silently ignored typo. A case
that cannot say what it expects is a case that cannot verify anything, so an ``ok`` case must
demand at least one of ``documentObjects``, ``totals``, ``objects`` or ``artifacts``, and an
``error`` case must name the exception type it expects in ``errorType`` (optionally with an
``errorContains`` message fragment). A broken-candidate case that only says ``status: error``
would pass on the wrong exception, so it is refused.
"""

from __future__ import annotations

import json
import math
import pathlib
import re
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "CadCase",
    "CadError",
    "load_case_document",
    "load_cases",
    "CASE_KEYS",
    "EXPECT_KEYS",
    "DEFAULT_TIMEOUT_MS",
]

DEFAULT_TIMEOUT_MS = 120_000

CASE_KEYS = {"id", "kind", "script", "params", "expect", "determinism", "timeoutMs", "notes"}
EXPECT_KEYS = {
    "status",
    "documentObjects",
    "totals",
    "objects",
    "artifacts",
    "errorType",
    "errorContains",
}
CASE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class CadError(ValueError):
    """A CAD execution case or result that cannot be trusted."""


@dataclass(frozen=True)
class Bounds:
    """An inclusive interval; ``exact`` is the same thing with both ends equal."""

    min: float
    max: float

    def holds(self, value: float) -> bool:
        return self.min <= value <= self.max

    def describe(self) -> str:
        if self.min == self.max:
            return f"{self.min:g}"
        if self.max == float("inf"):
            return f">= {self.min:g}"
        if self.min == float("-inf"):
            return f"<= {self.max:g}"
        return f"{self.min:g}..{self.max:g}"


def _number(raw: Any, where: str) -> float:
    """One real number. Booleans are not numbers here, and NaN can never be an expectation."""
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise CadError(f"{where}: expected a number, got {type(raw).__name__}")
    value = float(raw)
    if math.isnan(value):
        raise CadError(f"{where}: expected a real number, got NaN")
    return value


def _bounds(raw: Any, where: str) -> Bounds:
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        value = _number(raw, where)
        return Bounds(value, value)
    if isinstance(raw, dict):
        extra = set(raw) - {"min", "max", "value"}
        if extra:
            raise CadError(f"{where}: unknown bounds key(s) {sorted(extra)}")
        if "value" in raw:
            return _bounds(raw["value"], where)
        low = raw.get("min")
        high = raw.get("max")
        if low is None and high is None:
            raise CadError(f"{where}: bounds need min/max or value")
        if low is None or high is None:
            raise CadError(f"{where}: bounds need both min and max")
        low_value = _number(low, f"{where}.min")
        high_value = _number(high, f"{where}.max")
        if low_value > high_value:
            raise CadError(f"{where}: min {low} is above max {high}")
        return Bounds(low_value, high_value)
    raise CadError(f"{where}: expected a number or {{min, max}}, got {type(raw).__name__}")


@dataclass(frozen=True)
class ObjectExpectation:
    name: str
    volume_m3: Bounds | None = None
    bbox_mm: tuple[Bounds, Bounds, Bounds] | None = None
    solids: int | None = None
    valid: bool | None = None


@dataclass(frozen=True)
class ArtifactExpectation:
    name: str
    kind: str | None = None
    min_bytes: int | None = None
    sha256: str | None = None


@dataclass(frozen=True)
class CadCase:
    id: str
    kind: str
    script: pathlib.Path
    params: dict[str, Any]
    expect: dict[str, Any]
    determinism: bool
    timeout_ms: int
    notes: str = ""
    objects: tuple[ObjectExpectation, ...] = field(default=())

    @property
    def name(self) -> str:
        return self.id


def _objects(raw: Any, where: str) -> tuple[ObjectExpectation, ...]:
    if not isinstance(raw, list) or not raw:
        raise CadError(f"{where}: objects expectation must be a non-empty list")
    out: list[ObjectExpectation] = []
    for index, entry in enumerate(raw):
        spot = f"{where}[{index}]"
        if not isinstance(entry, dict):
            raise CadError(f"{spot}: expected a mapping")
        extra = set(entry) - {"name", "volumeM3", "bboxMm", "solids", "valid"}
        if extra:
            raise CadError(f"{spot}: unknown key(s) {sorted(extra)}")
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            raise CadError(f"{spot}: 'name' is required")
        bbox = entry.get("bboxMm")
        bbox_bounds = None
        if bbox is not None:
            if not isinstance(bbox, list) or len(bbox) != 3:
                raise CadError(f"{spot}.bboxMm: expected three bounds")
            bbox_bounds = tuple(_bounds(item, f"{spot}.bboxMm") for item in bbox)  # type: ignore[assignment]
        solids = None
        if "solids" in entry:
            raw_solids = entry["solids"]
            if isinstance(raw_solids, bool) or not isinstance(raw_solids, int):
                raise CadError(f"{spot}.solids: expected a whole number, got {type(raw_solids).__name__}")
            if raw_solids < 0:
                raise CadError(f"{spot}.solids: expected a count >= 0, got {raw_solids}")
            solids = raw_solids
        valid = None
        if "valid" in entry:
            if not isinstance(entry["valid"], bool):
                raise CadError(f"{spot}.valid: expected true or false, got {type(entry['valid']).__name__}")
            valid = entry["valid"]
        out.append(
            ObjectExpectation(
                name=name,
                volume_m3=_bounds(entry["volumeM3"], f"{spot}.volumeM3")
                if "volumeM3" in entry
                else None,
                bbox_mm=bbox_bounds,
                solids=solids,
                valid=valid,
            )
        )
    return tuple(out)


def _artifacts(raw: Any, where: str) -> tuple[ArtifactExpectation, ...]:
    if not isinstance(raw, list) or not raw:
        raise CadError(f"{where}: artifacts expectation must be a non-empty list")
    out: list[ArtifactExpectation] = []
    for index, entry in enumerate(raw):
        spot = f"{where}[{index}]"
        if isinstance(entry, str):
            out.append(ArtifactExpectation(name=entry))
            continue
        if not isinstance(entry, dict):
            raise CadError(f"{spot}: expected a name or a mapping")
        extra = set(entry) - {"name", "kind", "minBytes", "sha256"}
        if extra:
            raise CadError(f"{spot}: unknown key(s) {sorted(extra)}")
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            raise CadError(f"{spot}: 'name' is required")
        kind = entry.get("kind")
        if kind is not None and (not isinstance(kind, str) or not kind):
            raise CadError(f"{spot}.kind: expected a non-empty string")
        min_bytes = None
        if "minBytes" in entry:
            raw_bytes = entry["minBytes"]
            if isinstance(raw_bytes, bool) or not isinstance(raw_bytes, int) or raw_bytes < 0:
                raise CadError(f"{spot}.minBytes: expected a whole number >= 0")
            min_bytes = raw_bytes
        sha256 = entry.get("sha256")
        if sha256 is not None:
            if (
                not isinstance(sha256, str)
                or len(sha256) != 64
                or any(char not in "0123456789abcdef" for char in sha256.lower())
            ):
                raise CadError(f"{spot}.sha256: expected 64 hex characters")
            sha256 = sha256.lower()  # artifact hashes are lowercase; compare like with like
        out.append(
            ArtifactExpectation(
                name=name,
                kind=kind,
                min_bytes=min_bytes,
                sha256=sha256,
            )
        )
    return tuple(out)


def _count_bounds(raw: Any, where: str) -> Bounds:
    """A count may be exact, or at-least / at-most: `{min: 1}` is a real expectation."""
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        value = _number(raw, where)
        return Bounds(value, value)
    if isinstance(raw, dict):
        extra = set(raw) - {"min", "max"}
        if extra:
            raise CadError(f"{where}: unknown bounds key(s) {sorted(extra)}")
        low = raw.get("min")
        high = raw.get("max")
        if low is None and high is None:
            raise CadError(f"{where}: bounds need min and/or max")
        low_value = 0.0 if low is None else _number(low, f"{where}.min")
        high_value = float("inf") if high is None else _number(high, f"{where}.max")
        if low_value > high_value:
            raise CadError(f"{where}: min {low_value} is above max {high_value}")
        return Bounds(low_value, high_value)
    raise CadError(f"{where}: expected a count or {{min, max}}, got {type(raw).__name__}")


def _case(raw: dict[str, Any], root: pathlib.Path, where: str) -> CadCase:
    extra = set(raw) - CASE_KEYS
    if extra:
        raise CadError(f"{where}: unknown key(s) {sorted(extra)}")
    for required in ("id", "kind", "script", "params", "expect"):
        if required not in raw:
            raise CadError(f"{where}: missing '{required}'")
    case_id = raw["id"]
    if not isinstance(case_id, str) or not CASE_ID.match(case_id):
        raise CadError(
            f"{where}: 'id' must be a safe path segment (letters, digits, '.', '_' or '-')"
        )
    kind = raw["kind"]
    if not isinstance(kind, str) or not kind:
        raise CadError(f"{where}: 'kind' must be a non-empty string")
    script_raw = raw["script"]
    if not isinstance(script_raw, str) or not script_raw:
        raise CadError(f"{where}: 'script' must be a non-empty string")
    script = pathlib.Path(script_raw)
    if not script.is_absolute():
        script = root / script
    if not isinstance(raw["params"], dict):
        raise CadError(f"{where}: 'params' must be a mapping")
    expect = raw["expect"]
    if not isinstance(expect, dict):
        raise CadError(f"{where}: 'expect' must be a mapping")
    expect_extra = set(expect) - EXPECT_KEYS
    if expect_extra:
        raise CadError(f"{where}: unknown expect key(s) {sorted(expect_extra)}")
    if not expect:
        raise CadError(
            f"{where}: 'expect' must demand something "
            f"(one of {sorted(EXPECT_KEYS)})"
        )
    status = expect.get("status", "ok")
    if status not in ("ok", "error"):
        raise CadError(f"{where}: expect.status must be 'ok' or 'error'")
    measurements = {"documentObjects", "totals", "objects", "artifacts"}
    error_type = expect.get("errorType")
    error_contains = expect.get("errorContains")
    if status == "ok":
        if error_type is not None or error_contains is not None:
            raise CadError(f"{where}: errorType/errorContains are only valid with status 'error'")
        if not (set(expect) & measurements):
            raise CadError(
                f"{where}: an 'ok' case must demand at least one of "
                f"{sorted(measurements)}, not just a status"
            )
    else:
        if set(expect) & measurements:
            raise CadError(
                f"{where}: an 'error' case cannot demand {sorted(set(expect) & measurements)}; "
                "a failed run has no trustworthy geometry"
            )
        if not isinstance(error_type, str) or not error_type:
            raise CadError(f"{where}: an 'error' case must name the expected 'errorType'")
        if error_contains is not None and (not isinstance(error_contains, str) or not error_contains):
            raise CadError(f"{where}: expect.errorContains must be a non-empty string")
    raw_totals = expect.get("totals", {})
    if not isinstance(raw_totals, dict):
        raise CadError(f"{where}: expect.totals must be a mapping")
    totals = raw_totals
    unknown_totals = set(totals) - {"volumeM3", "objects", "solids"}
    if unknown_totals:
        raise CadError(f"{where}: unknown expect.totals key(s) {sorted(unknown_totals)}")
    document_objects = expect.get("documentObjects")
    timeout_raw = raw.get("timeoutMs", DEFAULT_TIMEOUT_MS)
    if isinstance(timeout_raw, bool) or not isinstance(timeout_raw, int):
        raise CadError(f"{where}: timeoutMs must be a whole number of milliseconds")
    timeout = timeout_raw
    if timeout < 1000:
        raise CadError(f"{where}: timeoutMs must be at least 1000")
    determinism = raw.get("determinism", True)
    if not isinstance(determinism, bool):
        raise CadError(f"{where}: 'determinism' must be true or false")
    notes = raw.get("notes", "")
    if not isinstance(notes, str):
        raise CadError(f"{where}: 'notes' must be a string")
    return CadCase(
        id=case_id,
        kind=kind,
        script=script,
        params=dict(raw["params"]),
        expect={
            "status": status,
            "documentObjects": _count_bounds(document_objects, f"{where}.documentObjects")
            if document_objects is not None
            else None,
            "totals": {
                key: _bounds(value, f"{where}.totals.{key}") for key, value in totals.items()
            },
            "artifacts": _artifacts(expect["artifacts"], f"{where}.artifacts")
            if "artifacts" in expect
            else (),
            "errorType": error_type,
            "errorContains": error_contains,
        },
        determinism=determinism,
        timeout_ms=timeout,
        notes=notes,
        objects=_objects(expect["objects"], f"{where}.objects") if "objects" in expect else (),
    )


def load_case_document(path: str | pathlib.Path) -> list[dict[str, Any]]:
    """Read a case file (JSON or YAML) into raw case mappings, before shape validation."""
    file = pathlib.Path(path)
    if not file.is_file():
        raise CadError(f"case file not found: {file}")
    try:
        if file.suffix.lower() in (".yaml", ".yml"):
            import yaml  # noqa: PLC0415 - PyYAML is already a core dependency

            raw_document = yaml.safe_load(file.read_text(encoding="utf-8"))
        else:
            raw_document = json.loads(file.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - the message is the whole point here
        raise CadError(f"{file}: cannot parse ({exc})") from exc

    if isinstance(raw_document, dict):
        raw_document = raw_document.get("cases")
    if not isinstance(raw_document, list) or not raw_document:
        raise CadError(f"{file}: expected a non-empty list of cases")
    for index, entry in enumerate(raw_document):
        if not isinstance(entry, dict):
            raise CadError(f"{file}[{index}]: expected a mapping")
    return raw_document


def load_cases(path: str | pathlib.Path, *, root: str | pathlib.Path | None = None) -> list[CadCase]:
    """Read a case file (JSON or YAML); duplicates and shape errors are fatal."""
    file = pathlib.Path(path)
    base = pathlib.Path(root) if root is not None else file.parent
    raw_document = load_case_document(file)
    cases: list[CadCase] = []
    seen: set[str] = set()
    for index, entry in enumerate(raw_document):
        case = _case(entry, base, f"{file}[{index}]")
        if case.id in seen:
            raise CadError(f"{file}: duplicate case id {case.id!r}")
        seen.add(case.id)
        cases.append(case)
    return cases
