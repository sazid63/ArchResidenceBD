"""The clash and coordination checks (W3.2): the design's members against each other, and the
MEP's points against the structure.

The plan's §5.7 puts *"coordination/clash checks"* in the MEP's scope, and §6 lists a
**clash/coordination report** as a deliverable. W2.9 made it possible: the phases are separate
documents in one datum, and the master links them — so every phase's members are known in the
same coordinate system, and they can be checked against each other.

Two laws shape this module:

- **The check is on the design, and it is deterministic.** The members come from the same
  design objects the engine builds from ✓, so a clash is a fact about the design ✓ — not a
  guess and not a rendering artefact ✓. No engine is needed ✓.
- **A clash is reported with its reason, and the known ones are named as known.** The v0
  slabs carry **no openings** ✓ and the MEP's layouts are **an even grid** ✓ (W3.1's declared
  limitations ✓), so some clashes are *declared* — they are the consequence of a named gap, and
  the report says which ✓ ✓. A report that hid them would be a false report ✓.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .commons import CommonServicesDesign
from .floor import FloorDesign
from .foundation import FoundationDesign
from .mep import MepDesign, MepPoint

#: A clash that is a consequence of a named v0 limitation (the slabs carry no openings).
SEVERITY_DECLARED = "declared"
#: A clash that is open: nothing declares it, and it needs a decision.
SEVERITY_OPEN = "open"

#: The members whose clash is a consequence of the v0 slabs carrying no openings.
NO_OPENING_KINDS = frozenset({"slab"})

#: The causes, in the order the report tells them. The v0 model is simple, and the report
#: says which simplicity caused the clash - a clash without a reason is a complaint, and
#: sixty of the same reason is one reason, not sixty.
CAUSES: dict[str, tuple[str, str]] = {
    "no-openings": (
        SEVERITY_DECLARED,
        "the v0 slabs carry no openings, so nothing can pass through a slab",
    ),
    "members-at-floor-level": (
        SEVERITY_DECLARED,
        "the v0 model builds the beams, the grade beams and the footings at the floor's level, "
        "so a point near the floor is inside them",
    ),
    "the-grid-is-a-line": (
        SEVERITY_OPEN,
        "the v0 structure is a single line of footings along the frontage (W2.2's rule), so "
        "the floor is a strip and the MEP's points sit on the columns that stand on it",
    ),
    "the-layout-is-an-even-grid": (
        SEVERITY_OPEN,
        "the MEP's layout is an even grid over the floor (W3.1), so a point can land on a "
        "member; the layout is not coordinated with the structure",
    ),
    "the-lift-shaft-stands-where-a-column-is": (
        SEVERITY_OPEN,
        "the lift shaft stands beside the grid's last column and swallows it (W2.12's "
        "placement); nothing declares it",
    ),
}

#: Which cause a point inside a member is, per kind of member.
POINT_CLASH_CAUSES: dict[str, str] = {
    "slab": "no-openings",
    "beam": "members-at-floor-level",
    "gradeBeam": "members-at-floor-level",
    "footing": "members-at-floor-level",
    "column": "the-grid-is-a-line",
    "liftShaft": "the-lift-shaft-stands-where-a-column-is",
    "liftCar": "the-lift-shaft-stands-where-a-column-is",
    "landing": "the-layout-is-an-even-grid",
}


@dataclass(frozen=True)
class Member:
    """One member of the building, as an axis-aligned box in the shared datum."""

    id: str
    kind: str
    phase: str
    x_mm: float
    y_mm: float
    z_mm: float
    size_x_mm: float
    size_y_mm: float
    size_z_mm: float
    note: str = ""

    @property
    def max_x(self) -> float:
        return self.x_mm + self.size_x_mm

    @property
    def max_y(self) -> float:
        return self.y_mm + self.size_y_mm

    @property
    def max_z(self) -> float:
        return self.z_mm + self.size_z_mm

    def holds(self, x: float, y: float, z: float, tolerance_mm: float = 0.0) -> bool:
        """Whether a point sits inside this member's box (the boundary counts)."""
        return (
            self.x_mm - tolerance_mm <= x <= self.max_x + tolerance_mm
            and self.y_mm - tolerance_mm <= y <= self.max_y + tolerance_mm
            and self.z_mm - tolerance_mm <= z <= self.max_z + tolerance_mm
        )

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "phase": self.phase,
            "xMm": round(self.x_mm, 3),
            "yMm": round(self.y_mm, 3),
            "zMm": round(self.z_mm, 3),
            "sizeXMm": round(self.size_x_mm, 3),
            "sizeYMm": round(self.size_y_mm, 3),
            "sizeZMm": round(self.size_z_mm, 3),
            "note": self.note,
        }


