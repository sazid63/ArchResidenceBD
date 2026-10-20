"""The price service's face: list the cards, resolve one for a region, push it into a spec,
register a user's own rate, and fetch an official list (with consent).

Everything here is deterministic: the same card and the same region always produce the same
resolved card, the same pricing block and the same priced spec. The fetch is the only command
that touches the network, and it refuses to run without the user's consent.

Usage (from the repo root):
  uv run --directory core python ../tools/pricing/price_service.py registry
  uv run --directory core python ../tools/pricing/price_service.py resolve --card <card-id> --region <region>
  uv run --directory core python ../tools/pricing/price_service.py apply --card <card-id> --region <region> --spec <file>
  uv run --directory core python ../tools/pricing/price_service.py override --spec <file> --card <card-id> --key <key> --rate <bdt> --reason "<why>"
  uv run --directory core python ../tools/pricing/price_service.py fetch --source <source-id> --recipe <file> --card-id <id> --region <region> --consent
  uv run --directory core python ../tools/pricing/price_service.py --write     # write the committed artefacts
  uv run --directory core python ../tools/pricing/price_service.py --check     # verify them (CI)
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import (
    build_boq,
    design_foundation,
    design_rebar,
    design_takeoff,
    design_typical_floor,
)
from archres_core.pricing import (
    CardRegistry,
    PriceServiceError,
    apply_override,
    apply_pricing,
    pricing_block,
    region_for_spec,
    resolve_card,
    resolve_rate,
)
from archres_core.sources import load_registry
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE_CARDS = ROOT / "spec" / "examples" / "interfaces"
CARD_STORE = ROOT / "data" / "prices" / "cards"
EXAMPLE_SPEC = ROOT / "spec" / "examples" / "two-storey-residential.json"
SOURCE_REGISTRY = ROOT / "spec" / "sources" / "registry.yaml"
OUT = ROOT / "data" / "prices"

REGISTRY_JSON = OUT / "registry.json"
RESOLVED_CARD = OUT / "resolved" / "two-storey-residential.dhaka.json"
PRICED_SPEC = OUT / "spec" / "two-storey-residential.priced.json"
REPORT = OUT / "report.md"


def _rel(path: pathlib.Path) -> str:
    """A repo-relative path (the committed artefacts must not carry a machine's directory)."""
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _registry() -> CardRegistry:
    return CardRegistry.from_directories(EXAMPLE_CARDS, CARD_STORE)


def _example() -> dict:
    return json.loads(EXAMPLE_SPEC.read_text(encoding="utf-8"))


def _resolved_for_example() -> dict:
    spec = _example()
    region = region_for_spec(spec)
    registry = _registry()
    entry = registry.latest_for_region(region)
    return resolve_card(entry.card, region)


def _boq_from(prices: dict) -> dict:
    """The BOQ the prices produce - the cross-check that the service did not move a number."""
    spec = _example()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)
    return build_boq(takeoff, prices)


