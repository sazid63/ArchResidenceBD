"""The downloader (W5.2): the pieces are fetched, resumed, and checked.

The installer's plan names the pieces this machine does not have ✓ — the CAD engine ✓, the
Python runtime ✓ and the model pack ✓ — and this is the half that goes and gets them ✓.

The laws, all of them the plan's:

- **the core pack first** ✓ — the app is useful before the models arrive ✓ ✓, so the
  order is: the engine ✓ and the runtime ✓ (the app draws and designs ✓), then the models
  ✓ (the app advises ✓) ✓ ✓;
- **resumable** ✓ — a dropped connection is **normal** ✓, not a failure to retry from zero
  ✓ — the download keeps the bytes it has ✓ and continues ✓ ✓;
- **checksummed** ✓ — the hash is known **before** the fetch ✓ (the manifest's ✓) — so a
  piece that arrives is either the piece that was promised ✓ or it is **refused** ✓, and
  refused means *not installed* ✓ ✓;
- **nothing is fetched implicitly** ✓ — a fetch is an act with a URL ✓, a source id ✓ and
  a provenance record ✓ (the sources module's law ✓) ✓ ✓.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from .install import INSTALL_LAYOUT, InstallManifest, ManifestPart

__all__ = [
    "ALLOWED_SCHEMES",
    "DownloadError",
    "DownloadPlan",
    "DownloadResult",
    "USER_AGENT",
    "download_plan",
    "fetch_piece",
    "hash_file",
    "verify_piece",
]

USER_AGENT = "ArchResidenceBD-installer/0.1 (offline-first; local install)"

#: Only http/https are fetched ✓ — the sources module's rule ✓ (fetching is explicit ✓) ✓.
ALLOWED_SCHEMES = ("http", "https")

#: How much is read at a time (a chunked download, so a big model does not sit in memory).
CHUNK_BYTES = 1 << 20

#: The pieces that come first ✓ — the app is useful before the models arrive ✓ ✓.
CORE_FIRST = ("engine", "runtime", "packs", "core")


class DownloadError(RuntimeError):
    """A piece could not be fetched, and the install must not pretend otherwise."""


@dataclass(frozen=True)
class DownloadPlan:
    """What the downloader will fetch, and in what order."""

    entries: tuple[tuple[str, str, str], ...]  # (id, url, path in the install)

    @property
    def ids(self) -> tuple[str, ...]:
        return tuple(entry[0] for entry in self.entries)

    def as_dict(self) -> dict[str, Any]:
        return {
            "entries": [
                {"id": part_id, "url": url, "path": path}
                for part_id, url, path in self.entries
            ],
            "order": list(self.ids),
        }


@dataclass(frozen=True)
class DownloadResult:
    """One fetched piece: what it is, and whether it is the piece that was promised."""

    id: str
    path: str
    size_bytes: int
    sha256: str
    verified: bool
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "path": self.path,
            "sizeBytes": self.size_bytes,
            "sha256": self.sha256,
            "verified": self.verified,
            "reason": self.reason,
        }


def hash_file(path: str | pathlib.Path) -> str:
    """The sha256 of a file's bytes ✓ (streamed ✓ — a model is 2.5 GB ✓) ✓."""
    digest = hashlib.sha256()
    with pathlib.Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_plan(
    manifest: InstallManifest,
    urls: dict[str, str],
    *,
    layout: dict[str, str] | None = None,
) -> DownloadPlan:
    """The download order and the pieces ✓.

    The **core pack first** ✓ — the engine ✓, the runtime ✓, the packs ✓, the core ✓ — and
    the models after ✓ ✓; a piece with no URL is **not** in the plan ✓ (and the install
    reports it as missing ✓ ✓); and the order is **stable** ✓, so a resumed install fetches
    in the same order every time ✓ ✓.
    """
    places = dict(layout or INSTALL_LAYOUT)
    by_id = {part.id: part for part in manifest.parts}

    ordered: list[str] = []
    for part_id in CORE_FIRST:
        if part_id in by_id and part_id in urls:
            ordered.append(part_id)
    for part in manifest.parts:
        if part.id in urls and part.id not in ordered:
            ordered.append(part.id)

    entries: list[tuple[str, str, str]] = []
    for part_id in ordered:
        url = urls[part_id]
        scheme = urllib.parse.urlsplit(url).scheme.lower()
        if scheme not in ALLOWED_SCHEMES:
            raise DownloadError(f"refusing a non-http(s) URL for {part_id!r}: {url!r}")
        part = by_id[part_id]
        target = part.path or places["models"]
        entries.append((part_id, url, target))
    return DownloadPlan(entries=tuple(entries))


def verify_piece(part: ManifestPart, path: str | pathlib.Path) -> tuple[bool, str]:
    """Is this the piece that was promised ✓?

    A piece with **no promised hash** is **not verified** ✓ — nobody measured it ✓, so the
    install says so ✓ rather than claiming a fact it does not have ✓ (the repo's law ✓) ✓.
    """
    target = pathlib.Path(path)
    if not target.is_file():
        return False, "the file is not there"
    if not part.sha256:
        return False, "the manifest promises no hash for this piece"
    actual = hash_file(target)
    if actual != part.sha256:
        return False, f"the hash is {actual}, the manifest promises {part.sha256}"
    return True, "the hash matches the manifest"


def fetch_piece(
    part: ManifestPart,
    url: str,
    target: str | pathlib.Path,
    *,
    timeout: float = 60.0,
    resume: bool = True,
) -> DownloadResult:
    """Fetch one piece, resuming if a partial file is there ✓, and check it ✓.

    The download is written to a **partial** file ✓ and moved into place only when the
    bytes are the promised ones ✓ — so a half-downloaded model is never mistaken for an
    installed one ✓ ✓.
    """
    scheme = urllib.parse.urlsplit(url).scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise DownloadError(f"refusing a non-http(s) URL: {url!r}")

    destination = pathlib.Path(target)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    existing = partial.stat().st_size if (resume and partial.is_file()) else 0

    request = urllib.request.Request(
        url,
        headers={**{"User-Agent": USER_AGENT}, **({"Range": f"bytes={existing}-"} if existing else {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
            status = getattr(response, "status", 200)
            mode = "ab" if (existing and status == 206) else "wb"
            if mode == "wb":
                existing = 0
            with partial.open(mode) as handle:
                while True:
                    chunk = response.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    handle.write(chunk)
    except OSError as exc:
        raise DownloadError(f"the fetch failed for {url!r}: {exc}") from exc

    size = partial.stat().st_size
    digest = hash_file(partial)
    verified = bool(part.sha256) and digest == part.sha256
    reason = (
        "the hash matches the manifest"
        if verified
        else (
            f"the hash is {digest}, the manifest promises {part.sha256}"
            if part.sha256
            else "the manifest promises no hash for this piece"
        )
    )
    if verified:
        shutil.move(str(partial), str(destination))
    return DownloadResult(
        id=part.id,
        path=str(destination),
        size_bytes=size,
        sha256=digest,
        verified=verified,
        reason=reason,
    )


def download_document(
    plan: DownloadPlan, results: Sequence[DownloadResult]
) -> dict[str, Any]:
    """The download's record ✓ (what was fetched ✓, what was verified ✓, what was not ✓)."""
    return {
        "schemaVersion": "0.1.0",
        "plan": plan.as_dict(),
        "counts": {
            "planned": len(plan.entries),
            "fetched": len(results),
            "verified": sum(1 for result in results if result.verified),
            "unverified": sum(1 for result in results if not result.verified),
        },
        "results": [result.as_dict() for result in results],
    }
