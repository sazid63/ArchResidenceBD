"""Rule-pack access (W1.2): load, pin by sha256, resolve rule entities.

A pack is data, not code (ADR-0003): the engine reads ``spec/rules/<pack>.yaml``, pins
the exact file by sha256 in every verdict set, and resolves ``ruleRef`` entities
(provisions, tables, schedule rows) against that pinned file. Verdicts are reproducible
only when the pack hash recorded in the verdict set equals the hash of the file
evaluated - never re-resolve a citation against a different pack revision.
"""

from __future__ import annotations

import hashlib
import pathlib
from typing import Any

import yaml

REQUIRED_KEYS = ("id", "status", "farTables", "setbackTable", "parkingSchedule", "provisions")


class RulePackError(ValueError):
    """The pack file is missing or not usable by the engine."""


def load_pack(path: str | pathlib.Path) -> dict[str, Any]:
    """Load a rule pack YAML file; raises RulePackError when it is not engine-usable."""
    file = pathlib.Path(path)
    if not file.is_file():
        raise RulePackError(f"rule pack not found: {file}")
    try:
        data = yaml.safe_load(file.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise RulePackError(f"{file} is not valid YAML: {exc}") from exc
    if not isinstance(data, dict):
        raise RulePackError(f"{file} did not parse as a mapping")
    missing = [key for key in REQUIRED_KEYS if key not in data]
    if missing:
        raise RulePackError(f"{file} is missing required key(s): {', '.join(missing)}")
    return data


def pack_sha256(path: str | pathlib.Path) -> str:
    """sha256 of the exact pack file bytes - the pin every verdict set carries."""
    return hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest()


def entities(pack: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Index every addressable rule entity by id (provisions, tables, schedule rows).

    Provisions win on id collision; entities without an id are skipped.
    """
    index: dict[str, dict[str, Any]] = {}
    for provision in pack.get("provisions") or []:
        index.setdefault(provision.get("id"), provision)
    for table in pack.get("farTables") or []:
        index.setdefault(table.get("id"), table)
    for singular in ("setbackTable", "parkingSchedule", "parkingGeometry"):
        entity = pack.get(singular) or {}
        if entity.get("id"):
            index.setdefault(entity["id"], entity)
    for rule in (pack.get("parkingGeometry") or {}).get("rules") or []:
        index.setdefault(rule.get("id"), rule)
    return {key: value for key, value in index.items() if key}


def rule_ref(pack: dict[str, Any], entity_id: str) -> str:
    """``'<packId>#<entityId>'`` - the only ruleRef form (W0.9 schema pattern)."""
    return f"{pack['id']}#{entity_id}"


def gaps(pack: dict[str, Any]) -> list[dict[str, Any]]:
    """Pack-declared coverage gaps (never dropped silently - plan §9)."""
    return list(pack.get("gaps") or [])
