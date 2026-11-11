# What ArchResidenceBD does and does not do

**It does** (all from fixed rules and formulas, no AI, offline):

- Fits original floor plans to your plot after the RAJUK 2008 setbacks and checks FAR, ground coverage, parking stalls (Schedule 4, section 56) and the adjoining road width.
- Checks the plan against BNBC 2020 room sizes, daylight (Table 3.1.12), travel distance, corridor and stair width, stair capacity and lift requirement, each with its citation.
- Screens the structure to BNBC 2020 Part 6 for buildings up to 7 storeys: slabs, beams, columns, footings, seismic drift, balconies with edge-beam torsion, and a lift shaft.
- Produces the bar bending schedule, concrete and formwork quantities, a bill of quantities priced from a dated rate card, a pour sequence, and schematic drawings (PDF, DXF, SVG) with a permit package.

**It does not:**

- Replace a licensed architect or structural engineer. The package says "screening, not for construction"; RAJUK needs drawings and calculations signed by licensed professionals.
- Design buildings above 7 storeys (needs core shear walls, not modelled), wind, dynamic analysis, raft or combined footing bending and punching, or basements.
- Give a complete cost: the BOQ total is a lower bound (no labour for concrete, brickwork and plaster, no tiles, paint, doors, windows or services) until the rate card is completed.
- Check what the rule packs do not hold: DAP land use, accessibility, second exits above six storeys, ramps and gates. Those rows say **Not checked**.

Every figure that rests on an assumption (not a cited rule) says so on its screen and in `assumptions.md` of the permit package.
