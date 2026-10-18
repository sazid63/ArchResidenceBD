"""W0.8 model-card hygiene: cards pin to the fleet registry; publish-ready rules hold."""

from __future__ import annotations

import json
import pathlib
import re

import pytest
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODELS = ROOT / "spec" / "models"
CARDS = MODELS / "cards"
REGISTRY: dict = json.loads((MODELS / "registry.json").read_text(encoding="utf-8"))

CARD_FILES = sorted(p for p in CARDS.glob("*.md") if p.name != "README.md")
CARD_VERSION = "0.1.0"

REQUIRED_SECTIONS = [
    "## Narrow task contract",
    "## Intended use",
    "## Out of scope",
    "## Training data",
    "## Evaluation",
    "## Limitations",
    "## Licence & attribution",
    "## Provenance",
]

HF_REPO_RE = re.compile(r"^[A-Za-z0-9][\w.-]*/[A-Za-z0-9][\w.-]*$")

# front-matter key -> path into a registry model entry
REGISTRY_MAP = {
    "role": ("role",),
    "displayNameEn": ("displayName", "en"),
    "displayNameBn": ("displayName", "bn"),
    "upstreamRepo": ("upstream", "repo"),
    "upstreamLicense": ("upstream", "license"),
    "distribution": ("distribution",),
    "artifactSha256": ("artifact", "sha256"),
    "artifactSizeBytes": ("artifact", "sizeBytes"),
}


def _load_card(path: pathlib.Path) -> tuple[dict, str]:
    text = path.read_text(encoding="utf-8")
    assert text.startswith("---\n"), f"{path.name}: missing YAML front matter"
    end = text.index("\n---", 4)
    front_matter = yaml.safe_load(text[4:end])
    assert isinstance(front_matter, dict), f"{path.name}: front matter must be a mapping"
    return front_matter, text[end + 4 :]


def _models_by_id() -> dict[str, dict]:
    return {m["id"]: m for m in REGISTRY["models"]}


def test_readme_and_publishing_recipe_exist() -> None:
    assert (CARDS / "README.md").is_file()
    assert (MODELS / "publishing.md").is_file()


def test_registry_and_cards_are_one_to_one() -> None:
    registry_ids = set(_models_by_id())
    card_ids = {_load_card(p)[0]["id"] for p in CARD_FILES}
    assert card_ids == registry_ids, "every registry entry needs exactly one card and vice versa"


@pytest.mark.parametrize("card_path", CARD_FILES, ids=lambda p: p.stem)
def test_front_matter_matches_registry(card_path: pathlib.Path) -> None:
    front_matter, _ = _load_card(card_path)
    model = _models_by_id()[front_matter["id"]]
    assert front_matter["cardVersion"] == CARD_VERSION
    for key, path in REGISTRY_MAP.items():
        expected = model
        for part in path:
            expected = expected[part]
        assert front_matter[key] == expected, f"{card_path.name}: {key} drifted from the registry"
    assert front_matter["license"], "a derivative licence must be stated"


@pytest.mark.parametrize("card_path", CARD_FILES, ids=lambda p: p.stem)
def test_required_sections_present(card_path: pathlib.Path) -> None:
    _, body = _load_card(card_path)
    for section in REQUIRED_SECTIONS:
        assert section in body, f"{card_path.name}: missing section {section!r}"


@pytest.mark.parametrize("card_path", CARD_FILES, ids=lambda p: p.stem)
def test_status_lifecycle_and_publish_hygiene(card_path: pathlib.Path) -> None:
    front_matter, body = _load_card(card_path)
    status = front_matter["status"]
    assert status in {"skeleton", "draft", "published"}, f"{card_path.name}: bad status {status!r}"
    hf_repo = front_matter["hfRepo"]
    if status == "published":
        assert "TBD" not in body, f"{card_path.name}: published cards must not contain TBD"
        assert HF_REPO_RE.match(hf_repo), f"{card_path.name}: published card needs a hub repo"
    else:
        assert hf_repo == "", f"{card_path.name}: hfRepo stays empty until published"
