"""Price service v0 (W2.7): rate cards in, a priced region out, and the spec that carries it.

The plan's BOQ is priced with **live prices** (§6) and the prices come from *official lists*
(§3, §5.10) — not from a number typed into a document. This module is that path:

```text
rate cards (a directory)  ──▶ CardRegistry
        │                            │
        │  district ──▶ region      ▼
        └──────────────────────▶ resolve_card(card, region)      (multipliers applied)
                                     │
             ┌───────────────────────┼────────────────────────┐
             ▼                       ▼                        ▼
      the BOQ's card          the spec's inline        the override register
      (rate-card shaped)      pricing block            (a user's own rate)
```

Four laws shape it, and each one is a place where a plausible shortcut would be a lie:

- **The card's identity travels with the price.** Every priced artefact says which list, which
  region, which effective date and which verification state it used. A price without its source
  is not a price.
- **A regional multiplier is either published or assumed — never silent.** The card's own region
  is 1.0 by definition; a region the card publishes a factor for gets that factor; a region it
  does not gets **1.0 with the assumption written on the line** (`source: default`). A price that
  pretends to be regional when it is not is the worst kind of wrong.
- **A fetched list enters as a candidate.** An official list that nobody has verified against its
  source is not an official price; it is a candidate (plan §9). The fetch needs the user's
  consent, the artifact is hashed, and the card that comes out says `candidate` until a human
  says otherwise.
- **A price override is registered, never silent.** The user's own rate lands in the spec's
  pricing with `source: user`, and the difference from the card's rate is recorded in the
  **Deviation Register** with the reason and the acknowledgement (plan §2.1).

Deterministic: the same card and the same region always produce the same resolved card, the
same pricing block and the same ops. Nothing here reaches the network unless the caller passes
consent, and then only through the Source Registry (W0.10) — never by a blind search.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import pathlib
import re
from dataclasses import dataclass, field
from typing import Any

from .interfaces import load_schema
from .sources import SourceFetchError, fetch_source
from .spec import apply_patch, utc_now_iso

#: The rate-card interface version this service speaks (W0.9, frozen).
CARD_SCHEMA_VERSION = "0.1.0"

#: How a regional multiplier was obtained. The three are the whole truth about a rate.
MULTIPLIER_OWN = "own-region"  # the card's own region: 1.0 by definition
MULTIPLIER_PUBLISHED = "published"  # the card publishes a factor for that region
MULTIPLIER_ASSUMED = "assumed"  # no factor published: 1.0, and the line says so

#: The card's cost type -> the array it lands in inside the spec's inline pricing.
PRICING_BUCKETS = {
    "material": "materials",
    "labour": "labour",
    "machinery": "machinery",
    "subcontract": "subcontract",
}

#: The card's source kind -> the pricing entry's source. "fetched" means the numbers came from
#: outside (an official list, a survey, a quote); "default" means they are maintained by hand or
#: rest on an assumption. A price is never dressed up as something it is not.
CARD_SOURCE_TO_PRICING_SOURCE = {
    "official_list": "fetched",
    "market_survey": "fetched",
    "vendor_quote": "fetched",
    "manual": "default",
    "user_input": "user",
}

#: Bangladesh's districts, as the rate-card schema names them, plus the spellings that are in
#: ordinary use. The project district is the bridge between a card and a site (W2.7).
DISTRICT_REGIONS = {
    "dhaka": "dhaka",
    "chattogram": "chattogram",
    "chittagong": "chattogram",
    "khulna": "khulna",
    "rajshahi": "rajshahi",
    "sylhet": "sylhet",
    "barishal": "barishal",
    "barisal": "barishal",
    "rangpur": "rangpur",
    "mymensingh": "mymensingh",
}

_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


class PriceServiceError(RuntimeError):
    """The price service cannot produce a trustworthy price (never a design problem)."""


class ConsentRequired(PriceServiceError):
    """A fetch was attempted without the user's consent (the registry's fetch law)."""


# --------------------------------------------------------------------- the registry


@dataclass(frozen=True)
class CardEntry:
    """One rate card the app knows about, with where it came from."""

    card_id: str
    region: str
    status: str
    effective_from: str
    effective_to: str | None
    source: dict[str, Any]
    path: pathlib.Path
    sha256: str
    card: dict[str, Any] = field(repr=False, default_factory=dict)

    @property
    def is_candidate(self) -> bool:
        return self.status == "candidate"

    def summary(self) -> dict[str, Any]:
        """The registry row (what the app lists)."""
        return {
            "cardId": self.card_id,
            "region": self.region,
            "status": self.status,
            "effectiveFrom": self.effective_from,
            "effectiveTo": self.effective_to,
            "source": {
                "kind": self.source.get("kind"),
                "name": self.source.get("name"),
                "url": self.source.get("url"),
                "retrievedAt": self.source.get("retrievedAt"),
                "sha256": self.source.get("sha256"),
            },
            "file": self.path.as_posix(),
            "sha256": self.sha256,
            "lines": len(self.card.get("lines") or []),
        }


def _looks_like_card(document: Any) -> bool:
    return isinstance(document, dict) and "cardId" in document


def _validate_card(card: dict[str, Any], path: pathlib.Path) -> None:
    """A card that does not satisfy the frozen interface is an error, never a silent skip."""
    import jsonschema

    try:
        jsonschema.Draft202012Validator(load_schema("rate-card")).validate(card)
    except jsonschema.ValidationError as exc:
        raise PriceServiceError(
            f"the rate card {path.as_posix()} does not satisfy the rate-card interface: {exc.message}"
        ) from exc


class CardRegistry:
    """The cards the app knows about, indexed by id and by region.

    A directory holds card files; a file that is not a card (an example job request, a README)
    is skipped and *reported* — skipped, never silently dropped. A file that looks like a card
    but does not satisfy the frozen rate-card interface is an error: a broken price list must
    not disappear into the registry.
    """

    def __init__(self, entries: list[CardEntry], skipped: list[dict[str, Any]] | None = None):
        self._entries = sorted(entries, key=lambda entry: entry.card_id)
        self._skipped = list(skipped or [])

    @classmethod
    def from_directories(cls, *directories: str | pathlib.Path) -> "CardRegistry":
        entries: list[CardEntry] = []
        skipped: list[dict[str, Any]] = []
        seen: dict[str, pathlib.Path] = {}
        for directory in directories:
            root = pathlib.Path(directory)
            if not root.is_dir():
                continue
            for path in sorted(root.glob("*.json")):
                document = json.loads(path.read_text(encoding="utf-8"))
                if not _looks_like_card(document):
                    skipped.append({"file": path.as_posix(), "reason": "not a rate card"})
                    continue
                _validate_card(document, path)
                card_id = str(document["cardId"])
                if card_id in seen:
                    raise PriceServiceError(
                        f"two rate cards claim the id {card_id!r}: "
                        f"{seen[card_id].as_posix()} and {path.as_posix()}"
                    )
                seen[card_id] = path
                source = dict(document.get("source") or {})
                entries.append(
                    CardEntry(
                        card_id=card_id,
                        region=str(document["region"]),
                        status=str(document["status"]),
                        effective_from=str(document["effectiveFrom"]),
                        effective_to=(
                            str(document["effectiveTo"]) if document.get("effectiveTo") else None
                        ),
                        source=source,
                        path=path,
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                        card=document,
                    )
                )
        return cls(entries, skipped)

    @classmethod
    def from_cards(cls, cards: list[dict[str, Any]], *, origin: str = "<memory>") -> "CardRegistry":
        """A registry built from card documents in memory (tests, the app's in-memory store)."""
        entries: list[CardEntry] = []
        for card in cards:
            _validate_card(card, pathlib.Path(origin))
            entries.append(
                CardEntry(
                    card_id=str(card["cardId"]),
                    region=str(card["region"]),
                    status=str(card["status"]),
                    effective_from=str(card["effectiveFrom"]),
                    effective_to=str(card["effectiveTo"]) if card.get("effectiveTo") else None,
                    source=dict(card.get("source") or {}),
                    path=pathlib.Path(origin),
                    sha256=hashlib.sha256(
                        json.dumps(card, sort_keys=True, separators=(",", ":")).encode("utf-8")
                    ).hexdigest(),
                    card=card,
                )
            )
        return cls(entries)

    # -- the queries -----------------------------------------------------------

    def cards(self) -> list[CardEntry]:
        return list(self._entries)

    @property
    def skipped(self) -> list[dict[str, Any]]:
        """Files that were not cards (reported, never silently dropped)."""
        return list(self._skipped)

    def get(self, card_id: str) -> CardEntry:
        for entry in self._entries:
            if entry.card_id == card_id:
                return entry
        known = ", ".join(entry.card_id for entry in self._entries) or "(none)"
        raise PriceServiceError(f"no rate card {card_id!r}; the registry holds: {known}")

    def for_region(self, region: str, *, on: str | None = None) -> list[CardEntry]:
        """The cards that cover a region, newest first."""
        found = [entry for entry in self._entries if entry.region == region]
        if on is not None:
            found = [entry for entry in found if _covers(entry, on)]
        return sorted(found, key=lambda entry: entry.effective_from, reverse=True)

    def latest_for_region(self, region: str, *, on: str | None = None) -> CardEntry:
        found = self.for_region(region, on=on)
        if not found:
            raise PriceServiceError(
                f"no rate card covers the region {region!r}"
                + (f" on {on}" if on else "")
                + "; the prices are missing, not zero"
            )
        return found[0]


def _covers(entry: CardEntry, on: str) -> bool:
    if on < entry.effective_from:
        return False
    if entry.effective_to and on > entry.effective_to:
        return False
    return True


def region_for_district(district: str) -> str:
    """The card region a project's district belongs to.

    A district the service does not know is an error, not a silent "dhaka": pricing a Sylhet
    project with Dhaka prices because the table had no Sylhet row would be a false number.
    """
    key = (district or "").strip().lower()
    region = DISTRICT_REGIONS.get(key)
    if region is None:
        known = ", ".join(sorted(set(DISTRICT_REGIONS.values())))
        raise PriceServiceError(f"no card region for the district {district!r}; known: {known}")
    return region


def region_for_spec(spec: dict[str, Any]) -> str:
    """The card region for a Building Spec (its site's district)."""
    site = spec.get("site") or {}
    address = site.get("address") or {}
    district = address.get("district")
    if not district:
        raise PriceServiceError("the spec has no site.address.district - the prices cannot be placed")
    return region_for_district(str(district))


# ------------------------------------------------------------------- the resolution


@dataclass(frozen=True)
class ResolvedRate:
    """One rate, resolved for a region, with the truth about how it was got."""

    key: str
    label: dict[str, str]
    cost_type: str
    unit: str
    base_rate_bdt: float
    rate_bdt: float
    multiplier: float
    multiplier_status: str
    source: str
    note: str
    operator_included: bool | None = None
    fuel_included: bool | None = None
    minimum_charge_hours: float | None = None

    def prices_line(self, unit: str) -> bool:
        """A rate in another unit never prices a line (W2.6's law, kept here)."""
        return unit == self.unit

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": dict(self.label),
            "costType": self.cost_type,
            "unit": self.unit,
            "baseRateBdt": self.base_rate_bdt,
            "rateBdt": self.rate_bdt,
            "multiplier": self.multiplier,
            "multiplierStatus": self.multiplier_status,
            "source": self.source,
            "note": self.note,
            "operatorIncluded": self.operator_included,
            "fuelIncluded": self.fuel_included,
            "minimumChargeHours": self.minimum_charge_hours,
        }


