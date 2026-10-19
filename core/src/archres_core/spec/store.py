"""Spec revision store v0 (W1.3): immutable snapshots + an append-only log.

The Building Spec JSON keeps only `revision` / `locked` / timestamps; the full history
lives here (schema note: "history lives outside this JSON").

Layout:
    <root>/revisions/<sha256>.json   - full snapshot per revision (never rewritten)
    <root>/log.jsonl                 - append-only: number, sha256, parent, createdAt,
                                       note, locked, ops summary

Law:
    - snapshots are immutable; identical content is never recorded twice (idempotent commits)
    - commits only from the current tip; a locked tip must be reopened() first
    - lock()/reopen() are themselves revisions (metadata-only changes), so the log tells
      the whole story
"""

from __future__ import annotations

import copy
import json
import pathlib
from dataclasses import dataclass

from .engine import (
    SpecEngineError,
    apply_patch,
    ops_summary,
    spec_sha256,
    utc_now_iso,
    validate_spec,
)


#: Revision metadata is rewritten by the store, not authored by a patch (see engine.py).
_METADATA_PATHS = frozenset({"/revision", "/locked", "/updatedAt"})


def _diff_op(row: dict) -> str:
    if "before" not in row:
        return "add"
    if "after" not in row:
        return "remove"
    return "replace"


class SpecStoreError(SpecEngineError):
    """A revision-store operation that violates the store law."""


@dataclass(frozen=True)
class Revision:
    number: int
    sha256: str
    createdAt: str
    note: str
    locked: bool
    parentSha256: str | None = None
    ops: tuple[str, ...] = ()


