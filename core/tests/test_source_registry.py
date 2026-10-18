"""W0.10 Source Registry: registry honesty rules + fetcher/cache provenance (no real network)."""

from __future__ import annotations

import copy
import hashlib
import http.server
import json
import pathlib
import threading
from datetime import datetime, timedelta, timezone

import pytest
import yaml
from jsonschema import Draft202012Validator, ValidationError

from archres_core import sources as src

ROOT = pathlib.Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT / "spec" / "sources" / "registry.yaml"
SCHEMA_PATH = ROOT / "spec" / "schemas" / "source-registry.schema.json"
PACK_PATH = ROOT / "spec" / "rules" / "rajuk-2008.yaml"

PAYLOAD = b"item,rate\ncement,550\nrod,89000\n"
FIXED_NOW = datetime(2026, 10, 18, 9, 0, tzinfo=timezone.utc)


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - http.server API
        if self.path == "/rate.csv":
            self.send_response(200)
            self.send_header("Content-Type", "text/csv")
            self.send_header("Content-Length", str(len(PAYLOAD)))
            self.end_headers()
            self.wfile.write(PAYLOAD)
        else:
            self.send_error(404)

    def log_message(self, *args: object) -> None:  # keep pytest output clean
        pass


@pytest.fixture(scope="module")
def http_base() -> str:
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}"
    server.shutdown()
    thread.join(timeout=5)


@pytest.fixture(scope="module")
def registry() -> dict:
    return src.load_registry(REGISTRY_PATH)


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


# --- registry honesty -------------------------------------------------------


def test_registry_validates(registry: dict, schema: dict) -> None:
    Draft202012Validator(schema).validate(registry)
    src.validate_registry(registry, SCHEMA_PATH)


def test_ids_are_unique_slugs(registry: dict) -> None:
    ids = [entry["id"] for entry in registry["sources"]]
    assert len(ids) == len(set(ids))
    for entry in registry["sources"]:
        assert entry["id"] == entry["id"].lower()


def test_every_data_type_is_covered(registry: dict, schema: dict) -> None:
    known = set(schema["$defs"]["Source"]["properties"]["dataTypes"]["items"]["enum"])
    covered: set[str] = set()
    for entry in registry["sources"]:
        covered.update(entry["dataTypes"])
    missing = known - covered
    assert not missing, f"data types with no source: {sorted(missing)}"


def test_active_sources_are_verified(registry: dict) -> None:
    for entry in registry["sources"]:
        if entry["status"] == "active":
            assert entry.get("lastVerified"), f"{entry['id']} is active without lastVerified"


def test_rajuk_artifact_pins_to_the_rule_pack(registry: dict) -> None:
    pack = yaml.safe_load(PACK_PATH.read_text(encoding="utf-8"))
    entry = next(e for e in registry["sources"] if e["id"] == "rajuk-bidhimala-2008")
    assert entry["artifact"]["sha256"] == pack["source"]["sha256"]
    assert entry["artifact"]["fileName"] == pack["source"]["fileName"]
    assert entry["artifact"]["pages"] == pack["source"]["pdfPages"]
    assert entry["artifact"]["sizeBytes"] == 1946482  # recorded in tools/rules/gazette/README.md


def test_schema_rejects_mutations(registry: dict, schema: dict) -> None:
    validator = Draft202012Validator(schema)

    def _assert_invalid(mutate) -> None:
        data = copy.deepcopy(registry)
        mutate(data)
        assert list(validator.iter_errors(data)), "mutation should have been rejected"

    def _entry(data: dict, entry_id: str) -> dict:
        return next(e for e in data["sources"] if e["id"] == entry_id)

    # a manual process cannot pretend to have a URL
    _assert_invalid(lambda d: _entry(d, "market-survey-manual").update({"url": "https://example.com/"}))
    # active means verified
    _assert_invalid(lambda d: _entry(d, "bwdb-schedule-of-rates").pop("lastVerified"))
    # fetchable kinds need a URL
    _assert_invalid(lambda d: _entry(d, "bbs-price-wage").pop("url"))
    # non-static fetchable sources must state their cache window
    _assert_invalid(lambda d: _entry(d, "bbs-price-wage").pop("cacheTtlDays"))
    # bad sha256 pattern
    _assert_invalid(lambda d: _entry(d, "rajuk-bidhimala-2008")["artifact"].update({"sha256": "not-a-hash"}))
    with pytest.raises(ValidationError):
        data = copy.deepcopy(registry)
        _entry(data, "bbs-price-wage").pop("url")
        src.validate_registry(data, SCHEMA_PATH)


# --- fetcher + cache provenance --------------------------------------------


def test_fetch_url_hashes_and_stores(tmp_path: pathlib.Path, http_base: str) -> None:
    record = src.fetch_url(f"{http_base}/rate.csv", tmp_path, source_id="t-src", now=FIXED_NOW)
    assert record["sha256"] == hashlib.sha256(PAYLOAD).hexdigest()
    assert record["sizeBytes"] == len(PAYLOAD)
    assert record["contentType"] == "text/csv"
    assert record["retrievedAt"] == "2026-10-18T09:00:00+00:00"
    assert record["status"] == 200
    assert record["url"] == f"{http_base}/rate.csv"
    assert (tmp_path / record["fileName"]).read_bytes() == PAYLOAD
    assert record["fileName"].endswith(".csv")


def test_fetch_source_records_manifest(tmp_path: pathlib.Path, http_base: str) -> None:
    entry = {"id": "t-src", "url": f"{http_base}/rate.csv", "kind": "http-csv"}
    record = src.fetch_source(entry, tmp_path, now=FIXED_NOW)
    assert src.manifest_rows(tmp_path) == [record]
    assert (tmp_path / "t-src" / record["fileName"]).is_file()


def test_manifest_rows_empty_when_no_cache(tmp_path: pathlib.Path) -> None:
    assert src.manifest_rows(tmp_path) == []


def test_is_fresh_respects_ttl() -> None:
    record = {"retrievedAt": FIXED_NOW.isoformat(timespec="seconds")}
    assert src.is_fresh(record, 30, now=FIXED_NOW + timedelta(days=29))
    assert not src.is_fresh(record, 30, now=FIXED_NOW + timedelta(days=31))


def test_fetch_refuses_non_http(tmp_path: pathlib.Path) -> None:
    with pytest.raises(src.SourceFetchError):
        src.fetch_url("file:///etc/hosts", tmp_path, source_id="t-src")


def test_fetch_source_requires_url(tmp_path: pathlib.Path) -> None:
    with pytest.raises(src.SourceFetchError):
        src.fetch_source({"id": "market-survey-manual", "kind": "manual-entry"}, tmp_path)


def test_fetch_failure_is_a_clean_error(tmp_path: pathlib.Path, http_base: str) -> None:
    with pytest.raises(src.SourceFetchError):
        src.fetch_url(f"{http_base}/missing.csv", tmp_path, source_id="t-src")