def _card_line(card: dict[str, Any], key: str) -> dict[str, Any]:
    for line in card.get("lines") or []:
        if line.get("key") == key:
            return line
    known = ", ".join(str(line.get("key")) for line in card.get("lines") or [])
    raise PriceServiceError(f"the card {card.get('cardId')!r} has no rate line {key!r}; it holds: {known}")


def _multiplier_for(card: dict[str, Any], line: dict[str, Any], region: str) -> tuple[float, str]:
    if region == card.get("region"):
        return 1.0, MULTIPLIER_OWN
    line_map = line.get("regionalMultipliers") or {}
    if region in line_map:
        return float(line_map[region]), MULTIPLIER_PUBLISHED
    card_map = card.get("regionalMultipliers") or {}
    if region in card_map:
        return float(card_map[region]), MULTIPLIER_PUBLISHED
    return 1.0, MULTIPLIER_ASSUMED


def _pricing_source(card: dict[str, Any]) -> str:
    kind = str((card.get("source") or {}).get("kind") or "manual")
    return CARD_SOURCE_TO_PRICING_SOURCE.get(kind, "default")


def resolve_rate(card: dict[str, Any], key: str, region: str) -> ResolvedRate:
    """Resolve one card line for a region.

    The card's own region is 1.0 by definition; a published factor is applied; a region with no
    factor falls back to 1.0 **and says so** (``source: default``, the note on the line).
    """
    line = _card_line(card, key)
    base = float(line["rateBdt"])
    multiplier, status = _multiplier_for(card, line, region)
    rate = round(base * multiplier, 2)
    source = _pricing_source(card)
    notes: list[str] = []
    if status == MULTIPLIER_OWN:
        notes.append(f"the card's own region ({region})")
    elif status == MULTIPLIER_PUBLISHED:
        notes.append(f"region {region}: multiplier {multiplier:g} published by the card")
    else:
        notes.append(
            f"region {region}: no regional multiplier published - 1.00 assumed (verify on site)"
        )
        source = "default"
    if str(card.get("status")) == "candidate":
        notes.append("the card is a candidate: not verified against its source")
    return ResolvedRate(
        key=str(line["key"]),
        label=dict(line.get("label") or {}),
        cost_type=str(line.get("costType") or "other"),
        unit=str(line["unit"]),
        base_rate_bdt=base,
        rate_bdt=rate,
        multiplier=multiplier,
        multiplier_status=status,
        source=source,
        note="; ".join(notes),
        operator_included=line.get("operatorIncluded"),
        fuel_included=line.get("fuelIncluded"),
        minimum_charge_hours=line.get("minimumChargeHours"),
    )


