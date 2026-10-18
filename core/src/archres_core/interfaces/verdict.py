# AUTO-GENERATED from spec/schemas/verdict.schema.json - do not edit.
# Regenerate: python tools/codegen/generate_interfaces.py

from __future__ import annotations

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, RootModel
from enum import StrEnum
from uuid import UUID
from typing import Any, Literal


class Localized(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    bn: str = Field(..., min_length=1)
    en: str = Field(..., min_length=1)


class Status(StrEnum):
    """
    Pack status at evaluation time (candidate = engineer review pending, ADR-0001).
    """

    candidate = 'candidate'
    review = 'review'
    frozen = 'frozen'


class PackRef(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: str = Field(..., pattern='^[a-z]+@\\d{4}\\.\\d+$')
    """
    Rule pack id, e.g. rajuk@2008.1.
    """
    sha256: str = Field(..., pattern='^[a-f0-9]{64}$')
    """
    Hash of the exact pack file evaluated - verdicts are reproducible only against a pinned pack.
    """
    status: Status | None = None
    """
    Pack status at evaluation time (candidate = engineer review pending, ADR-0001).
    """


class Subject(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    spec_revision: int = Field(..., alias='specRevision', ge=0)
    spec_sha256: str = Field(..., alias='specSha256', pattern='^[a-f0-9]{64}$')
    project_id: UUID | None = Field(None, alias='projectId')


class Status1(StrEnum):
    """
    The only three statuses (plan §5.6). impossible = the rules make compliance impossible within the current constraints (e.g. a prohibited use class on that plot); it is NOT a data problem.
    """

    compliant = 'compliant'
    deviation = 'deviation'
    impossible = 'impossible'


class Citation(RootModel[str]):
    root: str = Field(..., pattern='^[a-z0-9-]+$')


class Measured(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    value: float | str
    """
    The design's value, e.g. 1.20 (m) or 'prohibited'.
    """
    unit: str | None = Field(None, min_length=1)
    """
    e.g. m, spaces, percent, katha.
    """
    path: str | None = Field(None, pattern='^/')
    """
    JSON Pointer into the subject spec revision when the value lives there (v0 spec: plot/road/storeys exist; design-derived values like FAR/coverage arrive with the phase payload schemas - until then often absent or pointing into phases[].data).
    """


class Comparator(StrEnum):
    """
    max = measured must be <= value; min = measured must be >= value; exact = equality.
    """

    max = 'max'
    min = 'min'
    exact = 'exact'


class Limit(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    value: float = Field(..., ge=0.0)
    unit: str | None = Field(None, min_length=1)
    comparator: Comparator
    """
    max = measured must be <= value; min = measured must be >= value; exact = equality.
    """
    note: str | None = None


class Op(StrEnum):
    add = 'add'
    replace = 'replace'
    remove = 'remove'


class SpecPatchOp(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    op: Op
    path: str = Field(..., pattern='^/')
    value: float | str | bool | dict[str, Any] | list[Any] | None = None
    """
    Required for add/replace; omitted for remove. Any JSON value.
    """


class Reason(StrEnum):
    """
    missing_input = the spec lacks data the rule needs (list which in detail); not_applicable = rule does not apply to this building; pack_gap = the pack itself declares a coverage gap.
    """

    missing_input = 'missing_input'
    not_applicable = 'not_applicable'
    pack_gap = 'pack_gap'


class Unevaluated(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    rule_ref: str = Field(
        ..., alias='ruleRef', pattern='^[a-z]+@\\d{4}\\.\\d+#[a-z0-9][a-z0-9-]*$'
    )
    reason: Reason
    """
    missing_input = the spec lacks data the rule needs (list which in detail); not_applicable = rule does not apply to this building; pack_gap = the pack itself declares a coverage gap.
    """
    detail: str | None = Field(None, min_length=1)


class Summary(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    compliant: int = Field(..., ge=0)
    deviation: int = Field(..., ge=0)
    impossible: int = Field(..., ge=0)


class Alternative(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    description: Localized
    spec_patch: list[SpecPatchOp] = Field(..., alias='specPatch', min_length=1)
    """
    Applied to the subject spec revision to reach the nearest compliant state (new revision). Paths must resolve against the spec; the sanctioned open extension point is phases[].data.
    """


class Verdict(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    rule_ref: str = Field(
        ..., alias='ruleRef', pattern='^[a-z]+@\\d{4}\\.\\d+#[a-z0-9][a-z0-9-]*$'
    )
    """
    Resolvable rule reference: <packId>#<ruleId>, where ruleId is a rule entity id in that pack - a provision, schedule or table id (e.g. rajuk@2008.1#setback-schedule, rajuk@2008.1#schedule4-parking).
    """
    status: Status1
    """
    The only three statuses (plan §5.6). impossible = the rules make compliance impossible within the current constraints (e.g. a prohibited use class on that plot); it is NOT a data problem.
    """
    title: Localized
    """
    Provision title snapshot, so a verdict set renders standalone.
    """
    summary: Localized
    """
    Engine-authored message: what was compared and the outcome.
    """
    measured: Measured | None = None
    limit: Limit | None = None
    alternative: Alternative | None = None
    """
    Nearest compliant alternative with a machine-applicable patch (plan §5.6 one-click 'restore to compliant'). Required when status=deviation; must be absent otherwise.
    """
    citations: list[Citation] = Field(..., min_length=1)
    """
    Cite keys resolved against pack.sha256's citations registry (gazette pages stay traceable).
    """


class VerdictSet(BaseModel):
    """
    ArchResidenceBD verdict schema v0.1.0 (plan §5.6) - one compliance-evaluation run of a Building Spec revision against one rule pack. Three statuses only: compliant | deviation | impossible (no hard blocks). Every deviation carries a machine-applicable specPatch - the one-click 'restore to compliant'. Anything not evaluated is listed in unevaluated[] - coverage is never silent (plan §9). The pack is pinned by file sha256, and citations are cite keys resolved against that pack. The summary counts MUST equal the verdicts[] status counts (enforced by tests). See docs/spec/interfaces-v0.md.
    """

    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    schema_version: Literal['0.1.0'] = Field(..., alias='schemaVersion')
    pack: PackRef
    subject: Subject
    evaluated_at: AwareDatetime = Field(..., alias='evaluatedAt')
    evaluator: str = Field(..., min_length=1)
    """
    Producing component + version, e.g. 'compliance-engine@0.1.0'.
    """
    verdicts: list[Verdict]
    unevaluated: list[Unevaluated]
    """
    Rules that were in scope but not evaluated, with the reason. Always present (possibly empty) - never silent.
    """
    summary: Summary
