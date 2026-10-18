"""Source Registry v0 (W0.10): load/validate the registry + stdlib fetcher with provenance.

Plan §5.10: the AI fetches through the registry, never by blind search; results are
cached per source with provenance (sourceId, url, retrievedAt, sha256 of the artifact).
Stdlib only - no new dependencies. The product's price service (W2.7) calls this module;
tools/sources/fetch_source.py is the thin dev/ops wrapper.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import jsonschema
import yaml

USER_AGENT = "ArchResidenceBD-source-fetcher/0.1 (offline-first; local use)"
ALLOWED_SCHEMES = ("http", "https")

_KNOWN_EXTS = (".pdf", ".csv", ".json", ".html", ".htm", ".txt", ".xml", ".png", ".jpg", ".jpeg")
_EXT_BY_CONTENT_TYPE = {
    "application/pdf": ".pdf",
    "application/json": ".json",
    "application/xml": ".xml",
    "text/csv": ".csv",
    "text/html": ".html",
    "text/plain": ".txt",
}


class SourceFetchError(RuntimeError):
    """A fetch that must surface to the caller as a clean failure (never a silent gap)."""


def load_registry(path: str | pathlib.Path) -> dict:
    """Load a source-registry YAML document."""
    data = yaml.safe_load(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SourceFetchError(f"registry at {path} must be a YAML mapping")
    return data


def validate_registry(registry: dict, schema_path: str | pathlib.Path) -> None:
    """Validate against the source-registry JSON Schema; raises jsonschema.ValidationError."""
    schema = json.loads(pathlib.Path(schema_path).read_text(encoding="utf-8"))
    jsonschema.Draft202012Validator(schema).validate(registry)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _stamp(now: datetime) -> str:
    return now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _ext_for(url: str, content_type: str) -> str:
    suffix = pathlib.Path(urllib.parse.urlsplit(url).path).suffix.lower()
    if suffix in _KNOWN_EXTS:
        return suffix
    return _EXT_BY_CONTENT_TYPE.get(content_type, ".bin")


def fetch_url(
    url: str,
    dest_dir: str | pathlib.Path,
    *,
    source_id: str,
    now: datetime | None = None,
    timeout: float = 30.0,
) -> dict:
    """Fetch one URL into dest_dir; returns a provenance record (sha256, size, retrievedAt).

    Only http/https are allowed - fetching is explicit, never a side effect.
    """
    scheme = urllib.parse.urlsplit(url).scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise SourceFetchError(f"refusing non-http(s) URL: {url!r}")
    now = now or utc_now()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - scheme checked above
            data = response.read()
            content_type = response.headers.get_content_type()
            status = getattr(response, "status", 200)
    except OSError as exc:  # URLError, HTTPError, timeouts
        raise SourceFetchError(f"fetch failed for {url!r}: {exc}") from exc

    sha256 = hashlib.sha256(data).hexdigest()
    file_name = f"{_stamp(now)}-{sha256[:12]}{_ext_for(url, content_type)}"
    dest = pathlib.Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / file_name).write_bytes(data)
    return {
        "sourceId": source_id,
        "url": url,
        "retrievedAt": now.astimezone(timezone.utc).isoformat(timespec="seconds"),
        "sha256": sha256,
        "sizeBytes": len(data),
        "contentType": content_type,
        "status": status,
        "fileName": file_name,
    }


def append_manifest(cache_root: str | pathlib.Path, record: dict) -> None:
    """Append one provenance record to the cache manifest (JSON Lines)."""
    path = pathlib.Path(cache_root) / "manifest.jsonl"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def manifest_rows(cache_root: str | pathlib.Path) -> list[dict]:
    """Read all provenance records from the cache manifest."""
    path = pathlib.Path(cache_root) / "manifest.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def fetch_source(entry: dict, cache_root: str | pathlib.Path, *, now: datetime | None = None, timeout: float = 30.0) -> dict:
    """Fetch a registry entry (by its dict) into cache_root/<sourceId> and record provenance."""
    source_id = entry.get("id")
    url = entry.get("url")
    if not source_id:
        raise SourceFetchError("registry entry has no id")
    if not url:
        raise SourceFetchError(f"source {source_id!r} has no url (kind {entry.get('kind')!r}) - not fetchable")
    record = fetch_url(url, pathlib.Path(cache_root) / source_id, source_id=source_id, now=now, timeout=timeout)
    append_manifest(cache_root, record)
    return record


def is_fresh(record: dict, ttl_days: int, *, now: datetime | None = None) -> bool:
    """Cache freshness: True while the record is younger than its TTL."""
    retrieved = datetime.fromisoformat(record["retrievedAt"])
    now = now or utc_now()
    return now - retrieved < timedelta(days=ttl_days)