def resolve_card(card: dict[str, Any], region: str, *, on: str | None = None) -> dict[str, Any]:
    """The card resolved for a region: a rate card whose rates are the region's rates.

    The result is a rate card in its own right (it satisfies the frozen interface), so the BOQ
    can price from it unchanged. Its ``region`` is the **resolved** region and its notes say
    which card it came from and what the multipliers were — a resolved card is a derived
    document, not a card in the store, and resolving it twice would apply the multipliers twice.
    """
    if on is not None:
        effective_from = str(card.get("effectiveFrom"))
        effective_to = card.get("effectiveTo")
        if on < effective_from or (effective_to and on > str(effective_to)):
            raise PriceServiceError(
                f"the card {card.get('cardId')!r} is not effective on {on} "
                f"(effective {effective_from} .. {effective_to or 'open-ended'})"
            )
    base_region = str(card.get("region"))
    lines: list[dict[str, Any]] = []
    summaries: list[str] = []
    for line in card.get("lines") or []:
        resolved = resolve_rate(card, str(line["key"]), region)
        rebuilt: dict[str, Any] = {
            "key": resolved.key,
            "label": resolved.label or {"bn": resolved.key, "en": resolved.key},
            "costType": resolved.cost_type,
            "unit": resolved.unit,
            "rateBdt": resolved.rate_bdt,
        }
        if resolved.cost_type == "machinery":
            # The machinery flags are the card's law: an operator-included rate and a
            # fuel-included rate are different products.
            rebuilt["operatorIncluded"] = bool(resolved.operator_included)
            rebuilt["fuelIncluded"] = bool(resolved.fuel_included)
            if resolved.minimum_charge_hours:
                rebuilt["minimumChargeHours"] = float(resolved.minimum_charge_hours)
        elif line.get("source"):
            rebuilt["source"] = dict(line["source"])
        if line.get("note"):
            rebuilt["note"] = str(line["note"])
        lines.append(rebuilt)
        summaries.append(f"{resolved.key} {resolved.rate_bdt:g} {resolved.unit} ({resolved.multiplier_status})")

    source = dict(card.get("source") or {})
    resolution_note = (
        f"resolved for {region} from card {card.get('cardId')} (base region {base_region}); "
        + "; ".join(summaries)
    )
    if source.get("note"):
        source["note"] = f"{source['note']} | {resolution_note}"
    else:
        source["note"] = resolution_note

    resolved_card = {
        "schemaVersion": card.get("schemaVersion", CARD_SCHEMA_VERSION),
        "cardId": card.get("cardId"),
        "region": region,
        "currency": card.get("currency", "BDT"),
        "status": card.get("status"),
        "effectiveFrom": card.get("effectiveFrom"),
        "source": source,
        "lines": lines,
        "notes": (
            f"resolved card - the regional multipliers are already applied; do not resolve it "
            f"again. {card.get('notes') or ''}"
        ).strip(),
    }
    if card.get("effectiveTo"):
        resolved_card["effectiveTo"] = card["effectiveTo"]
    if card.get("asOf"):
        resolved_card["asOf"] = card["asOf"]
    return resolved_card