class SpecStore:
    """Directory-backed revision DAG for one project."""

    def __init__(self, root: str | pathlib.Path) -> None:
        self.root = pathlib.Path(root)
        self.revisions_dir = self.root / "revisions"
        self.log_path = self.root / "log.jsonl"

    # -- creation ---------------------------------------------------------

    @classmethod
    def create(
        cls,
        root: str | pathlib.Path,
        spec: dict,
        *,
        note: str = "project created",
        at: str | None = None,
    ) -> "SpecStore":
        store = cls(root)
        if store.log_path.exists():
            raise SpecStoreError(f"store already exists at {store.root}")
        created = copy.deepcopy(spec)
        created["revision"] = 0
        created["locked"] = False
        created.setdefault("createdAt", at or utc_now_iso())
        created["updatedAt"] = at or utc_now_iso()
        validate_spec(created)
        revision = Revision(
            number=0,
            sha256=spec_sha256(created),
            createdAt=created["updatedAt"],
            note=note,
            locked=False,
        )
        store._record(created, revision)
        return store

    # -- reads ------------------------------------------------------------

    def revisions(self) -> list[Revision]:
        if not self.log_path.exists():
            return []
        rows = []
        for line in self.log_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            row["ops"] = tuple(row.get("ops", ()))
            rows.append(Revision(**row))
        return rows

    def tip(self) -> Revision:
        revisions = self.revisions()
        if not revisions:
            raise SpecStoreError(f"no revisions in store {self.root}")
        return revisions[-1]

    def load(self, sha256: str) -> dict:
        path = self.revisions_dir / f"{sha256}.json"
        if not path.exists():
            raise SpecStoreError(f"unknown revision {sha256!r}")
        return json.loads(path.read_text(encoding="utf-8"))

    def diff(self, sha_before: str, sha_after: str) -> list[dict]:
        from .engine import diff_specs

        return diff_specs(self.load(sha_before), self.load(sha_after))

    # -- writes -----------------------------------------------------------

    def commit(
        self,
        parent_sha256: str,
        ops: list[dict],
        *,
        provenance: dict,
        note: str = "",
        at: str | None = None,
    ) -> Revision:
        tip = self.tip()
        if parent_sha256 != tip.sha256:
            raise SpecStoreError("can only commit from the current tip")
        if tip.locked:
            raise SpecStoreError("the tip revision is locked - reopen() it first")
        parent = self.load(parent_sha256)
        patched = apply_patch(parent, ops, provenance=provenance, at=at)
        patched["revision"] = parent["revision"] + 1
        patched["locked"] = False
        patched["updatedAt"] = at or utc_now_iso()
        validate_spec(patched)
        revision = Revision(
            number=patched["revision"],
            sha256=spec_sha256(patched),
            createdAt=patched["updatedAt"],
            note=note,
            locked=False,
            parentSha256=parent_sha256,
            ops=ops_summary(ops),
        )
        return self._record(patched, revision)

    def commit_snapshot(
        self,
        parent_sha256: str,
        spec: dict,
        *,
        at: str | None = None,
        note: str = "",
    ) -> Revision:
        """Record an already-patched working draft as the next revision.

        The interview/orchestrator applies patches to its own copy of the spec (so every
        path carries its own provenance entry); this records that exact draft instead of
        re-applying ops with a second, coarser provenance entry. The revision's op summary
        is derived from the pointer-level diff against the parent, so the log stays honest.
        """
        from .engine import diff_specs

        tip = self.tip()
        if parent_sha256 != tip.sha256:
            raise SpecStoreError("can only commit from the current tip")
        if tip.locked:
            raise SpecStoreError("the tip revision is locked - reopen() it first")
        parent = self.load(parent_sha256)
        if not isinstance(spec, dict):
            raise SpecStoreError("a spec snapshot must be an object")
        patched = copy.deepcopy(spec)
        patched["revision"] = parent["revision"] + 1
        patched["locked"] = False
        patched["updatedAt"] = at or utc_now_iso()
        validate_spec(patched)
        diff = diff_specs(parent, patched)
        content = [row for row in diff if row["path"] not in _METADATA_PATHS]
        if not content:
            raise SpecStoreError("nothing changed - the snapshot equals the parent content")
        ops = tuple(
            f"{_diff_op(row)} {row['path']}"
            for row in content
        )
        revision = Revision(
            number=patched["revision"],
            sha256=spec_sha256(patched),
            createdAt=patched["updatedAt"],
            note=note,
            locked=False,
            parentSha256=parent_sha256,
            ops=ops,
        )
        return self._record(patched, revision)

    def lock(self, sha256: str, *, at: str | None = None, note: str = "locked for engineer review") -> Revision:
        tip = self.tip()
        if sha256 != tip.sha256:
            raise SpecStoreError("only the current tip can be locked")
        if tip.locked:
            raise SpecStoreError("the tip is already locked")
        spec = self.load(sha256)
        spec["locked"] = True
        spec["revision"] += 1
        spec["updatedAt"] = at or utc_now_iso()
        revision = Revision(
            number=spec["revision"],
            sha256=spec_sha256(spec),
            createdAt=spec["updatedAt"],
            note=note,
            locked=True,
            parentSha256=sha256,
        )
        return self._record(spec, revision)

    def reopen(self, sha256: str, *, at: str | None = None, note: str = "reopened") -> Revision:
        tip = self.tip()
        if sha256 != tip.sha256:
            raise SpecStoreError("only the current tip can be reopened")
        if not tip.locked:
            raise SpecStoreError("the tip is not locked")
        spec = self.load(sha256)
        spec["locked"] = False
        spec["revision"] += 1
        spec["updatedAt"] = at or utc_now_iso()
        revision = Revision(
            number=spec["revision"],
            sha256=spec_sha256(spec),
            createdAt=spec["updatedAt"],
            note=note,
            locked=False,
            parentSha256=sha256,
        )
        return self._record(spec, revision)

    # -- internals ----------------------------------------------------------

    def _record(self, spec: dict, revision: Revision) -> Revision:
        existing = [r for r in self.revisions() if r.sha256 == revision.sha256]
        if existing:
            return existing[0]  # identical content: idempotent, never recorded twice
        self.revisions_dir.mkdir(parents=True, exist_ok=True)
        snapshot = self.revisions_dir / f"{revision.sha256}.json"
        snapshot.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        row = {
            "number": revision.number,
            "sha256": revision.sha256,
            "createdAt": revision.createdAt,
            "note": revision.note,
            "locked": revision.locked,
            "ops": list(revision.ops),
        }
        if revision.parentSha256 is not None:
            row["parentSha256"] = revision.parentSha256
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
        return revision
