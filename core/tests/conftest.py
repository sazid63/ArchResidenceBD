"""Shared fixtures for the core test suite (introspection-free, repo-relative)."""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.interview import load_book

ROOT = pathlib.Path(__file__).resolve().parents[2]
BOOK_PATH = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
SPEC_SCHEMA_PATH = ROOT / "spec" / "schemas" / "building-spec.schema.json"


@pytest.fixture(scope="session")
def book():
    return load_book(BOOK_PATH)


@pytest.fixture(scope="session")
def spec_schema() -> dict:
    return json.loads(SPEC_SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def base_spec():
    """A minimal valid Building Spec for interview tests (2 storeys, no answers)."""

    def make(*, storeys: int = 2, name: str = "Interview Test", area: str = "sqm", length: str = "m") -> dict:
        phases = [
            {"id": "site-excavation", "kind": "site_excavation", "status": "not_started", "data": {}},
            {"id": "foundation", "kind": "foundation", "status": "not_started", "data": {}},
        ]
        for index in range(storeys):
            phases.append(
                {
                    "id": f"floor-{index}",
                    "kind": "floor",
                    "storeyIndex": index,
                    "status": "not_started",
                    "data": {},
                }
            )
        phases += [
            {"id": "roof-boundary", "kind": "roof_boundary", "status": "not_started", "data": {}},
            {"id": "common-services", "kind": "common_services", "status": "not_started", "data": {}},
        ]
        return {
            "schemaVersion": "0.1.0",
            "revision": 0,
            "project": {
                "id": "0f8fad5b-d9cb-469f-a165-70867728950e",
                "name": name,
                "language": "en",
                "displayUnits": {"length": length, "area": area, "currency": "BDT"},
            },
            "site": {
                "address": {"division": "Dhaka", "district": "Dhaka"},
                "plot": {"areaSqm": 100.0},
            },
            "building": {
                "occupancy": "residential",
                "structureType": "rcc_frame",
                "storeys": {"count": storeys},
            },
            "phases": phases,
        }

    return make
