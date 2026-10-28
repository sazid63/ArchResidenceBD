# Clash and coordination report

**Status:** candidate - the v0 design is not coordinated; every clash below is
reported with its reason, and the ones that follow from a named v0 limitation
are marked *declared* rather than hidden.

**Checked:** 25 members and 26 MEP points — **48 clash(es)**
 (21 declared, 27 open)

## The causes

| Cause | Clashes | Severity | What it is |
|---|---|---|---|
| `the-grid-is-a-line` | 24 | **open** | the v0 structure is a single line of footings along the frontage (W2.2's rule), so the floor is a strip and the MEP's points sit on the columns that stand on it |
| `members-at-floor-level` | 18 | **declared** | the v0 model builds the beams, the grade beams and the footings at the floor's level, so a point near the floor is inside them |
| `no-openings` | 3 | **declared** | the v0 slabs carry no openings, so nothing can pass through a slab |
| `the-layout-is-an-even-grid` | 3 | **open** | the MEP's layout is an even grid over the floor (W3.1), so a point can land on a member; the layout is not coordinated with the structure |

## The clashes

| Clash | Severity | Cause | Between | What it is |
|---|---|---|---|---|
| clash-001 | **open** | `the-grid-is-a-line` | `electrical:light-1` / `column-floor-0-C1` | the electrical point light-1 sits inside the column column-floor-0-C1 |
| clash-002 | **declared** | `members-at-floor-level` | `electrical:outlet-1` / `footing-F1` | the electrical point outlet-1 sits inside the footing footing-F1 |
| clash-003 | **open** | `the-grid-is-a-line` | `electrical:outlet-1` / `column-floor-0-C1` | the electrical point outlet-1 sits inside the column column-floor-0-C1 |
| clash-004 | **declared** | `members-at-floor-level` | `electrical:outlet-1` / `beam-floor-0-B1` | the electrical point outlet-1 sits inside the beam beam-floor-0-B1 |
| clash-005 | **open** | `the-grid-is-a-line` | `electrical:fan-1` / `column-floor-0-C1` | the electrical point fan-1 sits inside the column column-floor-0-C1 |
| clash-006 | **declared** | `members-at-floor-level` | `drainage:stack-1` / `footing-F1` | the drainage point stack-1 sits inside the footing footing-F1 |
| clash-007 | **open** | `the-grid-is-a-line` | `drainage:stack-1` / `column-floor-0-C1` | the drainage point stack-1 sits inside the column column-floor-0-C1 |
| clash-008 | **declared** | `members-at-floor-level` | `drainage:stack-1` / `beam-floor-0-B1` | the drainage point stack-1 sits inside the beam beam-floor-0-B1 |
| clash-009 | **declared** | `no-openings` | `drainage:stack-1` / `slab-floor-0` | the drainage point stack-1 sits inside the slab slab-floor-0 |
| clash-010 | **open** | `the-grid-is-a-line` | `electrical:light-1` / `column-floor-1-C1` | the electrical point light-1 sits inside the column column-floor-1-C1 |
| clash-011 | **open** | `the-grid-is-a-line` | `electrical:light-2` / `column-floor-1-C4` | the electrical point light-2 sits inside the column column-floor-1-C4 |
| clash-012 | **open** | `the-grid-is-a-line` | `electrical:light-3` / `column-floor-1-C1` | the electrical point light-3 sits inside the column column-floor-1-C1 |
| clash-013 | **open** | `the-grid-is-a-line` | `electrical:light-4` / `column-floor-1-C4` | the electrical point light-4 sits inside the column column-floor-1-C4 |
| clash-014 | **open** | `the-grid-is-a-line` | `electrical:outlet-1` / `column-floor-1-C1` | the electrical point outlet-1 sits inside the column column-floor-1-C1 |
| clash-015 | **declared** | `members-at-floor-level` | `electrical:outlet-1` / `beam-floor-1-B1` | the electrical point outlet-1 sits inside the beam beam-floor-1-B1 |
| clash-016 | **declared** | `members-at-floor-level` | `electrical:outlet-2` / `beam-floor-1-B2` | the electrical point outlet-2 sits inside the beam beam-floor-1-B2 |
| clash-017 | **open** | `the-grid-is-a-line` | `electrical:outlet-3` / `column-floor-1-C4` | the electrical point outlet-3 sits inside the column column-floor-1-C4 |
| clash-018 | **declared** | `members-at-floor-level` | `electrical:outlet-3` / `beam-floor-1-B3` | the electrical point outlet-3 sits inside the beam beam-floor-1-B3 |
| clash-019 | **open** | `the-grid-is-a-line` | `electrical:outlet-4` / `column-floor-1-C1` | the electrical point outlet-4 sits inside the column column-floor-1-C1 |
| clash-020 | **declared** | `members-at-floor-level` | `electrical:outlet-4` / `beam-floor-1-B1` | the electrical point outlet-4 sits inside the beam beam-floor-1-B1 |
| clash-021 | **declared** | `members-at-floor-level` | `electrical:outlet-5` / `beam-floor-1-B2` | the electrical point outlet-5 sits inside the beam beam-floor-1-B2 |
| clash-022 | **open** | `the-grid-is-a-line` | `electrical:fan-1` / `column-floor-1-C1` | the electrical point fan-1 sits inside the column column-floor-1-C1 |
| clash-023 | **open** | `the-grid-is-a-line` | `water:basin-1` / `column-floor-1-C1` | the water point basin-1 sits inside the column column-floor-1-C1 |
| clash-024 | **declared** | `members-at-floor-level` | `water:basin-1` / `beam-floor-1-B1` | the water point basin-1 sits inside the beam beam-floor-1-B1 |
| clash-025 | **open** | `the-grid-is-a-line` | `water:basin-2` / `column-floor-1-C1` | the water point basin-2 sits inside the column column-floor-1-C1 |
| clash-026 | **declared** | `members-at-floor-level` | `water:basin-2` / `beam-floor-1-B1` | the water point basin-2 sits inside the beam beam-floor-1-B1 |
| clash-027 | **open** | `the-grid-is-a-line` | `water:wc-1` / `column-floor-1-C1` | the water point wc-1 sits inside the column column-floor-1-C1 |
| clash-028 | **declared** | `members-at-floor-level` | `water:wc-1` / `beam-floor-1-B1` | the water point wc-1 sits inside the beam beam-floor-1-B1 |
| clash-029 | **open** | `the-grid-is-a-line` | `water:wc-2` / `column-floor-1-C1` | the water point wc-2 sits inside the column column-floor-1-C1 |
| clash-030 | **declared** | `members-at-floor-level` | `water:wc-2` / `beam-floor-1-B1` | the water point wc-2 sits inside the beam beam-floor-1-B1 |
| clash-031 | **open** | `the-grid-is-a-line` | `water:shower-1` / `column-floor-1-C1` | the water point shower-1 sits inside the column column-floor-1-C1 |
| clash-032 | **declared** | `members-at-floor-level` | `water:shower-1` / `beam-floor-1-B1` | the water point shower-1 sits inside the beam beam-floor-1-B1 |
| clash-033 | **open** | `the-grid-is-a-line` | `water:shower-2` / `column-floor-1-C1` | the water point shower-2 sits inside the column column-floor-1-C1 |
| clash-034 | **declared** | `members-at-floor-level` | `water:shower-2` / `beam-floor-1-B1` | the water point shower-2 sits inside the beam beam-floor-1-B1 |
| clash-035 | **open** | `the-grid-is-a-line` | `water:kitchenSink-1` / `column-floor-1-C1` | the water point kitchenSink-1 sits inside the column column-floor-1-C1 |
| clash-036 | **declared** | `members-at-floor-level` | `water:kitchenSink-1` / `beam-floor-1-B1` | the water point kitchenSink-1 sits inside the beam beam-floor-1-B1 |
| clash-037 | **open** | `the-grid-is-a-line` | `water:kitchenSink-2` / `column-floor-1-C1` | the water point kitchenSink-2 sits inside the column column-floor-1-C1 |
| clash-038 | **declared** | `members-at-floor-level` | `water:kitchenSink-2` / `beam-floor-1-B1` | the water point kitchenSink-2 sits inside the beam beam-floor-1-B1 |
| clash-039 | **open** | `the-grid-is-a-line` | `drainage:stack-1` / `column-floor-0-C1` | the drainage point stack-1 sits inside the column column-floor-0-C1 |
| clash-040 | **open** | `the-layout-is-an-even-grid` | `drainage:stack-1` / `landing-services-0-1` | the drainage point stack-1 sits inside the landing landing-services-0-1 |
| clash-041 | **open** | `the-grid-is-a-line` | `drainage:stack-1` / `column-floor-1-C1` | the drainage point stack-1 sits inside the column column-floor-1-C1 |
| clash-042 | **declared** | `members-at-floor-level` | `drainage:stack-1` / `beam-floor-1-B1` | the drainage point stack-1 sits inside the beam beam-floor-1-B1 |
| clash-043 | **declared** | `no-openings` | `drainage:stack-1` / `slab-floor-1` | the drainage point stack-1 sits inside the slab slab-floor-1 |
| clash-044 | **open** | `the-grid-is-a-line` | `gas:cooker-1` / `column-floor-1-C4` | the gas point cooker-1 sits inside the column column-floor-1-C4 |
| clash-045 | **open** | `the-grid-is-a-line` | `gas:meter-1` / `column-floor-1-C4` | the gas point meter-1 sits inside the column column-floor-1-C4 |
| clash-046 | **open** | `the-layout-is-an-even-grid` | `landing-services-0-1` / `column-floor-1-C1` | the landing landing-services-0-1 (services-0) and the column column-floor-1-C1 (floor-1) overlap by 300 x 300 x 150 mm |
| clash-047 | **open** | `the-layout-is-an-even-grid` | `landing-services-0-1` / `beam-floor-1-B1` | the landing landing-services-0-1 (services-0) and the beam beam-floor-1-B1 (floor-1) overlap by 600 x 300 x 150 mm |
| clash-048 | **declared** | `no-openings` | `landing-services-0-1` / `slab-floor-1` | the landing landing-services-0-1 (services-0) and the slab slab-floor-1 (floor-1) overlap by 750 x 300 x 125 mm |

## What the checks do not cover

- the stair flight: it is a sloped slab, so its box is not the member's shape, and a box that is not the member's shape invents clashes
- the members of one phase against each other: inside a phase the members join (a beam lands on a column), and a box overlap at a junction is not a clash
- the MEP's own runs (the conduit, the water pipe and the gas pipe): the v0 runs are W2.12's assumed sizes, and the MEP sizes the branches that come off them
- the 3D routing between the MEP's points: the plan's §5.7 puts full 3D routing in v2

