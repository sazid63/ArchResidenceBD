"""Spec engine v0 (W1.3): validate, canonical hash, patch with provenance, diff.

Plan §5.4: the Building Spec is the single source of truth; machine-introduced values
carry provenance (plan §2.5); the compliance engine's one-click "restore to compliant"
applies `specPatch` ops through `apply_patch` (W0.9 verdict schema).

Pure functions only - revision numbering, timestamps and locking live in store.py.

Canonical form for `spec_sha256`: JSON with sorted object keys, compact separators,
UTF-8, no ASCII escaping. Revision metadata (`revision`, `locked`, `updatedAt`)
participates in the hash: a pin identifies an exact snapshot.
"""

from __future__ import annotations

import copy
import datetime
import hashlib
import json
from typing import Any

import jsonschema

from ._schema import load_schema
from .pointers import PointerError, add, escape_token, parse_pointer, remove, replace

RESERVED_TOP_LEVEL = ("revision", "locked", "updatedAt")


class SpecEngineError(RuntimeError):
    """Base error for the spec engine."""


class SpecValidationError(SpecEngineError):
    """The spec does not satisfy the Building Spec schema."""


class SpecPatchError(SpecEngineError):
    """A patch that cannot be applied cleanly (nothing partial is ever returned)."""


def utc_now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def validate_spec(spec: Any, *, schema: dict | None = None) -> None:
    """Validate a spec against the (packaged) Building Spec schema; raises on the first error."""
    schema = schema or load_schema()
    errors = sorted(
        jsonschema.Draft202012Validator(schema).iter_errors(spec),
        key=lambda e: [str(p) for p in e.absolute_path],
    )
    if not errors:
        return
    first = errors[0]
    path = "/" + "/".join(str(p) for p in first.absolute_path) if first.absolute_path else "<root>"
    raise SpecValidationError(f"{len(errors)} schema error(s); first at {path}: {first.message}")


def spec_sha256(spec: Any) -> str:
    """Canonical content hash of a spec (see module docstring for the canonical form)."""
    canonical = json.dumps(spec, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def ops_summary(ops: list[dict]) -> tuple[str, ...]:
    """Compact log lines like 'replace /site/soil/status' for the revision log."""
    return tuple(f"{op.get('op')} {op.get('path')}" for op in ops)


def _guard_reserved(path: str) -> None:
    tokens = parse_pointer(path)
    if tokens and tokens[0] in RESERVED_TOP_LEVEL:
        raise SpecPatchError(f"{path!r} is reserved ({tokens[0]!r} is managed by the revision store)")


def apply_patch(
    spec: dict,
    ops: list[dict],
    *,
    provenance: dict,
    at: str | None = None,
    schema: dict | None = None,
) -> dict:
    """Apply JSON-Patch-style ops to a copy of the spec.

    - Each op: {"op": "add" | "replace" | "remove", "path": <pointer>, "value": <any for add/replace>}.
    - `provenance` must carry a `source` (the schema's ProvenanceEntry enum) and may carry
      `detail` / `confidence`; one entry is recorded per touched path (plan §2.5).
    - The result is validated before it is returned; anything invalid raises and nothing partial escapes.
    - Reserved top-level paths (`revision`, `locked`, `updatedAt`) cannot be patched.
    """
    if not ops:
        raise SpecPatchError("empty patch - nothing to apply")
    if not isinstance(provenance, dict) or not provenance.get("source"):
        raise SpecPatchError("provenance with a 'source' is required (plan §2.5)")
    schema = schema or load_schema()

    entry: dict[str, Any] = {"source": provenance["source"]}
    if provenance.get("detail"):
        entry["detail"] = provenance["detail"]
    entry["at"] = at or provenance.get("at") or utc_now_iso()
    if provenance.get("confidence"):
        entry["confidence"] = provenance["confidence"]
    try:
        jsonschema.Draft202012Validator(schema["$defs"]["ProvenanceEntry"]).validate(entry)
    except jsonschema.ValidationError as exc:
        raise SpecPatchError(f"invalid provenance entry: {exc.message}") from exc

    work = copy.deepcopy(spec)
    for index, op in enumerate(ops):
        if not isinstance(op, dict):
            raise SpecPatchError(f"op {index}: must be an object")
        kind = op.get("op")
        path = op.get("path")
        if kind not in ("add", "replace", "remove"):
            raise SpecPatchError(f"op {index}: unknown op {kind!r}")
        if not isinstance(path, str):
            raise SpecPatchError(f"op {index}: path must be a string")
        _guard_reserved(path)
        try:
            if kind == "remove":
                remove(work, path)
            else:
                if "value" not in op:
                    raise SpecPatchError(f"op {index}: '{kind}' requires a value")
                work = add(work, path, op["value"]) if kind == "add" else replace(work, path, op["value"])
        except PointerError as exc:
            raise SpecPatchError(f"op {index} ({kind} {path}): {exc}") from exc

    if not isinstance(work, dict):
        raise SpecPatchError("patch replaced the document root with a non-object")
    for op in ops:
        work.setdefault("provenance", {})[op["path"]] = dict(entry)

    validate_spec(work, schema=schema)
    return work


def diff_specs(before: Any, after: Any) -> list[dict]:
    """Pointer-level diff between two specs: rows of {"path", "before"?, "after"?}."""
    missing = object()
    rows: list[dict] = []

    def walk(path: str, a: Any, b: Any) -> None:
        if a is missing and b is missing:
            return
        if a == b and a is not missing:
            return
        if isinstance(a, dict) and isinstance(b, dict):
            for key in sorted(set(a) | set(b)):
                walk(f"{path}/{escape_token(key)}", a.get(key, missing), b.get(key, missing))
            return
        if isinstance(a, list) and isinstance(b, list):
            for index in range(max(len(a), len(b))):
                walk(f"{path}/{index}", a[index] if index < len(a) else missing, b[index] if index < len(b) else missing)
            return
        row: dict[str, Any] = {"path": path}
        if a is not missing:
            row["before"] = a
        if b is not missing:
            row["after"] = b
        rows.append(row)

    walk("", before, after)
    return rows
