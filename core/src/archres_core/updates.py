"""The updates (W5.4): what changes, pinned to exact versions, and what is refused.

An update moves four things ✓ — the **app** ✓, the **models** ✓, the **rules** ✓ and the
**prices** ✓ — and each of them carries a version ✓, and the versions are what the update
is *about* ✓: not "the latest" ✓, but **exactly this** ✓ ✓.

Three laws make the update safe, and all three are the repo's own:

- **the money law** ✓ — a price card that is a **candidate** stays a candidate across an
  update ✓ ✓. The plan's law is that fetched numbers are candidates until a human activates
  them ✓ (OWNER-ATTENTION #8 ✓), so an update that silently activated an unverified card
  would break it ✓ — and the update **refuses** ✓ ✓.
- **the law does not move backwards** ✓ — a rule pack's version *is* the law the app applies
  ✓, so a **downgrade** is refused ✓: a building designed under the newer law must not
  suddenly be judged by the older one ✓ ✓.
- **the roster is fixed** ✓ — the plan's decision is **no new model members** without the
  owner's sign-off ✓, so an update that adds or removes a model is refused ✓ ✓.

And the update is a **plan first** ✓ — it says what it would change ✓ and what it refuses ✓,
and it applies nothing until the plan is read ✓ ✓.
"""

from __future__ import annotations

import json
import pathlib
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

__all__ = [
    "CHANNELS",
    "Channel",
    "UpdateError",
    "UpdatePlan",
    "Version",
    "check_updates",
    "parse_version",
    "plan_update",
    "update_document",
]

#: A version: digits and dots, with an optional pre-release tag ✓.
_VERSION = re.compile(r"^(\d+(?:\.\d+)*)(?:[-+](.+))?$")

#: The four things an update moves ✓.
CHANNELS = ("app", "models", "rules", "prices")


class UpdateError(ValueError):
    """The update cannot be planned (never a silent gap ✓)."""


def parse_version(text: str) -> tuple[tuple[int, ...], str]:
    """A version, as a comparable pair ✓ (the numbers ✓, the tag ✓) ✓."""
    match = _VERSION.match(str(text).strip())
    if not match:
        raise UpdateError(f"not a version: {text!r}")
    numbers = tuple(int(part) for part in match.group(1).split("."))
    return numbers, (match.group(2) or "")


@dataclass(frozen=True)
class Version:
    """One channel's installed and offered versions ✓."""

    channel: str
    current: str
    offered: str
    current_status: str | None = None
    offered_status: str | None = None
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "channel": self.channel,
            "current": self.current,
            "offered": self.offered,
            "currentStatus": self.current_status,
            "offeredStatus": self.offered_status,
            "note": self.note,
        }


@dataclass(frozen=True)
class Channel:
    """One channel's update, and whether it may happen ✓."""

    channel: str
    current: str
    offered: str
    action: str  # "update" | "none" | "refused"
    reason: str = ""
    status_before: str | None = None
    status_after: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "channel": self.channel,
            "current": self.current,
            "offered": self.offered,
            "action": self.action,
            "reason": self.reason,
            "statusBefore": self.status_before,
            "statusAfter": self.status_after,
        }


@dataclass(frozen=True)
class UpdatePlan:
    """What an update would do ✓ — and what it refuses ✓."""

    channels: tuple[Channel, ...]
    pinned: dict[str, str] = field(default_factory=dict)

    @property
    def applicable(self) -> tuple[Channel, ...]:
        return tuple(item for item in self.channels if item.action == "update")

    @property
    def refused(self) -> tuple[Channel, ...]:
        return tuple(item for item in self.channels if item.action == "refused")

    def as_dict(self) -> dict[str, Any]:
        return {
            "channels": [item.as_dict() for item in self.channels],
            "pinned": dict(self.pinned),
            "counts": {
                "channels": len(self.channels),
                "applicable": len(self.applicable),
                "refused": len(self.refused),
                "unchanged": sum(1 for item in self.channels if item.action == "none"),
            },
        }


