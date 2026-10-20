# AUTO-GENERATED from spec/schemas/boq.schema.json - do not edit.
# Regenerate: python tools/codegen/generate_interfaces.py

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, RootModel
from enum import StrEnum
from datetime import date
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
    The card's own status travels with the BOQ: a candidate card is an unverified price list.
    """

    candidate = 'candidate'
    active = 'active'
    archived = 'archived'


class RateCardRef(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    card_id: str = Field(..., alias='cardId', min_length=1)
    region: str = Field(..., min_length=1)
    status: Status
    """
    The card's own status travels with the BOQ: a candidate card is an unverified price list.
    """
    effective_from: date = Field(..., alias='effectiveFrom')
    source: dict[str, Any]
    """
    The rate card's source (kind, name, url, retrievedAt, sha256).
    """


class CostType(StrEnum):
    """
    Plan §6 cost types.
    """

    material = 'material'
    labour = 'labour'
    machinery = 'machinery'
    subcontract = 'subcontract'
    other = 'other'


class Provenance(StrEnum):
    """
    Where the quantity came from: the spec, the design, an authored assumption, or a rule.
    """

    spec = 'spec'
    derived = 'derived'
    assumed = 'assumed'
    rule = 'rule'


class BoqLine(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    key: str = Field(..., min_length=1)
    label: Localized
    phase: str = Field(..., min_length=1)
    """
    The phase the line belongs to (the plan divides the BOQ by phase).
    """
    cost_type: CostType = Field(..., alias='costType')
    """
    Plan §6 cost types.
    """
    unit: str = Field(..., min_length=1)
    quantity: float = Field(..., ge=0.0)
    rate_key: str = Field(..., alias='rateKey')
    """
    The rate-card line this line priced itself from (empty when it is measured but unpriced).
    """
    provenance: Provenance
    """
    Where the quantity came from: the spec, the design, an authored assumption, or a rule.
    """
    source: str = Field(..., min_length=1)
    note: str
    rate_bdt: float | None = Field(None, alias='rateBdt', ge=0.0)
    """
    The rate the line was priced at; null when the card has no rate for it (absence, not a zero).
    """
    amount_bdt: float | None = Field(None, alias='amountBdt', ge=0.0)
    """
    quantity * rate; null when the line is unpriced.
    """
    priced: bool | None = None
    rate_cost_type: str | None = Field(None, alias='rateCostType')


class ByPhase(RootModel[float]):
    root: float = Field(..., ge=0.0)


class ByCostType(RootModel[float]):
    root: float = Field(..., ge=0.0)


class Subtotals(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    by_phase: dict[str, ByPhase] = Field(..., alias='byPhase')
    by_cost_type: dict[str, ByCostType] = Field(..., alias='byCostType')


class Totals(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    amount_bdt: float = Field(..., alias='amountBdt', ge=0.0)
    priced_lines: int = Field(..., alias='pricedLines', ge=0)
    unpriced_lines: list[str] = Field(..., alias='unpricedLines')
    """
    The lines the card could not price - visible, never dropped.
    """


class BillOfQuantities(BaseModel):
    """
    ArchResidenceBD BOQ v0.1.0 (plan §6 - BOQ: per-phase and single-page view divided by phase with subtotals + grand total; cost types per line: material / labour / machinery / subcontract / others; deviation-flagged line notes) - the priced data behind the xlsx/PDF renderers (P3). Quantities are measured from the design (the engine's volumes, the BBS's steel); rates come from the frozen rate-card interface (W0.9) and are never typed here. A line whose rate is missing stays in the document, unpriced and visible: no silent gaps. The card's status travels with the document - a candidate card is not a verified price list.
    """

    model_config = ConfigDict(
        extra='forbid',
        populate_by_name=True,
    )
    schema_version: Literal['0.1.0'] = Field(..., alias='schemaVersion')
    project_id: str = Field(..., alias='projectId', min_length=1)
    currency: Literal['BDT']
    rate_card: RateCardRef = Field(..., alias='rateCard')
    lines: list[BoqLine] = Field(..., min_length=1)
    subtotals: Subtotals
    totals: Totals
    notes: str