@dataclass(frozen=True)
class Clash:
    """One clash: two things that cannot both be there, and why."""

    id: str
    kind: str
    severity: str
    a: str
    b: str
    detail: str
    note: str = ""
    cause: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "severity": self.severity,
            "a": self.a,
            "b": self.b,
            "detail": self.detail,
            "note": self.note,
            "cause": self.cause,
        }


@dataclass(frozen=True)
class ClashReport:
    """The result of the checks: the members and points that were looked at, and the clashes."""

    members: tuple[Member, ...] = ()
    points: tuple[MepPoint, ...] = ()
    clashes: tuple[Clash, ...] = ()
    declared_absent: tuple[str, ...] = ()
    values: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        by_severity: dict[str, int] = {}
        by_cause: dict[str, int] = {}
        for clash in self.clashes:
            by_severity[clash.severity] = by_severity.get(clash.severity, 0) + 1
            by_cause[clash.cause] = by_cause.get(clash.cause, 0) + 1
        return {
            "schemaVersion": "0.1.0",
            "summary": {
                "members": len(self.members),
                "points": len(self.points),
                "clashes": len(self.clashes),
                "bySeverity": dict(sorted(by_severity.items())),
                "byCause": dict(sorted(by_cause.items(), key=lambda item: -item[1])),
            },
            "members": [member.as_dict() for member in self.members],
            "clashes": [clash.as_dict() for clash in self.clashes],
            "declaredAbsent": list(self.declared_absent),
            "values": dict(sorted(self.values.items())),
        }


def members_from_foundation(foundation: FoundationDesign) -> tuple[Member, ...]:
    """The foundation's members: the footings and the grade beams."""
    members: list[Member] = []
    for footing in foundation.footings:
        members.append(
            Member(
                id=f"footing-{footing.id}",
                kind="footing",
                phase="foundation",
                x_mm=footing.x_mm - footing.size_x_mm / 2.0,
                y_mm=footing.y_mm - footing.size_y_mm / 2.0,
                z_mm=0.0,
                size_x_mm=footing.size_x_mm,
                size_y_mm=footing.size_y_mm,
                size_z_mm=footing.depth_mm,
            )
        )
    for beam in foundation.grade_beams:
        members.append(
            Member(
                id=f"gradeBeam-{beam.id}",
                kind="gradeBeam",
                phase="foundation",
                x_mm=beam.x_mm,
                y_mm=beam.y_mm - beam.width_mm / 2.0,
                z_mm=0.0,
                size_x_mm=beam.length_mm,
                size_y_mm=beam.width_mm,
                size_z_mm=beam.depth_mm,
            )
        )
    return tuple(members)


def members_from_floor(floor: FloorDesign) -> tuple[Member, ...]:
    """A floor's members: the columns, the beams and the slab."""
    phase = f"floor-{floor.storey_index}"
    base = floor.base_z_mm
    members: list[Member] = []
    for column in floor.columns:
        members.append(
            Member(
                id=f"column-{phase}-{column.id}",
                kind="column",
                phase=phase,
                x_mm=column.x_mm - column.size_mm / 2.0,
                y_mm=column.y_mm - column.size_mm / 2.0,
                z_mm=base,
                size_x_mm=column.size_mm,
                size_y_mm=column.size_mm,
                size_z_mm=column.height_mm,
            )
        )
    for beam in floor.beams:
        members.append(
            Member(
                id=f"beam-{phase}-{beam.id}",
                kind="beam",
                phase=phase,
                # the beams run along the x axis, centred on their span
                x_mm=beam.x_mm - beam.length_mm / 2.0,
                y_mm=beam.y_mm - beam.width_mm / 2.0,
                z_mm=base,
                size_x_mm=beam.length_mm,
                size_y_mm=beam.width_mm,
                size_z_mm=beam.depth_mm,
            )
        )
    slab = floor.slab
    members.append(
        Member(
            id=f"slab-{phase}",
            kind="slab",
            phase=phase,
            x_mm=slab.origin_x_mm,
            y_mm=slab.origin_y_mm,
            z_mm=base,
            size_x_mm=slab.size_x_mm,
            size_y_mm=slab.size_y_mm,
            size_z_mm=slab.thickness_mm,
        )
    )
    return tuple(members)


