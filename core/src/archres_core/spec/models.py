# AUTO-GENERATED from spec/schemas/building-spec.schema.json - do not edit.
# Regenerate: python tools/codegen/generate_spec.py

from __future__ import annotations

from enum import IntEnum, StrEnum
from typing import Any, Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import date


class Length(StrEnum):
    """
    Display only; storage is SI metres.
    """

    m = 'm'
    ft = 'ft'


class Area(StrEnum):
    """
    Display only; storage is m2. The land-unit module handles katha/shotok conversion.
    """

    sqm = 'sqm'
    sqft = 'sqft'
    katha = 'katha'
    shotok = 'shotok'


class DisplayUnits(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    length: Length
    """
    Display only; storage is SI metres.
    """
    area: Area
    """
    Display only; storage is m2. The land-unit module handles katha/shotok conversion.
    """
    currency: Literal['BDT']


class Language(StrEnum):
    """
    Project language for chat, reports and labels.
    """

    bn = 'bn'
    en = 'en'


class Project(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: UUID
    """
    Stable project UUID. All element marks derive from stable spec ids, never build order (plan §8).
    """
    name: str = Field(..., max_length=120, min_length=1)
    language: Language
    """
    Project language for chat, reports and labels.
    """
    display_units: DisplayUnits = Field(..., alias='displayUnits')
    notes: str | None = None


class Address(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    division: str = Field(..., min_length=1)
    district: str = Field(..., min_length=1)
    upazila_or_thana: str | None = Field(None, alias='upazilaOrThana')
    area_name: str | None = Field(None, alias='areaName')
    """
    Neighbourhood/area name as commonly used (e.g. Dhanmondi, Mirpur Sector 7).
    """
    address_line: str | None = Field(None, alias='addressLine')


class Plot(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    area_sqm: float = Field(..., alias='areaSqm', gt=0.0)
    """
    Canonical area in m2. Land-unit input (katha/shotok/bigha/gonda) is converted at the boundary.
    """
    frontage_m: float | None = Field(None, alias='frontageM', gt=0.0)
    """
    Front boundary length along the access road.
    """
    depth_m: float | None = Field(None, alias='depthM', gt=0.0)
    road_width_m: float | None = Field(None, alias='roadWidthM', gt=0.0)
    """
    Width of the access road in front of the plot.
    """
    corner_plot: bool | None = Field(False, alias='cornerPlot')
    existing_structure: bool | None = Field(False, alias='existingStructure')
    """
    Existing building to handle in Site & Excavation.
    """


class Status(StrEnum):
    """
    area_default = conservative area default from the Source Registry - always labeled 'assumption - verify on site' (plan §5.10).
    """

    not_provided = 'not_provided'
    user_report = 'user_report'
    area_default = 'area_default'


class Soil(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    status: Status
    """
    area_default = conservative area default from the Source Registry - always labeled 'assumption - verify on site' (plan §5.10).
    """
    sbc_kpa: float | None = Field(None, alias='sbcKpa', gt=0.0)
    """
    Allowable safe bearing capacity (kPa).
    """
    groundwater_depth_m: float | None = Field(None, alias='groundwaterDepthM', gt=0.0)
    report_ref: str | None = Field(None, alias='reportRef')
    """
    Reference to a user-provided soil test report (document id or file name).
    """
    note: str | None = None


class Authority(StrEnum):
    """
    Authority governing approval; extended per rule pack.
    """

    rajuk = 'rajuk'
    dncc = 'dncc'
    dscc = 'dscc'
    ccc = 'ccc'
    cda = 'cda'
    kda = 'kda'
    rda = 'rda'
    scc = 'scc'
    paurashava = 'paurashava'
    other = 'other'


class SeismicZone(IntEnum):
    """
    BNBC seismic zone, derived from location via the rule pack.
    """

    integer_1 = 1
    integer_2 = 2
    integer_3 = 3
    integer_4 = 4


class Jurisdiction(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    authority: Authority
    """
    Authority governing approval; extended per rule pack.
    """
    rule_pack: str | None = Field(None, alias='rulePack')
    """
    Active rule pack id, e.g. rajuk@2026.1 (plan §5.6).
    """
    ward_or_zone: str | None = Field(None, alias='wardOrZone')
    seismic_zone: SeismicZone | None = Field(None, alias='seismicZone')
    """
    BNBC seismic zone, derived from location via the rule pack.
    """


class Site(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    address: Address
    plot: Plot
    soil: Soil | None = None
    jurisdiction: Jurisdiction | None = None


class Storeys(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    count: int = Field(..., ge=1, le=20)
    """
    Total floors above plinth including ground floor (BD 'G+5' => count 6). Floor phases use storeyIndex 0 = ground floor.
    """
    ground_floor_height_m: float | None = Field(3.0, alias='groundFloorHeightM', gt=2.0)
    typical_floor_height_m: float | None = Field(
        3.0, alias='typicalFloorHeightM', gt=2.0
    )
    has_basement: bool | None = Field(False, alias='hasBasement')


class Occupancy(StrEnum):
    residential = 'residential'


class StructureType(StrEnum):
    rcc_frame = 'rcc_frame'


class GroundFloorUsage(StrEnum):
    residential = 'residential'
    parking = 'parking'
    mixed = 'mixed'


class Building(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    occupancy: Occupancy
    structure_type: StructureType = Field(..., alias='structureType')
    storeys: Storeys
    units_per_floor: int | None = Field(None, alias='unitsPerFloor', ge=1)
    typical_unit_area_sqm: float | None = Field(
        None, alias='typicalUnitAreaSqm', gt=0.0
    )
    ground_floor_usage: GroundFloorUsage | None = Field(
        'residential', alias='groundFloorUsage'
    )


class Kind(StrEnum):
    site_excavation = 'site_excavation'
    foundation = 'foundation'
    floor = 'floor'
    roof_boundary = 'roof_boundary'
    common_services = 'common_services'


class Status1(StrEnum):
    """
    stale = designed but upstream inputs changed (conservative stale-flagging, plan §5.4).
    """

    not_started = 'not_started'
    gathering_info = 'gathering_info'
    drafted = 'drafted'
    designed = 'designed'
    stale = 'stale'


class Phase(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    """
    Stable slug, e.g. 'foundation', 'floor-1', 'common-services'.
    """
    kind: Kind
    storey_index: int | None = Field(None, alias='storeyIndex', ge=0)
    """
    Required when kind = floor. 0 = ground floor, 1 = '1st floor' in BD convention.
    """
    label: str | None = None
    """
    Display label (localized); generated by the app.
    """
    status: Status1
    """
    stale = designed but upstream inputs changed (conservative stale-flagging, plan §5.4).
    """
    data: dict[str, Any] | None = None
    """
    Phase-specific decision payload (excavation depth, foundation type, member overrides, MEP choices...). Reserved extension point: per-phase payload schemas land with the engines (P1/P2), validated via a kind-to-schema registry.
    """


class Source(StrEnum):
    user = 'user'
    fetched = 'fetched'
    default = 'default'
    mixed = 'mixed'


class MaterialRate(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    key: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    label: str | None = None
    unit: str
    """
    Canonical unit: bag, ton, kg, cum, sqm, cft, m, litre, each.
    """
    rate_bdt: float = Field(..., alias='rateBdt', ge=0.0)
    source: Source
    supplier: str | None = None
    as_of: date | None = Field(None, alias='asOf')
    note: str | None = None


class LabourRate(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    key: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    label: str | None = None
    """
    Trade or work item, e.g. Mason, Rod binder.
    """
    unit: str
    """
    day, point, sqm, cum, per unit...
    """
    rate_bdt: float = Field(..., alias='rateBdt', ge=0.0)
    source: Source
    as_of: date | None = Field(None, alias='asOf')
    note: str | None = None


class Unit(StrEnum):
    hour = 'hour'
    day = 'day'


class MachineryRate(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    key: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    label: str | None = None
    unit: Unit
    rate_bdt: float = Field(..., alias='rateBdt', ge=0.0)
    source: Source
    operator_included: bool | None = Field(None, alias='operatorIncluded')
    """
    True when the rate includes the operator.
    """
    fuel_included: bool | None = Field(None, alias='fuelIncluded')
    """
    True when the rate includes fuel.
    """
    as_of: date | None = Field(None, alias='asOf')
    note: str | None = None


class Unit1(StrEnum):
    per_pile = 'per_pile'
    per_ft = 'per_ft'
    machine_hour = 'machine_hour'
    per_sqm = 'per_sqm'
    per_unit = 'per_unit'
    lump_sum = 'lump_sum'


class SubcontractRate(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    key: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    label: str | None = None
    unit: Unit1
    rate_bdt: float = Field(..., alias='rateBdt', ge=0.0)
    source: Source
    as_of: date | None = Field(None, alias='asOf')
    note: str | None = None


class Source4(StrEnum):
    """
    Overall provenance of this price set; each entry also carries its own source.
    """

    user = 'user'
    fetched = 'fetched'
    default = 'default'
    mixed = 'mixed'


class Pricing(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    currency: Literal['BDT']
    source: Source4
    """
    Overall provenance of this price set; each entry also carries its own source.
    """
    as_of: date | None = Field(None, alias='asOf')
    materials: list[MaterialRate] | None = None
    labour: list[LabourRate] | None = None
    machinery: list[MachineryRate] | None = None
    subcontract: list[SubcontractRate] | None = None


class Basis(StrEnum):
    area_default = 'area_default'
    conservative_default = 'conservative_default'
    user_stated = 'user_stated'
    external_source = 'external_source'


class Assumption(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    subject: str | None = None
    statement: str
    basis: Basis
    verify_on_site: bool = Field(..., alias='verifyOnSite')
    related_path: str | None = Field(None, alias='relatedPath')
    """
    JSON Pointer into the spec this assumption covers.
    """


class RiskTier(StrEnum):
    cosmetic = 'cosmetic'
    approval_risk = 'approval_risk'
    structural_attention = 'structural_attention'


class Deviation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    phase_id: str | None = Field(None, alias='phaseId')
    rule_ref: str = Field(..., alias='ruleRef')
    """
    Rule id from the rule pack, e.g. rajuk@2026.1#setback-front.
    """
    rule_title: str | None = Field(None, alias='ruleTitle')
    expected: str
    actual: str
    risk_tier: RiskTier = Field(..., alias='riskTier')
    rationale: str | None = None
    """
    User's reason for the override.
    """
    acknowledged: bool
    recorded_at: AwareDatetime = Field(..., alias='recordedAt')
    nearest_compliant_alternative: str | None = Field(
        None, alias='nearestCompliantAlternative'
    )
    """
    Nearest compliant option (one-click 'restore to compliant', plan §5.6).
    """


class Kind1(StrEnum):
    drawing_pdf = 'drawing_pdf'
    drawing_dxf = 'drawing_dxf'
    bbs = 'bbs'
    boq_xlsx = 'boq_xlsx'
    boq_pdf = 'boq_pdf'
    report_pdf = 'report_pdf'
    engineer_pack = 'engineer_pack'
    model_fcstd = 'model_fcstd'
    project_bundle = 'project_bundle'


class DocumentRef(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    id: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    kind: Kind1
    phase_id: str | None = Field(None, alias='phaseId')
    title: str
    path: str | None = None
    generated_at: AwareDatetime = Field(..., alias='generatedAt')
    sha256: str | None = Field(None, pattern='^[a-f0-9]{64}$')


class Source5(StrEnum):
    user = 'user'
    default = 'default'
    rule_pack = 'rule_pack'
    fetched = 'fetched'
    imported = 'imported'
    assumption = 'assumption'
    engine = 'engine'


class Confidence(StrEnum):
    high = 'high'
    medium = 'medium'
    low = 'low'
    assumption = 'assumption'


class ProvenanceEntry(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    source: Source5
    detail: str | None = None
    """
    e.g. 'user answer in phase chat', 'rajuk@2026.1', 'Source Registry: mill list 2026-09'.
    """
    at: AwareDatetime | None = None
    confidence: Confidence | None = None


class BuildingSpec(BaseModel):
    """
    ArchResidenceBD Building Spec v0.1.0 (plan §5.4) - the single source of truth for one project. Canonical units are SI (m, m2, kPa, kg, BDT); display units are presentation-only. Absence = omitted field; no nulls. Strict by default; the only open objects are phases[].data and the provenance map.
    """

    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    schema_version: Literal['0.1.0'] = Field(..., alias='schemaVersion')
    revision: int = Field(..., ge=0)
    """
    Spec revision counter. Locked revisions are immutable snapshots managed by the Spec engine (W1.3); history lives outside this JSON.
    """
    locked: bool | None = False
    created_at: AwareDatetime | None = Field(None, alias='createdAt')
    updated_at: AwareDatetime | None = Field(None, alias='updatedAt')
    project: Project
    site: Site
    building: Building
    phases: list[Phase] = Field(..., min_length=1)
    """
    Standard set generated at Project Setup: site-excavation, foundation, floor-<n> per storey, roof-boundary, common-services.
    """
    pricing: Pricing | None = None
    assumptions: list[Assumption] | None = Field([], validate_default=True)
    deviations: list[Deviation] | None = Field([], validate_default=True)
    documents: list[DocumentRef] | None = Field([], validate_default=True)
    provenance: dict[str, ProvenanceEntry] | None = None
    """
    Field-level provenance map keyed by JSON Pointer (e.g. '/site/soil/sbcKpa'). Every machine-introduced value carries an entry (plan §2.5).
    """