def _render_report(registry: CardRegistry, resolved: dict, priced_spec: dict, boq: dict) -> str:
    card = priced_spec["pricing"]["card"]
    region = str(card["region"])
    base_card = next(
        (entry.card for entry in registry.cards() if entry.card_id == card["cardId"]), {}
    )
    lines = [
        "# Price service v0 — the example project",
        "",
        f"- Project: `{priced_spec['project']['id']}` "
        f"({priced_spec['site']['address']['district']}, "
        f"{priced_spec['building']['storeys']['count']} storeys)",
        f"- Card: `{card['cardId']}` — region **{card['region']}**, status **{card['status']}**, "
        f"effective from {card['effectiveFrom']}",
        f"- Source: {card['source'].get('name')} ({card['source'].get('kind')})",
        "",
        "## The card registry",
        "",
        "| Card | Region | Status | From | Lines | File |",
        "|---|---|---|---|---:|---|",
    ]
    for entry in registry.cards():
        lines.append(
            f"| `{entry.card_id}` | {entry.region} | {entry.status} | {entry.effective_from} | "
            f"{len(entry.card.get('lines') or [])} | `{entry.path.relative_to(ROOT).as_posix()}` |"
        )
    if registry.skipped:
        lines += ["", "Files that are not rate cards (skipped, reported):", ""]
        for item in registry.skipped:
            lines.append(f"- `{_rel(pathlib.Path(item['file']))}` — {item['reason']}")
    lines += [
        "",
        "## The resolved rates (the card resolved for this project's region)",
        "",
        "| Key | Type | Unit | Card rate | Multiplier | How | Resolved |",
        "|---|---|---|---:|---:|---|---:|",
    ]
    for bucket, cost_type in (
        ("materials", "material"),
        ("labour", "labour"),
        ("machinery", "machinery"),
        ("subcontract", "subcontract"),
    ):
        for entry in priced_spec["pricing"].get(bucket) or []:
            rate = resolve_rate(base_card, entry["key"], region)
            lines.append(
                f"| `{entry['key']}` | {cost_type} | {entry['unit']} | "
                f"{rate.base_rate_bdt:,.2f} | {rate.multiplier:g} | {rate.multiplier_status} | "
                f"{entry['rateBdt']:,.2f} |"
            )
    lines += [
        "",
        "## The same card for another region (the multiplier law on real numbers)",
        "",
        "| Key | Card rate | Chattogram multiplier | Resolved |",
        "|---|---:|---:|---:|",
    ]
    for entry in base_card.get("lines") or []:
        rate = resolve_rate(base_card, str(entry["key"]), "chattogram")
        lines.append(
            f"| `{rate.key}` | {rate.base_rate_bdt:,.2f} | {rate.multiplier:g} "
            f"({rate.multiplier_status}) | {rate.rate_bdt:,.2f} |"
        )
    lines += [
        "",
        "A region the card publishes no multiplier for (rajshahi, here) is priced at 1.00 and "
        "marked `source: default` — an assumed regional rate says so instead of pretending.",
        "",
        "## The pricing pushed into the spec",
        "",
        f"- `/pricing.source`: `{priced_spec['pricing']['source']}`",
        f"- `/pricing.card`: `{card['cardId']}` ({card['region']}, {card['status']})",
        f"- The spec's own provenance entry for `/pricing`: "
        f"`{priced_spec['provenance']['/pricing']['source']}` — "
        f"{priced_spec['provenance']['/pricing']['detail']}",
        "",
        "## The BOQ those prices produce (the cross-check)",
        "",
        f"- **{boq['totals']['amountBdt']:,.2f} BDT** "
        f"({boq['totals']['pricedLines']} priced, {len(boq['totals']['unpricedLines'])} unpriced)",
        f"- The committed BOQ (built straight from the card) totals the same: "
        f"**{_committed_boq_total():,.2f} BDT** "
        "— the service resolved the card, it did not move a price.",
        "",
        "## What this service does not do (declared, not implied)",
        "",
        "- The card in the repository is an **illustrative candidate** (its own note says "
        "\"never use for a BOQ\"). Nothing here is a real market price.",
        "- No official list has been fetched from the network yet: the Source Registry's price "
        "sources (BBS, PWD, BWDB) were not reachable from the build machine (see "
        "`docs/spec/source-registry-v0.md`). The fetch path is implemented and tested against a "
        "local server, not against a real list.",
        "- A region the card publishes no multiplier for is priced at 1.00 and says so "
        "(`source: default`). A price that pretends to be regional is worse than a missing one.",
        "- The BOQ's xlsx/PDF renderers, the price-update scheduling and the consent UI are "
        "P3's and the app's (W2.8).",
    ]
    return "\n".join(lines) + "\n"


def _committed_boq_total() -> float:
    """The BOQ the committed card produces (the number the service must not move)."""
    card = json.loads(
        (ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json").read_text(
            encoding="utf-8"
        )
    )
    return float(_boq_from(card)["totals"]["amountBdt"])


