# AUTO-GENERATED from spec/schemas/rate-card.schema.json - do not edit.
# Regenerate: python tools/codegen/generate_interfaces.py

from __future__ import annotations

from enum import StrEnum
from pydantic import AnyUrl, BaseModel, ConfigDict, Field, constr
from datetime import date
from typing import Literal


class Status(StrEnum):
    """
    candidate = not yet verified against its source (never used in a BOQ without acknowledgement); active = verified/current; archived = superseded.
    """

    candidate = 'candidate'
    active = 'active'
    archived = 'archived'


class Localized(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    bn: str = Field(..., min_length=1)
    en: str = Field(..., min_length=1)


class Kind(StrEnum):
    """
    Where the numbers come from. official_list = published list (e.g. mill/govt price list); market_survey = our/engineer survey; vendor_quote = a supplier quote; user_input = typed by the user; manual = maintained by hand (illustrative examples use this).
    """

    official_list = 'official_list'
    market_survey = 'market_survey'
    vendor_quote = 'vendor_quote'
    user_input = 'user_input'
    manual = 'manual'


class RateSource(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    kind: Kind
    """
    Where the numbers come from. official_list = published list (e.g. mill/govt price list); market_survey = our/engineer survey; vendor_quote = a supplier quote; user_input = typed by the user; manual = maintained by hand (illustrative examples use this).
    """
    name: str = Field(..., min_length=1)
    """
    Human-readable source name, e.g. 'Cement mill list 2026-10'.
    """
    url: AnyUrl | None = None
    retrieved_at: date | None = Field(None, alias='retrievedAt')
    sha256: str | None = Field(None, pattern='^[a-f0-9]{64}$')
    """
    Hash of the fetched artifact (list PDF/CSV) when one exists - provenance per plan §5.10.
    """
    note: str | None = None


class CostType(StrEnum):
    """
    Plan §6 cost types. Drives BOQ column grouping.
    """

    material = 'material'
    labour = 'labour'
    machinery = 'machinery'
    subcontract = 'subcontract'
    other = 'other'


class RateLine(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    key: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    """
    Stable takeoff key, e.g. 'cement-opc-43', 'rod-60g', 'mason', 'mixer-diesel', 'piling-450'.
    """
    label: Localized
    cost_type: CostType = Field(..., alias='costType')
    """
    Plan §6 cost types. Drives BOQ column grouping.
    """
    unit: str = Field(..., min_length=1)
    """
    Canonical unit vocabulary (free string, documented): material - bag, ton, kg, cum, cft, sqm, sft, m, ft, litre, each, roll; labour - day, point, sqm, cum, per_unit; machinery - hour, day; subcontract - per_pile, per_ft, machine_hour, per_sqm, per_unit, lump_sum.
    """
    rate_bdt: float = Field(..., alias='rateBdt', ge=0.0)
    operator_included: bool | None = Field(None, alias='operatorIncluded')
    """
    Machinery lines only: true when the rate includes the operator (plan §6 inclusion flags).
    """
    fuel_included: bool | None = Field(None, alias='fuelIncluded')
    """
    Machinery lines only: true when the rate includes fuel.
    """
    minimum_charge_hours: float | None = Field(None, alias='minimumChargeHours', gt=0.0)
    """
    Machinery lines only: minimum billable hours per mobilization, when the source states one.
    """
    source: RateSource | None = None
    regional_multipliers: (
        dict[constr(pattern=r'^[a-z0-9][a-z0-9-]*$'), float] | None
    ) = Field(None, alias='regionalMultipliers')
    """
    Per-line override of the card-level multipliers (e.g. piling is priced nationally).
    """
    note: str | None = None


class RateCard(BaseModel):
    """
    ArchResidenceBD rate card v0.1.0 (plan §6 - BOQ cost types; §5.10 - provenance) - one region/date/source set of market rates. Cards are the market side: the price service (W2.7) pushes card values into the Building Spec's inline pricing (Pricing/MaterialRate/LabourRate/MachineryRate/SubcontractRate), where per-project overrides then live in the Deviation Register as usual. status=candidate marks unverified content (plan §9) - candidate cards are never used silently. Real cards are user-imported or registry-fetched; spec/examples/interfaces carries an illustrative one.
    """

    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    schema_version: Literal['0.1.0'] = Field(..., alias='schemaVersion')
    card_id: str = Field(..., alias='cardId', pattern='^[a-z0-9][a-z0-9-]*$')
    """
    Stable card id, e.g. 'dhaka-2026-10-official'.
    """
    region: str = Field(..., pattern='^[a-z0-9][a-z0-9-]*$')
    """
    Base region whose price level the lines represent, e.g. dhaka, chattogram, khulna, rajshahi, sylhet, barishal, rangpur, mymensingh.
    """
    currency: Literal['BDT']
    status: Status
    """
    candidate = not yet verified against its source (never used in a BOQ without acknowledgement); active = verified/current; archived = superseded.
    """
    effective_from: date = Field(..., alias='effectiveFrom')
    effective_to: date | None = Field(None, alias='effectiveTo')
    """
    Absent = open-ended (absence = no nulls).
    """
    as_of: date | None = Field(None, alias='asOf')
    """
    Observation date of the price list; absent when the source carries its own retrievedAt only.
    """
    source: RateSource
    regional_multipliers: (
        dict[constr(pattern=r'^[a-z0-9][a-z0-9-]*$'), float] | None
    ) = Field(None, alias='regionalMultipliers')
    """
    Card-level regional multipliers (plan §6). A line may override with its own map.
    """
    lines: list[RateLine] = Field(..., min_length=1)
    notes: str | None = None