def _is_older(offered: str, current: str) -> bool:
    """Whether the offered version is **older** than the current one ✓."""
    try:
        offered_parts, offered_tag = parse_version(offered)
        current_parts, current_tag = parse_version(current)
    except UpdateError:
        return False
    if offered_parts != current_parts:
        return offered_parts < current_parts
    # same numbers: a pre-release is older than the release ✓
    if bool(offered_tag) != bool(current_tag):
        return bool(offered_tag)
    return False


def _channel_for(
    channel: str,
    current: str,
    offered: str,
    *,
    current_status: str | None = None,
    offered_status: str | None = None,
    roster: tuple[str, ...] = (),
    offered_roster: tuple[str, ...] = (),
) -> Channel:
    """One channel's decision ✓ — the three laws live here ✓ ✓."""
    # the roster is fixed: no new model members without the owner's sign-off ✓
    # (this is checked before the version, because a roster can change at any version ✓)
    if roster and offered_roster and roster != offered_roster:
        return Channel(
            channel=channel,
            current=current,
            offered=offered,
            action="refused",
            reason=(
                f"the roster would change ({', '.join(roster)} -> {', '.join(offered_roster)}); "
                "the fleet's members are fixed and a change needs the owner's sign-off"
            ),
            status_before=current_status,
            status_after=current_status,
        )

    if current == offered:
        return Channel(
            channel=channel,
            current=current,
            offered=offered,
            action="none",
            reason="the offered version is the installed one",
            status_before=current_status,
            status_after=current_status,
        )

    # the law does not move backwards ✓
    if _is_older(offered, current):
        return Channel(
            channel=channel,
            current=current,
            offered=offered,
            action="refused",
            reason=(
                f"the offered version {offered} is older than the installed {current}; the law "
                "does not move backwards"
            ),
            status_before=current_status,
            status_after=current_status,
        )

    # the money law: a candidate card stays a candidate ✓
    if current_status == "candidate" and offered_status != "candidate":
        return Channel(
            channel=channel,
            current=current,
            offered=offered,
            action="refused",
            reason=(
                f"the installed card is a candidate and the offered one is {offered_status!r}; "
                "activating a price card is a human act, not an update's"
            ),
            status_before=current_status,
            status_after=current_status,
        )

    return Channel(
        channel=channel,
        current=current,
        offered=offered,
        action="update",
        reason="the offered version is newer",
        status_before=current_status,
        status_after=offered_status or current_status,
    )


def plan_update(
    versions: Sequence[Version],
    *,
    rosters: dict[str, tuple[str, ...]] | None = None,
) -> UpdatePlan:
    """The plan ✓ — what each channel would do ✓, and what it refuses ✓.

    Every change is **pinned** ✓: the plan carries the exact version it would move each
    channel to ✓, so an update is a specific act and not "whatever is newest" ✓ ✓.
    """
    rosters = rosters or {}
    channels: list[Channel] = []
    for version in versions:
        if version.channel not in CHANNELS:
            raise UpdateError(f"unknown channel: {version.channel!r}")
        channels.append(
            _channel_for(
                version.channel,
                version.current,
                version.offered,
                current_status=version.current_status,
                offered_status=version.offered_status,
                roster=rosters.get(f"{version.channel}:current", ()),
                offered_roster=rosters.get(f"{version.channel}:offered", ()),
            )
        )
    pinned = {
        item.channel: item.offered
        for item in channels
        if item.action == "update"
    }
    return UpdatePlan(channels=tuple(channels), pinned=pinned)


def _installed_file(base: pathlib.Path, *alternatives: tuple[str, ...]) -> pathlib.Path | None:
    """A file the installation has ✓ — the install's place ✓ or the dev tree's ✓ ✓.

    The same rule the app's own data follows ✓ ✓ (ADR-0084 ✓ ✓) — the install's
    place first ✓ ✓, because that is where the app runs ✓ ✓ — and **nothing**
    when neither has it ✓ ✓ (a missing file is a gap ✓, never a zero ✓ ✓).
    """
    for relative in alternatives:
        candidate = base.joinpath(*relative)
        if candidate.is_file():
            return candidate
    return None