def resolved_rates(card: dict[str, Any]) -> list[ResolvedRate]:
    """Every line of a card, resolved for the card's own region (the base rates)."""
    return [resolve_rate(card, str(line["key"]), str(card["region"])) for line in card.get("lines") or []]


def billable_quantity(quantity: float, rate: ResolvedRate | dict[str, Any]) -> tuple[float, str]:
    """The quantity a machinery line is billed for.

    A card may state a minimum billable time per mobilization (the excavator's "minimum 2 h").
    The billed quantity is the measured one, unless the minimum is higher - and then the note
    says so, because a quantity the reader cannot reconcile is a number nobody trusts.

    A minimum stated in hours is only applied to an hourly rate: a per-day rate with a
    two-hour minimum is a unit error, and the note says the minimum was not applied.
    """
    minimum = (
        rate.minimum_charge_hours
        if isinstance(rate, ResolvedRate)
        else rate.get("minimumChargeHours")
    )
    if not minimum:
        return quantity, ""
    unit = rate.unit if isinstance(rate, ResolvedRate) else str(rate.get("unit") or "")
    if unit != "hour":
        return quantity, (
            f"the card states a minimum of {float(minimum):g} h, but this rate is per {unit} - "
            "the minimum is not applied (unit mismatch)"
        )
    if quantity + 1e-9 >= float(minimum):
        return quantity, ""
    return float(minimum), (
        f"{quantity:g} {unit} measured; billed at the card's minimum "
        f"{float(minimum):g} {unit} per mobilization (one mobilization assumed)"
    )


# ------------------------------------------------------------------ the spec's pricing


