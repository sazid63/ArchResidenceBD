"""Rule engine v0 (W1.2): Building Spec + pinned rule pack -> verdict set.

Public surface:

- ``evaluate_spec(spec, pack, ...)`` - one compliance run (W0.9 verdict schema, pinned
  pack sha256, summary counts computed, output self-validated before it is returned);
- ``restore_patch(spec, verdict, ...)`` - apply a deviation's machine patch via the spec
  engine (W1.3 ``apply_patch``, provenance source ``engine``) - the one-click restore;
- ``register_ops(spec, verdict_set, ...)`` / ``apply_register(...)`` - sync the spec's
  Deviation Register with a verdict set (engine-owned entries only; user rationale and
  acknowledgements are preserved);
- ``run_vectors(pack)`` / ``coverage(pack)`` - the pack's own test vectors and the
  engine's coverage statement (never silent, plan §9).

Everything is deterministic: identical inputs produce byte-identical outputs (canonical
JSON), because verdicts are an audit trail, not a rendering.
"""

from __future__ import annotations

import re
from typing import Any

import jsonschema

from ..interfaces import load_schema
from ..spec import apply_patch, spec_sha256, utc_now_iso
from . import tables
from .checks import CHECKS, ENGINE_ID
from .pack import entities, gaps as pack_gaps, pack_sha256, rule_ref

__all__ = [
    "ComplianceError",
    "ENGINE_ID",
    "apply_register",
    "coverage",
    "evaluate_spec",
    "register_ops",
    "restore_patch",
    "run_vectors",
]

VERDICT_SCHEMA_VERSION = "0.1.0"
PACK_STATUSES = ("candidate", "review", "frozen")
MANAGED_ID_PREFIX = "dev-"
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_RESERVED = object()


class ComplianceError(RuntimeError):
    """The engine cannot produce a trustworthy verdict set (never a design problem)."""


# ------------------------------------------------------------------ evaluation


def _subject(spec: dict[str, Any]) -> dict[str, Any]:
    subject: dict[str, Any] = {
        "specRevision": spec.get("revision", 0),
        "specSha256": spec_sha256(spec),
    }
    project = spec.get("project") or {}
    project_id = project.get("id")
    if isinstance(project_id, str) and _UUID_RE.match(project_id):
        subject["projectId"] = project_id
    return subject


def evaluate_spec(
    spec: dict[str, Any],
    pack: dict[str, Any],
    *,
    pack_path: str | None = None,
    pack_sha256_pin: str | None = None,
    evaluated_at: str | None = None,
) -> dict[str, Any]:
    """One compliance run: run every check, surface pack gaps, self-validate.

    A pinned pack hash is mandatory: either ``pack_path`` (hashed here) or an explicit
    ``pack_sha256_pin``. Verdicts are reproducible only against the pinned file.
    """
    if pack_sha256_pin is None:
        if not pack_path:
            raise ComplianceError("a pack pin is required: pass pack_path= or pack_sha256_pin=")
        pack_sha256_pin = pack_sha256(pack_path)
    status = pack.get("status")
    if status not in PACK_STATUSES:
        raise ComplianceError(f"pack status {status!r} is not one of {PACK_STATUSES}")

    verdicts: list[dict[str, Any]] = []
    unevaluated: list[dict[str, Any]] = []
    for entity_id in CHECKS:  # deterministic order: far-tables, setback-schedule, schedule4-parking
        found_verdicts, found_unevaluated = CHECKS[entity_id](spec, pack)
        verdicts.extend(found_verdicts)
        unevaluated.extend(found_unevaluated)
    for gap in pack_gaps(pack):  # pack-declared coverage gaps are never dropped
        unevaluated.append(
            {
                "ruleRef": rule_ref(pack, gap.get("id", "gap")),
                "reason": "pack_gap",
                "detail": gap.get("what") or gap.get("id", "pack gap"),
            }
        )

    summary = {
        state: sum(1 for verdict in verdicts if verdict.get("status") == state)
        for state in ("compliant", "deviation", "impossible")
    }
    result = {
        "schemaVersion": VERDICT_SCHEMA_VERSION,
        "pack": {"id": pack["id"], "sha256": pack_sha256_pin, "status": status},
        "subject": _subject(spec),
        "evaluatedAt": evaluated_at or utc_now_iso(),
        "evaluator": ENGINE_ID,
        "verdicts": verdicts,
        "unevaluated": unevaluated,
        "summary": summary,
    }
    try:
        jsonschema.Draft202012Validator(load_schema("verdict")).validate(result)
    except jsonschema.ValidationError as exc:
        raise ComplianceError(
            f"engine produced an invalid verdict set: {exc.message} at {'/'.join(str(p) for p in exc.absolute_path)}"
        ) from exc
    return result


def coverage(pack: dict[str, Any]) -> dict[str, list[str]]:
    """Engine coverage statement: checks implemented vs provisions in the pack."""
    index = entities(pack)
    unknown = sorted(entity_id for entity_id in CHECKS if entity_id not in index)
    if unknown:
        raise ComplianceError(f"engine checks reference unknown pack entities: {unknown}")
    return {
        "covered": sorted(CHECKS),
        "uncovered_provisions": sorted(
            provision.get("id")
            for provision in pack.get("provisions") or []
            if provision.get("id") not in CHECKS
        ),
    }