def _installed_folder(base: pathlib.Path, *alternatives: tuple[str, ...]) -> pathlib.Path | None:
    """A folder the installation has ✓ — the install's place ✓ or the dev tree's ✓ ✓."""
    for relative in alternatives:
        candidate = base.joinpath(*relative)
        if candidate.is_dir():
            return candidate
    return None


def check_updates(
    root: str | pathlib.Path,
    *,
    offered: dict[str, dict[str, Any]] | None = None,
) -> UpdatePlan:
    """What this installation has ✓, against what is offered ✓.

    The installed side is read from the repo's own artefacts ✓ — the app's version ✓, the
    model registry ✓, the rule packs ✓ and the rate cards ✓ — and the offered side is
    given ✓ (the update service's job ✓) ✓ ✓.
    """
    base = pathlib.Path(root)
    installed: dict[str, dict[str, Any]] = {}

    # the app ✓ — the install records the version it installed ✓ ✓, and the dev
    # tree keeps the shell's own file ✓ ✓
    recorded = _installed_file(base, ("version.json",))
    if recorded is not None:
        document = json.loads(recorded.read_text(encoding="utf-8"))
        installed["app"] = {"version": str(document.get("app") or "0.0.0")}
    else:
        tauri = _installed_file(base, ("app", "src-tauri", "tauri.conf.json"))
        if tauri is not None:
            installed["app"] = {"version": json.loads(tauri.read_text(encoding="utf-8"))["version"]}

    # the models ✓ — the registry beside the GGUFs ✓ ✓, or the repo's ✓ ✓
    registry_path = _installed_file(
        base, ("models", "registry.json"), ("spec", "models", "registry.json")
    )
    if registry_path is not None:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
        installed["models"] = {
            "version": str(registry.get("schemaVersion") or "0.0.0"),
            "roster": tuple(
                str(entry.get("role")) for entry in registry.get("models") or []
            ),
        }

    # the rules ✓ — the install's packs ✓ ✓, or the repo's ✓ ✓
    pack_path = _installed_file(
        base, ("packs", "rajuk-2008.yaml"), ("spec", "rules", "rajuk-2008.yaml")
    )
    if pack_path is not None:
        import yaml

        pack = yaml.safe_load(pack_path.read_text(encoding="utf-8"))
        installed["rules"] = {
            "version": str(pack.get("packVersion") or "0.0.0"),
            "status": str(pack.get("status") or ""),
        }

    # the prices ✓ — the install's cards ✓ ✓, or the repo's ✓ ✓
    folder = _installed_folder(
        base, ("runtime", "core", "prices", "cards"), ("data", "prices", "cards")
    )
    cards = sorted(folder.glob("*.json")) if folder is not None else []
    if cards:
        card = json.loads(cards[0].read_text(encoding="utf-8"))
        installed["prices"] = {
            "version": str(card.get("schemaVersion") or "0.0.0"),
            "status": str(card.get("status") or ""),
            "cardId": str(card.get("cardId") or ""),
        }

    offered = offered or {}
    versions: list[Version] = []
    rosters: dict[str, tuple[str, ...]] = {}
    for channel in CHANNELS:
        have = installed.get(channel)
        want = offered.get(channel)
        if have is None or want is None:
            continue
        versions.append(
            Version(
                channel=channel,
                current=str(have.get("version") or "0.0.0"),
                offered=str(want.get("version") or "0.0.0"),
                current_status=have.get("status"),
                offered_status=want.get("status"),
            )
        )
        if have.get("roster"):
            rosters[f"{channel}:current"] = tuple(have["roster"])
        if want.get("roster"):
            rosters[f"{channel}:offered"] = tuple(want["roster"])
    return plan_update(versions, rosters=rosters)


def update_document(plan: UpdatePlan) -> dict[str, Any]:
    """The plan as a document ✓ (what the app shows before anything changes ✓) ✓."""
    return {
        "schemaVersion": "0.1.0",
        **plan.as_dict(),
    }