def members_from_commons(commons: CommonServicesDesign) -> tuple[Member, ...]:
    """The common services' members: the landing, the lift shaft and the lift car.

    The **stair flight is not here** ✓: it is a sloped slab, so its box is not the member's
    shape ✓, and a box that is not the member's shape invents clashes ✓. It is declared
    absent from the checks ✓ ✓.
    """
    phase = f"services-{commons.storey_index}"
    members: list[Member] = []
    for landing in commons.landings:
        members.append(
            Member(
                id=f"landing-{phase}-{landing.id}",
                kind="landing",
                phase=phase,
                x_mm=landing.x_mm - landing.depth_mm / 2.0,
                y_mm=landing.y_mm - landing.width_mm / 2.0,
                z_mm=landing.z_mm,
                size_x_mm=landing.depth_mm,
                size_y_mm=landing.width_mm,
                size_z_mm=landing.thickness_mm,
            )
        )
    for lift in commons.lifts:
        members.append(
            Member(
                id=f"liftShaft-{phase}-{lift.id}",
                kind="liftShaft",
                phase=phase,
                x_mm=lift.x_mm - lift.shaft_mm / 2.0,
                y_mm=lift.y_mm - lift.shaft_mm / 2.0,
                z_mm=lift.base_z_mm,
                size_x_mm=lift.shaft_mm,
                size_y_mm=lift.shaft_mm,
                size_z_mm=lift.height_mm,
            )
        )
        members.append(
            Member(
                id=f"liftCar-{phase}-{lift.id}",
                kind="liftCar",
                phase=phase,
                x_mm=lift.x_mm - lift.car_mm / 2.0,
                y_mm=lift.y_mm - lift.car_mm / 2.0,
                z_mm=lift.base_z_mm,
                size_x_mm=lift.car_mm,
                size_y_mm=lift.car_mm,
                size_z_mm=lift.height_mm,
            )
        )
    return tuple(members)


def find_clashes(
    members: tuple[Member, ...],
    points: tuple[MepPoint, ...],
    *,
    tolerance_mm: float = 0.0,
) -> tuple[Clash, ...]:
    """The clashes: the MEP's points inside a member, and the phases' members overlapping.

    Two limits are deliberate ✓:

    - **Only members from different phases are compared with each other** ✓. Inside one phase
      the members *join* — a beam lands on a column ✓ — and a box overlap at a junction is not
      a clash ✓ ✓.
    - **The points are checked against every member** ✓, because a point inside a column is a
      clash whoever owns the column ✓ ✓.
    - **The services are checked against the structure** ✓, because that is where the openings
      are missing ✓ — a landing that lands on a slab, a shaft that stands where a slab has no
      hole ✓ ✓. The structure's own members are not compared with each other ✓: a column
      stands on its footing ✓, a beam lands on a column ✓, and a slab sits on the beams ✓ —
      those are connections ✓, and the v0 design does not model a connection ✓, so an overlap
      there would be an artefact of the boxes and not a fact about the building ✓ ✓.
    """
    clashes: list[Clash] = []
    number = 0

    for point in points:
        for member in members:
            if not member.holds(point.x_mm, point.y_mm, point.z_mm, tolerance_mm):
                continue
            number += 1
            cause = POINT_CLASH_CAUSES.get(member.kind, "the-layout-is-an-even-grid")
            severity, note = CAUSES[cause]
            clashes.append(
                Clash(
                    id=f"clash-{number:03d}",
                    kind="point-in-member",
                    severity=severity,
                    a=f"{point.system}:{point.id}",
                    b=member.id,
                    detail=(
                        f"the {point.system} point {point.id} sits inside the "
                        f"{member.kind} {member.id}"
                    ),
                    note=note,
                    cause=cause,
                )
            )

    for index, first in enumerate(members):
        for second in members[index + 1 :]:
            if first.phase == second.phase:
                continue  # the same phase's members join, they do not clash
            # The structure's own members are not compared with each other: a column stands on
            # its footing, a beam lands on a column and a slab sits on the beams - those are
            # connections, and the v0 design does not model a connection, so an overlap there
            # would be an artefact of the boxes and not a fact about the building.
            if not _is_services(first.phase) and not _is_services(second.phase):
                continue
            overlap = _overlap(first, second, tolerance_mm)
            if overlap is None:
                continue
            number += 1
            if first.kind in NO_OPENING_KINDS or second.kind in NO_OPENING_KINDS:
                cause = "no-openings"
            elif "liftShaft" in (first.kind, second.kind) or "liftCar" in (first.kind, second.kind):
                cause = "the-lift-shaft-stands-where-a-column-is"
            else:
                cause = "the-layout-is-an-even-grid"
            severity, note = CAUSES[cause]
            clashes.append(
                Clash(
                    id=f"clash-{number:03d}",
                    kind="member-over-member",
                    severity=severity,
                    a=first.id,
                    b=second.id,
                    detail=(
                        f"the {first.kind} {first.id} ({first.phase}) and the {second.kind} "
                        f"{second.id} ({second.phase}) overlap by "
                        f"{overlap[0]:g} x {overlap[1]:g} x {overlap[2]:g} mm"
                    ),
                    note=note,
                    cause=cause,
                )
            )
    return tuple(clashes)