def _artefacts() -> dict[str, str]:
    registry = _registry()
    resolved = _resolved_for_example()
    block = pricing_block(resolved)
    # A fixed timestamp keeps the committed artefact byte-stable; it is the price list's own
    # observation date, which is the honest moment for "these prices were read".
    as_of = str(resolved.get("asOf") or resolved.get("effectiveFrom"))
    priced_spec = apply_pricing(_example(), block, at=f"{as_of}T00:00:00+00:00")
    boq = _boq_from(resolved)
    registry_json = {
        "cards": [
            {**entry.summary(), "file": _rel(entry.path)} for entry in registry.cards()
        ],
        "skipped": [
            {**item, "file": _rel(pathlib.Path(item["file"]))} for item in registry.skipped
        ],
    }
    return {
        REGISTRY_JSON: json.dumps(registry_json, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        RESOLVED_CARD: json.dumps(resolved, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        PRICED_SPEC: json.dumps(priced_spec, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        REPORT: _render_report(registry, resolved, priced_spec, boq),
    }


def _write(artefacts: dict[str, str]) -> None:
    for path, text in artefacts.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {path.relative_to(ROOT).as_posix()}")


def _check(artefacts: dict[str, str]) -> list[str]:
    problems: list[str] = []
    for path, text in artefacts.items():
        if not path.is_file():
            problems.append(f"{path.relative_to(ROOT).as_posix()} is missing")
            continue
        if path.read_text(encoding="utf-8") != text:
            problems.append(f"{path.relative_to(ROOT).as_posix()} is stale")
    return problems


def _cmd_registry(args: argparse.Namespace) -> int:
    registry = _registry()
    if args.json:
        print(
            json.dumps(
                {
                    "cards": [
                        {**entry.summary(), "file": _rel(entry.path)} for entry in registry.cards()
                    ],
                    "skipped": [
                        {**item, "file": _rel(pathlib.Path(item["file"]))}
                        for item in registry.skipped
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    for entry in registry.cards():
        source = entry.source
        print(
            f"{entry.card_id:28} {entry.region:12} {entry.status:10} "
            f"from {entry.effective_from}  {len(entry.card.get('lines') or []):2} lines  "
            f"({source.get('kind')}: {source.get('name')})"
        )
    for item in registry.skipped:
        print(f"- skipped {_rel(pathlib.Path(item['file']))}: {item['reason']}")
    return 0


def _cmd_resolve(args: argparse.Namespace) -> int:
    registry = _registry()
    entry = registry.get(args.card)
    resolved = resolve_card(entry.card, args.region)
    print(json.dumps(resolved, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def _cmd_apply(args: argparse.Namespace) -> int:
    registry = _registry()
    entry = registry.get(args.card)
    resolved = resolve_card(entry.card, args.region)
    spec = json.loads(pathlib.Path(args.spec).read_text(encoding="utf-8"))
    priced = apply_pricing(spec, pricing_block(resolved))
    print(json.dumps(priced, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def _cmd_override(args: argparse.Namespace) -> int:
    registry = _registry()
    entry = registry.get(args.card)
    spec = json.loads(pathlib.Path(args.spec).read_text(encoding="utf-8"))
    pricing = spec.get("pricing") or pricing_block(resolve_card(entry.card, args.region))
    priced = apply_override(
        spec, pricing, entry.card, args.key, args.rate, reason=args.reason
    )
    print(json.dumps(priced, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


def _cmd_fetch(args: argparse.Namespace) -> int:
    from archres_core.pricing import fetch_card

    registry = load_registry(SOURCE_REGISTRY)
    entry = next((item for item in registry.get("sources") or [] if item.get("id") == args.source), None)
    if entry is None:
        print(f"no source {args.source!r} in the registry", file=sys.stderr)
        return 1
    recipe = json.loads(pathlib.Path(args.recipe).read_text(encoding="utf-8"))
    result = fetch_card(
        entry,
        recipe,
        card_store=CARD_STORE,
        cache_root=ROOT / "data" / "cache" / "sources",
        card_id=args.card_id,
        region=args.region,
        consent=args.consent,
    )
    print(f"fetched {result['record']['url']} -> {result['record']['sha256'][:12]}…")
    print(f"card written: {result['path'].relative_to(ROOT).as_posix()}")
    print(f"lines: {len(result['card']['lines'])}  skipped rows: {len(result['skipped'])}")
    for item in result["skipped"]:
        print(f"- row {item.get('row')} ({item.get('key', '-')}): {item['reason']}")
    return 0


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="The price service (W2.7).")
    parser.add_argument("--write", action="store_true", help="write the committed artefacts")
    parser.add_argument("--check", action="store_true", help="verify the committed artefacts")
    sub = parser.add_subparsers(dest="command")

    registry_parser = sub.add_parser("registry", help="list the rate cards the app knows")
    registry_parser.add_argument("--json", action="store_true")
    registry_parser.set_defaults(func=_cmd_registry)

    resolve_parser = sub.add_parser("resolve", help="resolve a card for a region")
    resolve_parser.add_argument("--card", required=True)
    resolve_parser.add_argument("--region", required=True)
    resolve_parser.set_defaults(func=_cmd_resolve)

    apply_parser = sub.add_parser("apply", help="push the resolved prices into a spec")
    apply_parser.add_argument("--card", required=True)
    apply_parser.add_argument("--region", required=True)
    apply_parser.add_argument("--spec", required=True)
    apply_parser.set_defaults(func=_cmd_apply)

    override_parser = sub.add_parser("override", help="register a user's own rate")
    override_parser.add_argument("--spec", required=True)
    override_parser.add_argument("--card", required=True)
    override_parser.add_argument("--key", required=True)
    override_parser.add_argument("--rate", required=True, type=float)
    override_parser.add_argument("--reason", required=True)
    override_parser.set_defaults(func=_cmd_override)

    fetch_parser = sub.add_parser("fetch", help="fetch an official list (consent required)")
    fetch_parser.add_argument("--source", required=True)
    fetch_parser.add_argument("--recipe", required=True)
    fetch_parser.add_argument("--card-id", required=True)
    fetch_parser.add_argument("--region", required=True)
    fetch_parser.add_argument("--consent", action="store_true")
    fetch_parser.set_defaults(func=_cmd_fetch)

    args = parser.parse_args()

    try:
        if args.write or args.check:
            artefacts = _artefacts()
            if args.write:
                _write(artefacts)
                return 0
            problems = _check(artefacts)
            for problem in problems:
                print(f"FAIL {problem}", file=sys.stderr)
            if problems:
                return 1
            print("the committed price-service artefacts are fresh")
            return 0
        if not getattr(args, "func", None):
            parser.print_help()
            return 1
        return int(args.func(args))
    except PriceServiceError as exc:
        print(f"price service: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