def pricing_block(resolved: dict[str, Any]) -> dict[str, Any]:
    """The spec's inline pricing block for a resolved card.

    This is what the price service pushes into the Building Spec (W0.9's rate-card interface
    says so). Each entry carries its own source; the block's source is "mixed" when the entries
    disagree. A card line whose cost type has no home in the spec's pricing block (the plan has
    no "other" bucket there) is reported by the caller, never dropped silently.
    """
    entries: dict[str, list[dict[str, Any]]] = {bucket: [] for bucket in PRICING_BUCKETS.values()}
    unplaced: list[str] = []
    for line in resolved.get("lines") or []:
        cost_type = str(line.get("costType") or "other")
        bucket = PRICING_BUCKETS.get(cost_type)
        if bucket is None:
            unplaced.append(str(line.get("key")))
            continue
        entry: dict[str, Any] = {
            "key": str(line["key"]),
            "label": str((line.get("label") or {}).get("en") or line["key"]),
            "unit": str(line["unit"]),
            "rateBdt": float(line["rateBdt"]),
            "source": _entry_source(resolved, line),
        }
        if resolved.get("asOf"):
            entry["asOf"] = str(resolved["asOf"])
        note = _entry_note(resolved, line)
        if note:
            entry["note"] = note
        if cost_type == "machinery":
            entry["operatorIncluded"] = bool(line.get("operatorIncluded"))
            entry["fuelIncluded"] = bool(line.get("fuelIncluded"))
            if line.get("minimumChargeHours"):
                entry["minimumChargeHours"] = float(line["minimumChargeHours"])
        entries[bucket].append(entry)
    sources = {entry["source"] for bucket in entries.values() for entry in bucket}
    block: dict[str, Any] = {
        "currency": str(resolved.get("currency") or "BDT"),
        "source": sources.pop() if len(sources) == 1 else "mixed",
    }
    if resolved.get("asOf"):
        block["asOf"] = str(resolved["asOf"])
    notes: list[str] = []
    card_source_note = (resolved.get("source") or {}).get("note")
    if card_source_note:
        notes.append(str(card_source_note))
    if unplaced:
        # Declared, not dropped: the plan's cost types have no "other" bucket in the spec's
        # pricing block, so a card line of that type is reported, not silently lost.
        notes.append(f"not in the spec's pricing buckets: {', '.join(sorted(unplaced))}")
    if notes:
        block["notes"] = "; ".join(notes)
    block["card"] = {
        "cardId": str(resolved.get("cardId")),
        "region": str(resolved.get("region")),
        "status": str(resolved.get("status")),
        "effectiveFrom": str(resolved.get("effectiveFrom")),
        "source": dict(resolved.get("source") or {}),
    }
    for bucket, items in entries.items():
        if items:
            block[bucket] = items
    return block


def _entry_source(resolved: dict[str, Any], line: dict[str, Any]) -> str:
    if line.get("source"):
        return CARD_SOURCE_TO_PRICING_SOURCE.get(str(line["source"].get("kind")), "fetched")
    kind = str((resolved.get("source") or {}).get("kind") or "manual")
    source = CARD_SOURCE_TO_PRICING_SOURCE.get(kind, "default")
    if source == "fetched" and str(resolved.get("status")) == "candidate":
        # A candidate list is not a verified price; the entry says "default" and the note says
        # the card is unverified.
        source = "default"
    return source


def _entry_note(resolved: dict[str, Any], line: dict[str, Any]) -> str:
    notes: list[str] = []
    if str(resolved.get("status")) == "candidate":
        notes.append(f"card {resolved.get('cardId')} is a candidate (not verified)")
    if line.get("minimumChargeHours"):
        notes.append(f"minimum {line['minimumChargeHours']:g} {line['unit']} per mobilization")
    if line.get("note"):
        notes.append(str(line["note"]))
    return "; ".join(notes)


def apply_pricing(
    spec: dict[str, Any],
    pricing: dict[str, Any],
    *,
    at: str | None = None,
    provenance_source: str | None = None,
    detail: str | None = None,
) -> dict[str, Any]:
    """Push a pricing block into the spec through the spec engine (provenance per path).

    The patch is validated before it is returned: a pricing block the schema refuses never
    reaches the spec, and nothing partial is written.
    """
    source = provenance_source or _block_provenance_source(pricing)
    ops = [
        {
            "op": "replace" if "pricing" in spec else "add",
            "path": "/pricing",
            "value": pricing,
        }
    ]
    card = pricing.get("card") or {}
    return apply_patch(
        spec,
        ops,
        provenance={
            "source": source,
            "detail": detail
            or f"price service: card {card.get('cardId')} ({card.get('region')}, "
            f"{card.get('status')})",
        },
        at=at,
    )


def _block_provenance_source(pricing: dict[str, Any]) -> str:
    source = str(pricing.get("source") or "default")
    if source in ("user", "fetched", "default", "mixed"):
        return source
    return "default"