def _is_services(phase: str) -> bool:
    """Whether a phase holds the common services."""
    return phase.startswith("services")


def _overlap(first: Member, second: Member, tolerance_mm: float) -> tuple[float, float, float] | None:
    """How much two boxes overlap, or None when they do not."""
    x = min(first.max_x, second.max_x) - max(first.x_mm, second.x_mm)
    y = min(first.max_y, second.max_y) - max(first.y_mm, second.y_mm)
    z = min(first.max_z, second.max_z) - max(first.z_mm, second.z_mm)
    if x <= tolerance_mm or y <= tolerance_mm or z <= tolerance_mm:
        return None
    return (round(x, 3), round(y, 3), round(z, 3))


def clash_report(
    members: tuple[Member, ...],
    points: tuple[MepPoint, ...],
    *,
    declared_absent: tuple[str, ...] = (),
) -> ClashReport:
    """The report: the clashes, and the members and points that were looked at."""
    clashes = find_clashes(members, points)
    by_severity: dict[str, int] = {}
    for clash in clashes:
        by_severity[clash.severity] = by_severity.get(clash.severity, 0) + 1
    return ClashReport(
        members=members,
        points=points,
        clashes=clashes,
        declared_absent=declared_absent,
        values={
            "clash.members": len(members),
            "clash.points": len(points),
            "clash.clashes": len(clashes),
            "clash.declared": by_severity.get(SEVERITY_DECLARED, 0),
            "clash.open": by_severity.get(SEVERITY_OPEN, 0),
        },
    )


def render_clash_markdown(report: ClashReport) -> str:
    """The clash/coordination report, as the engineer reads it."""
    lines: list[str] = []
    lines.append("# Clash and coordination report")
    lines.append("")
    lines.append("**Status:** candidate - the v0 design is not coordinated; every clash below is")
    lines.append("reported with its reason, and the ones that follow from a named v0 limitation")
    lines.append("are marked *declared* rather than hidden.")
    lines.append("")
    summary = report.as_dict()["summary"]
    lines.append(
        f"**Checked:** {summary['members']} members and {summary['points']} MEP points \u2014 "
        f"**{summary['clashes']} clash(es)**"
    )
    by_severity = summary["bySeverity"]
    if by_severity:
        lines.append(
            " (" + ", ".join(f"{count} {name}" for name, count in by_severity.items()) + ")"
        )
    lines.append("")
    by_cause = summary.get("byCause") or {}
    if by_cause:
        lines.append("## The causes")
        lines.append("")
        lines.append("| Cause | Clashes | Severity | What it is |")
        lines.append("|---|---|---|---|")
        for cause, count in by_cause.items():
            severity, note = CAUSES.get(cause, (SEVERITY_OPEN, ""))
            lines.append(f"| `{cause}` | {count} | **{severity}** | {note} |")
        lines.append("")
    if report.clashes:
        lines.append("## The clashes")
        lines.append("")
        lines.append("| Clash | Severity | Cause | Between | What it is |")
        lines.append("|---|---|---|---|---|")
        for clash in report.clashes:
            lines.append(
                f"| {clash.id} | **{clash.severity}** | `{clash.cause}` | "
                f"`{clash.a}` / `{clash.b}` | {clash.detail} |"
            )
        lines.append("")
    else:
        lines.append("**No clashes.** The members and the points do not occupy the same space.")
        lines.append("")
    if report.declared_absent:
        lines.append("## What the checks do not cover")
        lines.append("")
        for item in report.declared_absent:
            lines.append(f"- {item}")
        lines.append("")
    return "\n".join(lines) + "\n"


__all__ = [
    "CAUSES",
    "NO_OPENING_KINDS",
    "POINT_CLASH_CAUSES",
    "SEVERITY_DECLARED",
    "SEVERITY_OPEN",
    "Clash",
    "ClashReport",
    "Member",
    "clash_report",
    "find_clashes",
    "members_from_commons",
    "members_from_floor",
    "members_from_foundation",
    "render_clash_markdown",
]
