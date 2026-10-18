# AUTO-GENERATED from spec/schemas/job-protocol.schema.json - do not edit.
# Regenerate: python tools/codegen/generate_interfaces.py

from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel
from uuid import UUID


class Kind(StrEnum):
    """
    Job kind v0. Per-kind params are documented in docs/spec/interfaces-v0.md; concrete param schemas land additively with the owning engine (W1.x/W2.x) - v0 freezes the envelope, the kind roster and the result contract.
    """

    geometry_build = 'geometry.build'
    drawing_sheet = 'drawing.sheet'
    rebar_build = 'rebar.build'


class JobRequest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    message_type: Literal['job.request'] = Field(..., alias='messageType')
    protocol_version: Literal['0.1.0'] = Field(..., alias='protocolVersion')
    job_id: UUID = Field(..., alias='jobId')
    """
    Client-generated id; echoed by the result (results may arrive from a restarted worker, so ids must be explicit).
    """
    kind: Kind
    """
    Job kind v0. Per-kind params are documented in docs/spec/interfaces-v0.md; concrete param schemas land additively with the owning engine (W1.x/W2.x) - v0 freezes the envelope, the kind roster and the result contract.
    """
    params: dict[str, Any]
    """
    Kind-specific payload (plain XML-RPC struct). Grounded examples per kind in docs/spec/interfaces-v0.md.
    """
    deadline_ms: int = Field(..., alias='deadlineMs', ge=1000)
    """
    Client-side per-job deadline; the client ALWAYS sets it. Defaults per kind: geometry.build 30 s, drawing.sheet 120 s, rebar.build 60 s (S4 scratch runs used 180 s).
    """
    requested_at: AwareDatetime | None = Field(None, alias='requestedAt')


class Kind1(StrEnum):
    geometry_build = 'geometry.build'
    drawing_sheet = 'drawing.sheet'
    rebar_build = 'rebar.build'


class Status(StrEnum):
    """
    ok = job completed; error = engine-side failure or a client-synthesized worker crash/restart (code says which); timeout = the client hit deadlineMs and synthesized this result.
    """

    ok = 'ok'
    error = 'error'
    timeout = 'timeout'


class Warning(RootModel[str]):
    root: str = Field(..., min_length=1)


class Kind2(StrEnum):
    svg = 'svg'
    png = 'png'
    pdf = 'pdf'
    dxf = 'dxf'
    json = 'json'
    text = 'text'


class Artifact(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    name: str = Field(..., min_length=1)
    """
    Stable artifact name, e.g. 'plan-top.svg', 'bbs-marks.json'.
    """
    kind: Kind2
    media_type: str = Field(..., alias='mediaType', min_length=1)
    """
    e.g. image/svg+xml, application/pdf, image/png, application/dxf, application/json, text/plain.
    """
    size_bytes: int = Field(..., alias='sizeBytes', ge=1)
    sha256: str = Field(..., pattern='^[a-f0-9]{64}$')
    """
    Content hash. Determinism note (S3): SVG/DXF/PNG come out byte-stable; PDFs differ only in /CreationDate - the app normalizes that before hashing or exempts it explicitly (plan §9).
    """
    path: str = Field(..., min_length=1)
    """
    Path relative to the worker's per-job output directory; the app moves/normalizes artifacts into the project store.
    """


class Code(StrEnum):
    """
    Frozen error codes. worker_down/worker_restarted are client-synthesized on crash detection (S4: crash surfaces ~2 s after death; the watchdog pings every <=1 s and restarts, then the in-flight job fails with a clean error).
    """

    invalid_params = 'invalid_params'
    worker_down = 'worker_down'
    worker_restarted = 'worker_restarted'
    timeout = 'timeout'
    engine_error = 'engine_error'
    internal = 'internal'


class JobError(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    code: Code
    """
    Frozen error codes. worker_down/worker_restarted are client-synthesized on crash detection (S4: crash surfaces ~2 s after death; the watchdog pings every <=1 s and restarts, then the in-flight job fails with a clean error).
    """
    message: str = Field(..., min_length=1)
    detail: str | None = None


class JobMetrics(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    duration_ms: float = Field(..., alias='durationMs', ge=0.0)


class PingReply(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    name: str = Field(..., min_length=1)
    pid: int = Field(..., ge=1)
    engine_version: str = Field(..., alias='engineVersion', min_length=1)
    port: int = Field(..., ge=1, le=65535)
    uptime_s: float = Field(..., alias='uptimeS', ge=0.0)


class StatsReply(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    name: str = Field(..., min_length=1)
    pid: int = Field(..., ge=1)
    jobs: int = Field(..., ge=0)
    """
    Completed jobs since spawn.
    """
    last_ms: float | None = Field(None, alias='lastMs', ge=0.0)
    """
    Duration of the most recent job; absent before the first job (absence = no nulls).
    """
    uptime_s: float = Field(..., alias='uptimeS', ge=0.0)


class JobResult(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    message_type: Literal['job.result'] = Field(..., alias='messageType')
    protocol_version: Literal['0.1.0'] = Field(..., alias='protocolVersion')
    job_id: UUID = Field(..., alias='jobId')
    kind: Kind1
    status: Status
    """
    ok = job completed; error = engine-side failure or a client-synthesized worker crash/restart (code says which); timeout = the client hit deadlineMs and synthesized this result.
    """
    artifacts: list[Artifact]
    """
    Always present (possibly empty). Empty on error/timeout.
    """
    warnings: list[Warning]
    """
    Always present (possibly empty) - never a silent drop (plan §9).
    """
    error: JobError | None = None
    metrics: JobMetrics
    engine_version: str | None = Field(None, alias='engineVersion', min_length=1)
    """
    Engine build that produced the result - provenance for determinism audits. Internal field; never shown in the UI (ADR-0004).
    """


class JobMessage(RootModel[JobRequest | JobResult]):
    root: JobRequest | JobResult = Field(..., title='JobMessage')
    """
    ArchResidenceBD job protocol v0.1.0 (plan §5 pipeline jobs; spike S4) - the wire contract between the app and its persistent engine workers. Transport: stdlib XML-RPC on 127.0.0.1 (no new dependencies); the app picks a free port per worker at spawn and passes it in. Data plane: job(request) -> result (this schema). Control plane (frozen shapes in $defs, called as plain XML-RPC methods): ping(), stats(), shutdown(). Jobs are stateless - a fresh document per job - so a worker crash loses nothing and the job is resubmitted (S4). See docs/spec/interfaces-v0.md for kinds, deadline defaults and the watchdog policy.
    """