# ------------------------------------------------------------------- the override


def override_entry(
    card: dict[str, Any],
    key: str,
    rate_bdt: float,
    *,
    reason: str,
    at: str | None = None,
) -> dict[str, Any]:
    """The Deviation Register entry for a user's own price.

    The register is where an engineer looks for "what did someone change, and did they say
    why?" - so the entry carries the card's rate (expected), the user's rate (actual), the
    reason, the acknowledgement and the nearest compliant alternative (the card's rate again,
    which is what the one-click restore puts back).
    """
    line = _card_line(card, key)
    base = float(line["rateBdt"])
    unit = str(line["unit"])
    stamp = at or utc_now_iso()
    return {
        "id": f"price-{key}",
        "ruleRef": f"price-card#{card.get('cardId')}/{key}",
        "ruleTitle": f"Price override: {(line.get('label') or {}).get('en') or key}",
        "expected": f"{base:.2f} BDT/{unit}",
        "actual": f"{rate_bdt:.2f} BDT/{unit}",
        "riskTier": "cost_risk",
        "rationale": reason,
        "acknowledged": True,
        "recordedAt": stamp,
        "nearestCompliantAlternative": f"the card rate {base:.2f} BDT/{unit}",
    }


def override_pricing(
    pricing: dict[str, Any],
    card: dict[str, Any],
    key: str,
    rate_bdt: float,
    *,
    reason: str,
    at: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The pricing block with the user's rate in it, plus the register entry."""
    line = _card_line(card, key)
    unit = str(line["unit"])
    base = float(line["rateBdt"])
    bucket = PRICING_BUCKETS.get(str(line.get("costType") or "other"))
    updated = json.loads(json.dumps(pricing))  # a deep copy, JSON-clean
    if bucket is None:
        raise PriceServiceError(
            f"the card line {key!r} has no bucket in the spec's pricing block - "
            "a rate of that cost type cannot be overridden in the spec"
        )
    entries = list(updated.get(bucket) or [])
    found = False
    for index, entry in enumerate(entries):
        if entry.get("key") == key:
            entries[index] = {
                **entry,
                "rateBdt": float(rate_bdt),
                "source": "user",
                "note": (
                    f"user override of the card rate {base:.2f} BDT/{unit} "
                    f"(card {card.get('cardId')}): {reason}"
                ),
            }
            found = True
            break
    if not found:
        entries.append(
            {
                "key": key,
                "label": str((line.get("label") or {}).get("en") or key),
                "unit": unit,
                "rateBdt": float(rate_bdt),
                "source": "user",
                "note": (
                    f"user override of the card rate {base:.2f} BDT/{unit} "
                    f"(card {card.get('cardId')}): {reason}"
                ),
            }
        )
    updated[bucket] = entries
    updated["source"] = "mixed" if len({entry["source"] for entry in entries}) > 1 else "user"
    entry = override_entry(card, key, rate_bdt, reason=reason, at=at)
    return updated, entry


def apply_override(
    spec: dict[str, Any],
    pricing: dict[str, Any],
    card: dict[str, Any],
    key: str,
    rate_bdt: float,
    *,
    reason: str,
    at: str | None = None,
) -> dict[str, Any]:
    """Apply a user's price override: the pricing block and the register entry, in one patch."""
    stamp = at or utc_now_iso()
    updated, entry = override_pricing(
        pricing, card, key, rate_bdt, reason=reason, at=stamp
    )
    ops: list[dict[str, Any]] = [
        {"op": "replace" if "pricing" in spec else "add", "path": "/pricing", "value": updated}
    ]
    existing = list(spec.get("deviations") or [])
    index = next(
        (i for i, item in enumerate(existing) if isinstance(item, dict) and item.get("id") == entry["id"]),
        None,
    )
    if index is None:
        ops.append({"op": "add", "path": "/deviations/-", "value": entry})
    else:
        merged = dict(entry)
        previous = existing[index]
        for carry in ("recordedAt", "rationale", "acknowledged"):
            if previous.get(carry) is not None:
                merged[carry] = previous[carry]
        ops.append({"op": "replace", "path": f"/deviations/{index}", "value": merged})
    return apply_patch(
        spec,
        ops,
        provenance={
            "source": "user",
            "detail": f"price override: {key} -> {rate_bdt:.2f} BDT/{_card_line(card, key)['unit']}",
        },
        at=stamp,
    )


def restore_override(
    spec: dict[str, Any],
    pricing: dict[str, Any],
    card: dict[str, Any],
    key: str,
    *,
    at: str | None = None,
) -> dict[str, Any]:
    """Put the card's rate back (the one-click "restore to compliant" for a price)."""
    line = _card_line(card, key)
    unit = str(line["unit"])
    base = float(line["rateBdt"])
    bucket = PRICING_BUCKETS[str(line["costType"])]
    updated = json.loads(json.dumps(pricing))
    entries = []
    for entry in updated.get(bucket) or []:
        if entry.get("key") == key:
            restored = {
                **entry,
                "rateBdt": base,
                "source": _entry_source(card, {"source": card.get("source")}),
            }
            note = f"restored to the card rate {base:.2f} BDT/{unit} (card {card.get('cardId')})"
            if restored.get("note"):
                restored["note"] = note
            else:
                restored["note"] = note
            entries.append(restored)
        else:
            entries.append(entry)
    updated[bucket] = entries
    sources = {entry["source"] for entry in entries}
    updated["source"] = sources.pop() if len(sources) == 1 else "mixed"
    ops: list[dict[str, Any]] = [
        {"op": "replace" if "pricing" in spec else "add", "path": "/pricing", "value": updated}
    ]
    existing = list(spec.get("deviations") or [])
    for index, item in reversed(list(enumerate(existing))):
        if isinstance(item, dict) and item.get("id") == f"price-{key}":
            ops.append({"op": "remove", "path": f"/deviations/{index}"})
    return apply_patch(
        spec,
        ops,
        provenance={
            "source": "engine",
            "detail": f"restore the card rate for {key}",
        },
        at=at,
    )


# ------------------------------------------------------------- the official-list fetch


def parse_rates(artifact: str | pathlib.Path, recipe: dict[str, Any]) -> tuple[list[dict], list[dict]]:
    """Turn a fetched price list into rate lines, with the rows we could not use.

    The recipe is data, not code: it says which columns hold the key, the unit, the rate and
    the labels. A row without a usable key, a usable rate or a *reviewed* label is skipped and
    reported - the plan's law that Bangla is hand-authored, never machine-translated, is
    enforced here: a line without both labels is not a rate line yet.
    """
    path = pathlib.Path(artifact)
    kind = str(recipe.get("kind") or "csv").lower()
    columns = dict(recipe.get("columns") or {})
    if "key" not in columns or "rate" not in columns:
        raise PriceServiceError("the parse recipe must name the key column and the rate column")
    label_map = dict(recipe.get("labelMap") or {})
    cost_type = str(recipe.get("costType") or "material")

    rows: list[dict[str, str]] = []
    if kind == "csv":
        delimiter = str(recipe.get("delimiter") or ",")
        skip_rows = int(recipe.get("skipRows") or 0)
        with path.open("r", encoding=str(recipe.get("encoding") or "utf-8-sig"), newline="") as handle:
            reader = csv.DictReader(handle, delimiter=delimiter)
            for _ in range(skip_rows):
                next(reader, None)
            for row in reader:
                rows.append({str(k): ("" if v is None else str(v)) for k, v in row.items()})
    elif kind == "json":
        document = json.loads(path.read_text(encoding="utf-8"))
        payload: Any = document
        for token in str(recipe.get("path") or "").split("."):
            if not token:
                continue
            if not isinstance(payload, dict) or token not in payload:
                raise PriceServiceError(
                    f"the JSON path {recipe.get('path')!r} is not in the fetched artifact"
                )
            payload = payload[token]
        if not isinstance(payload, list):
            raise PriceServiceError("the JSON path must point at an array of rows")
        rows = [{str(k): ("" if v is None else str(v)) for k, v in row.items()} for row in payload]
    else:
        raise PriceServiceError(f"unknown parse recipe kind {kind!r} (csv or json)")

    lines: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        key = _cell(row, columns.get("key"))
        if not key:
            skipped.append({"row": index, "reason": "no key"})
            continue
        if not _KEY_RE.match(key):
            skipped.append({"row": index, "key": key, "reason": "the key is not a rate-card key"})
            continue
        rate = _parse_number(_cell(row, columns.get("rate")))
        if rate is None:
            skipped.append({"row": index, "key": key, "reason": "no readable rate"})
            continue
        label = _label_for(row, columns, label_map, key)
        if label is None:
            skipped.append({"row": index, "key": key, "reason": "no reviewed label (bn + en)"})
            continue
        unit = _cell(row, columns.get("unit")) or str(recipe.get("defaultUnit") or "each")
        line: dict[str, Any] = {
            "key": key,
            "label": label,
            "costType": cost_type,
            "unit": unit,
            "rateBdt": rate,
        }
        if cost_type == "machinery":
            line["operatorIncluded"] = bool(recipe.get("operatorIncluded"))
            line["fuelIncluded"] = bool(recipe.get("fuelIncluded"))
            if recipe.get("minimumChargeHours"):
                line["minimumChargeHours"] = float(recipe["minimumChargeHours"])
        lines.append(line)
    return lines, skipped


def _cell(row: dict[str, str], column: str | None) -> str:
    if not column:
        return ""
    return (row.get(column) or "").strip()


def _parse_number(text: str) -> float | None:
    cleaned = text.replace(",", "").replace("৳", "").replace("BDT", "").replace("Tk", "").strip()
    if not cleaned:
        return None
    try:
        value = float(cleaned)
    except ValueError:
        return None
    if value < 0:
        return None
    return round(value, 2)


def _label_for(
    row: dict[str, str],
    columns: dict[str, str],
    label_map: dict[str, Any],
    key: str,
) -> dict[str, str] | None:
    """The line's label, in Bangla and English - or nothing at all.

    The Bangla must come from the list or from a human-written map; it is never invented.
    """
    mapped = label_map.get(key)
    if isinstance(mapped, dict) and mapped.get("bn") and mapped.get("en"):
        return {"bn": str(mapped["bn"]), "en": str(mapped["en"])}
    bn = _cell(row, columns.get("labelBn")) or _cell(row, columns.get("label"))
    en = _cell(row, columns.get("labelEn"))
    if not bn or not en:
        return None
    return {"bn": bn, "en": en}


def build_card(
    lines: list[dict[str, Any]],
    *,
    card_id: str,
    region: str,
    source: dict[str, Any],
    effective_from: str,
    skipped: list[dict[str, Any]] | None = None,
    notes: str = "",
) -> dict[str, Any]:
    """A candidate card from parsed lines.

    A fetched list is a **candidate** until a human marks it active: the plan's quality law
    (plan §9) and the Source Registry's fetch policy say the same thing.
    """
    if not lines:
        raise PriceServiceError("the list produced no usable rate lines - nothing to build a card from")
    card: dict[str, Any] = {
        "schemaVersion": CARD_SCHEMA_VERSION,
        "cardId": card_id,
        "region": region,
        "currency": "BDT",
        "status": "candidate",
        "effectiveFrom": effective_from,
        "source": source,
        "lines": lines,
    }
    note_parts = [notes] if notes else []
    if skipped:
        note_parts.append(
            f"{len(skipped)} row(s) of the fetched list were not usable and are listed in the "
            "fetch report (a row without a key, a rate or a reviewed label is not a rate line)"
        )
    if note_parts:
        card["notes"] = "; ".join(note_parts)
    return card


def fetch_card(
    entry: dict[str, Any],
    recipe: dict[str, Any],
    *,
    card_store: str | pathlib.Path,
    cache_root: str | pathlib.Path,
    card_id: str,
    region: str,
    consent: bool,
    now: dt.datetime | None = None,
) -> dict[str, Any]:
    """Fetch an official list through the Source Registry and build a candidate card.

    Consent first: the registry's fetch law says nothing fetches without the user's approval,
    and this function will not fetch without it. The artifact is hashed and recorded in the
    cache manifest, and the card that comes out is a **candidate**.
    """
    if not consent:
        raise ConsentRequired(
            f"fetching {entry.get('id')!r} needs the user's consent "
            "(the Source Registry's fetch law: nothing fetches without it)"
        )
    record = fetch_source(entry, cache_root, now=now)
    artifact = pathlib.Path(cache_root) / str(entry["id"]) / str(record["fileName"])
    lines, skipped = parse_rates(artifact, recipe)
    source = {
        "kind": str(recipe.get("sourceKind") or "official_list"),
        "name": str((entry.get("title") or {}).get("en") or entry.get("id")),
        "url": record["url"],
        "retrievedAt": str(record["retrievedAt"])[:10],
        "sha256": record["sha256"],
        "note": f"Source Registry: {entry.get('id')} ({record['retrievedAt']})",
    }
    effective_from = str(record["retrievedAt"])[:10]
    card = build_card(
        lines,
        card_id=card_id,
        region=region,
        source=source,
        effective_from=effective_from,
        skipped=skipped,
        notes=(
            f"fetched candidate from {entry.get('id')} - verify against the source before use "
            "(the artifact is hashed in the source cache manifest)"
        ),
    )
    store = pathlib.Path(card_store)
    store.mkdir(parents=True, exist_ok=True)
    path = store / f"{card_id}.json"
    path.write_text(
        json.dumps(card, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return {"record": record, "card": card, "skipped": skipped, "path": path}


__all__ = [
    "CARD_SCHEMA_VERSION",
    "ConsentRequired",
    "CardEntry",
    "CardRegistry",
    "MULTIPLIER_ASSUMED",
    "MULTIPLIER_OWN",
    "MULTIPLIER_PUBLISHED",
    "PriceServiceError",
    "ResolvedRate",
    "apply_override",
    "apply_pricing",
    "billable_quantity",
    "build_card",
    "fetch_card",
    "override_entry",
    "override_pricing",
    "parse_rates",
    "pricing_block",
    "region_for_district",
    "region_for_spec",
    "resolve_card",
    "resolve_rate",
    "resolved_rates",
    "restore_override",
]
