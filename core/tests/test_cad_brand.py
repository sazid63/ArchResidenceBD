"""The brand law (W2.13 follow-up): the products' names, and the upstream project's absence."""

from __future__ import annotations

import json
import pathlib
import zipfile

from archres_core.cad.brand import (
    PRODUCT_APP,
    PRODUCT_CAD,
    document_problems,
    dxf_problems,
    find_engine_name,
    product_version,
    producer_for,
)
from archres_core.design import design_foundation, design_typical_floor, design_sheet

ROOT = pathlib.Path(__file__).resolve().parents[2]
DRAWINGS = ROOT / "data" / "cad" / "generated" / "drawing-set"
DOCUMENTS = ROOT / "data" / "documents"
PACK = ROOT / "data" / "handoff" / "engineer-review-pack.zip"


def test_the_products_are_named() -> None:
    assert PRODUCT_APP == "ArchResidenceBD"
    assert PRODUCT_CAD == "NativeCAD"


def test_the_finder_locates_the_upstream_name() -> None:
    assert find_engine_name("all good\nFreeCAD v1.1\n") == ["FreeCAD v1.1"]
    assert find_engine_name("NativeCAD (ArchResidenceBD)\n") == []


def test_a_clean_document_has_no_problems(tmp_path: pathlib.Path) -> None:
    good = tmp_path / "page.svg"
    good.write_text("<svg>NativeCAD (ArchResidenceBD)</svg>", encoding="utf-8")
    assert document_problems(good) == []
    bad = tmp_path / "bad.svg"
    bad.write_text("<svg>FreeCAD v1.1</svg>", encoding="utf-8")
    assert document_problems(bad)


def test_a_dxf_is_checked_for_the_name_and_for_its_structure(tmp_path: pathlib.Path) -> None:
    good = tmp_path / "page.dxf"
    good.write_text(
        "NativeCAD (ArchResidenceBD)\nSECTION\nHEADER\nSECTION\nENTITIES\nLINE\n", encoding="utf-8"
    )
    assert dxf_problems(good) == []
    # a stripped file that lost its structure is a failure in its own right
    broken = tmp_path / "broken.dxf"
    broken.write_text("NativeCAD (ArchResidenceBD)\n", encoding="utf-8")
    problems = dxf_problems(broken)
    assert any("structure" in problem for problem in problems)
    # and a file that still names the upstream project is a failure
    named = tmp_path / "named.dxf"
    named.write_text("FreeCAD v1.1\nSECTION\nENTITIES\nLINE\n", encoding="utf-8")
    assert dxf_problems(named)


def test_the_committed_drawings_carry_the_cad_and_not_the_upstream_name() -> None:
    for index in (1, 2, 3):
        dxf = DRAWINGS / f"page-{index}.dxf"
        assert dxf.is_file(), dxf
        assert dxf_problems(dxf) == []
        assert PRODUCT_CAD in dxf.read_text(encoding="latin-1", errors="replace")


def test_the_committed_documents_carry_the_app() -> None:
    for name in ("bar-schedule.pdf", "bill-of-quantities.pdf"):
        path = DOCUMENTS / name
        data = path.read_bytes()
        assert PRODUCT_APP.encode() in data, name
        assert b"freecad" not in data.lower(), name


def test_the_pack_carries_the_cad_and_names_the_app() -> None:
    with zipfile.ZipFile(PACK) as archive:
        names = archive.namelist()
        assert any(name.endswith(".dxf") for name in names), "the handoff must carry the CAD"
        readme = archive.read("README.md").decode("utf-8")
        assert PRODUCT_APP in readme or PRODUCT_CAD in readme
        for name in names:
            if name.lower().endswith((".dxf", ".svg", ".pdf", ".xlsx", ".html", ".md", ".json")):
                assert b"freecad" not in archive.read(name).lower(), name


def test_the_version_is_the_apps() -> None:
    manifest = json.loads((ROOT / "app" / "package.json").read_text(encoding="utf-8"))
    assert product_version(ROOT) == manifest["version"]
    assert producer_for(PRODUCT_APP).startswith(PRODUCT_APP)


def test_the_sheet_names_the_storey_it_shows() -> None:
    """The sheet must not call the first floor the ground floor."""
    spec = json.loads((ROOT / "spec" / "examples" / "two-storey-residential.json").read_text(
        encoding="utf-8"
    ))
    foundation = design_foundation(spec)
    for storey, expected in ((0, "FLOOR 0 PLAN"), (1, "FLOOR 1 PLAN")):
        floor = design_typical_floor(spec, foundation, storey_index=storey)
        sheet = design_sheet(spec, foundation, floor)
        labels = [view["label"] for view in sheet.views]
        assert expected in labels, labels
        assert "GROUND FLOOR PLAN" not in labels or storey == 0
        assert f"Floor {storey}" in sheet.sheet_title
