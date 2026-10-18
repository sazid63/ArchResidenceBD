# AUTO-GENERATED from spec/schemas/model-registry.schema.json - do not edit.
# Regenerate: python tools/codegen/generate_interfaces.py

from __future__ import annotations

from pydantic import AnyUrl, BaseModel, ConfigDict, Field, RootModel
from enum import StrEnum
from typing import Literal


class Localized(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    bn: str = Field(..., min_length=1)
    en: str = Field(..., min_length=1)


class Role(StrEnum):
    """
    Fleet role v0 (S2 roster). One entry per role in the shipped fleet.
    """

    chat = 'chat'
    repair = 'repair'
    embed = 'embed'
    rerank = 'rerank'


class SwapGroup(StrEnum):
    """
    S2 policy groups: gpu-models swap exclusively (one resident in VRAM at a time); cpu-services stay persistent and are pinned to CPU (gpuLayers 0).
    """

    gpu_models = 'gpu-models'
    cpu_services = 'cpu-services'


class Distribution(StrEnum):
    """
    bundled = ships inside the one installer (P1 plan); downloadable = fetched from the registry's HF source on demand; candidate = evaluated, not shipped; training = placeholder awaiting a fine-tune.
    """

    bundled = 'bundled'
    downloadable = 'downloadable'
    candidate = 'candidate'
    training = 'training'


class Upstream(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    repo: str = Field(..., min_length=1)
    """
    Upstream repository id, e.g. 'Qwen/Qwen3-4B-Instruct-2507'. Internal provenance.
    """
    license: str = Field(..., min_length=1)
    """
    SPDX license id of the upstream weights, e.g. 'Apache-2.0'. Feeds the Licences screen notices.
    """
    url: AnyUrl | None = None
    revision: str | None = Field(None, min_length=1)
    """
    Upstream revision/commit the artifact was built from, when known.
    """


class Artifact(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    file: str = Field(..., min_length=1)
    """
    File name inside the models directory, e.g. 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'.
    """
    format: Literal['gguf']
    quantization: str = Field(..., min_length=1)
    """
    e.g. Q4_K_M, Q8_0.
    """
    size_bytes: int = Field(..., alias='sizeBytes', ge=1)
    sha256: str = Field(..., pattern='^[a-f0-9]{64}$')


class Device(StrEnum):
    gpu = 'gpu'
    cpu = 'cpu'


class Flag(RootModel[str]):
    root: str = Field(..., min_length=1)


class Runtime(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    engine: Literal['llama.cpp']
    """
    In-app runner (no external runtime such as Ollama/LM Studio). Internal provenance; MIT-licensed, listed on the Licences screen.
    """
    device: Device
    gpu_layers: int = Field(..., alias='gpuLayers', ge=0)
    """
    Layers offloaded to GPU. S2: 99 for GPU rows; CPU rows MUST be pinned to 0 - llama.cpp auto-fit otherwise pulls embed/rerank into VRAM and crowds the chat model out on the 6 GB floor.
    """
    context: int = Field(..., ge=512)
    flags: list[Flag] | None = None
    """
    Extra server flags beyond the standard envelope, e.g. ['--no-webui'].
    """


class ModelEntry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    """
    Stable registry id, e.g. 'archie-chat'.
    """
    role: Role
    """
    Fleet role v0 (S2 roster). One entry per role in the shipped fleet.
    """
    display_name: Localized = Field(..., alias='displayName')
    """
    The only user-facing string. Never an upstream model name (ADR-0004).
    """
    upstream: Upstream
    artifact: Artifact
    runtime: Runtime
    swap_group: SwapGroup = Field(..., alias='swapGroup')
    """
    S2 policy groups: gpu-models swap exclusively (one resident in VRAM at a time); cpu-services stay persistent and are pinned to CPU (gpuLayers 0).
    """
    distribution: Distribution
    """
    bundled = ships inside the one installer (P1 plan); downloadable = fetched from the registry's HF source on demand; candidate = evaluated, not shipped; training = placeholder awaiting a fine-tune.
    """
    notes: str | None = None


class ModelRegistry(BaseModel):
    """
    ArchResidenceBD model registry v0.1.0 (plan §5 fixed model roster; spike S2) - the fleet manifest: which models the product ships, in which role, pinned by artifact sha256. Consumed by the installer/downloader (P1), the W0.8 model cards and the Licences screen. displayName is the only user-facing string; upstream/runtime naming is internal provenance shown (if at all) behind the Licences screen per ADR-0004. Real instance: spec/models/registry.json.
    """

    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    schema_version: Literal['0.1.0'] = Field(..., alias='schemaVersion')
    fleet_id: str = Field(..., alias='fleetId', pattern='^[a-z0-9][a-z0-9-]*$')
    """
    Fleet generation id, e.g. 'archie-fleet-v1' (S2 froze fleet v1).
    """
    models: list[ModelEntry] = Field(..., min_length=1)
    notes: str | None = None
    """
    Fleet-level notes (e.g. deliberate exclusions - never silent).
    """