def run_vectors(pack: dict[str, Any]) -> list[dict[str, Any]]:
    """Evaluate every embedded test vector; rows: id/kind/ok/got/expect."""
    results: list[dict[str, Any]] = []
    for vector in pack.get("testVectors") or []:
        got = tables.run_vector(pack, vector)
        expect = vector.get("expect") or {}
        ok = got is not None and all(
            sorted(got.get(key) or []) == sorted(want) if key == "footnotes" else got.get(key) == want
            for key, want in expect.items()
        )
        results.append(
            {"id": vector.get("id"), "kind": vector.get("kind"), "ok": ok, "got": got, "expect": expect}
        )
    return results


# --------------------------------------------------------------------- restore


def restore_patch(spec: dict[str, Any], verdict: dict[str, Any], *, at: str | None = None) -> dict[str, Any]:
    """Apply a deviation verdict's ``alternative.specPatch`` through the spec engine.

    Only deviation verdicts carry a restore patch (schema law); the new revision is
    validated exactly like any other patch (no partial results).
    """
    if verdict.get("status") != "deviation":
        raise ComplianceError("only deviation verdicts carry a restore patch")
    ops = (verdict.get("alternative") or {}).get("specPatch")
    if not ops:
        raise ComplianceError("deviation verdict has no alternative.specPatch")
    return apply_patch(
        spec,
        ops,
        provenance={"source": "engine", "detail": f"restore to compliant: {verdict.get('ruleRef')}"},
        at=at,
    )


# -------------------------------------------------------------------- register


def _num(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        return text or "0"
    return str(value)


def _limit_text(limit: dict[str, Any]) -> str:
    symbol = {"max": "≤", "min": "≥", "exact": "="}.get(limit.get("comparator"), "?")
    unit = limit.get("unit") or ""
    return f"{symbol} {_num(limit.get('value'))} {unit}".strip()


def _measured_text(measured: dict[str, Any]) -> str:
    unit = measured.get("unit") or ""
    return f"{_num(measured.get('value'))} {unit}".strip()


def _phase_of(path: str) -> str | None:
    parts = path.split("/")
    if len(parts) >= 3 and parts[1] == "phases":
        return parts[2]
    return None


def _deviation_entry(verdict: dict[str, Any], at: str) -> dict[str, Any]:
    ref = verdict.get("ruleRef") or ""
    entity_id = ref.split("#", 1)[1] if "#" in ref else ref
    measured = verdict.get("measured") or {}
    path = measured.get("path") or ""
    tail = ""
    if path:
        tail = "-" + path.rstrip("/").rsplit("/", 1)[-1].lower()
    entry: dict[str, Any] = {
        "id": f"{MANAGED_ID_PREFIX}{entity_id}{tail}",
        "ruleRef": ref,
        "ruleTitle": (verdict.get("title") or {}).get("en") or ref,
        "expected": _limit_text(verdict.get("limit") or {}),
        "actual": _measured_text(measured),
        "riskTier": "approval_risk",
        "acknowledged": False,
        "recordedAt": at,
        "nearestCompliantAlternative": (
            ((verdict.get("alternative") or {}).get("description") or {}).get("en") or ""
        ),
    }
    phase_id = _phase_of(path)
    if phase_id:
        entry["phaseId"] = phase_id
    return entry


def register_ops(
    spec: dict[str, Any], verdict_set: dict[str, Any], *, at: str | None = None
) -> list[dict[str, Any]]:
    """Ops that sync ``/deviations`` with a verdict set (engine-owned entries only).

    - a deviation verdict without a register entry -> ``add``;
    - an entry that is still a deviation -> ``replace`` (user ``rationale``,
      ``acknowledged`` and the original ``recordedAt`` are preserved); a replace whose
      merged value equals the existing entry is skipped, so a synced register yields
      no ops at all;
    - an engine-owned entry (id starts with ``dev-``) whose verdict disappeared
      (now compliant, or the input changed) -> ``remove``. User-authored entries
      are never touched.
    """
    at = at or utc_now_iso()
    desired = [
        _deviation_entry(verdict, at)
        for verdict in verdict_set.get("verdicts") or []
        if verdict.get("status") == "deviation"
    ]
    desired_ids = {entry["id"] for entry in desired}
    if "deviations" not in spec:
        return [{"op": "add", "path": "/deviations", "value": desired}] if desired else []
    existing = list(spec.get("deviations") or [])
    index_of = {
        entry.get("id"): index
        for index, entry in enumerate(existing)
        if isinstance(entry, dict) and entry.get("id")
    }
    replacements: list[dict[str, Any]] = []
    adds: list[dict[str, Any]] = []
    for entry in desired:
        index = index_of.get(entry["id"])
        if index is None:
            adds.append({"op": "add", "path": "/deviations/-", "value": entry})
            continue
        merged = dict(entry)
        previous = existing[index]
        for carry in ("rationale", "recordedAt", "acknowledged"):
            if previous.get(carry) is not None:
                merged[carry] = previous[carry]
        if merged != previous:
            replacements.append({"op": "replace", "path": f"/deviations/{index}", "value": merged})
    removals = [
        {"op": "remove", "path": f"/deviations/{index}"}
        for index, entry in reversed(list(enumerate(existing)))
        if isinstance(entry, dict)
        and str(entry.get("id") or "").startswith(MANAGED_ID_PREFIX)
        and entry.get("id") not in desired_ids
    ]
    return replacements + removals + adds


def apply_register(
    spec: dict[str, Any], verdict_set: dict[str, Any], *, at: str | None = None
) -> dict[str, Any]:
    """Apply ``register_ops`` through the spec engine (provenance source ``engine``).

    Returns the spec unchanged (same object) when the register is already in sync.
    """
    ops = register_ops(spec, verdict_set, at=at)
    if not ops:
        return spec
    return apply_patch(
        spec,
        ops,
        provenance={"source": "engine", "detail": "deviation register sync"},
        at=at,
    )
