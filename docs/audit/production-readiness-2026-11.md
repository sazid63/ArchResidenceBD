# ArchResidenceBD: engineering audit and production-readiness plan

Date: 2026-11-09. Branch `v3`, commit cd3e169 plus this report. Written as a review by a practising structural and architectural engineer. The
numbers come from `scripts/audits/engineering-scenarios.audit.ts` (38 plan fits across 12 plot, height and flat-count scenarios, run
through the same code the screens use) and from looking at the 3D model and plans in the app.

## 1. Verdict

The app is a good **screening and planning tool** and a poor **design tool**. Its calculations are traceable (BNBC clause numbers,
hand-worked tests, 858 tests, an independent audit) and honest about what is not checked. But five things stop it from being called
production-ready today:

1. The 3D model does not show the structure the app designed.
2. Isolated footings overlap each other, which cannot be built.
3. It serves almost no real Dhaka plots (none below about 4.4 katha).
4. Buildings above about 7 storeys fail or are checked only as bare frames; fire and egress are not checked at all.
5. Steel and cost quantities are 30 to 40 percent below normal practice, so the BOQ is dangerously optimistic.

None of these is a calculation bug in a single formula. They are gaps between engines that were built and verified separately and
never reconciled. That is good news: most of the plan below is integration and coverage, not new theory.

## 2. How the audit was done

- Built 38 buildings: plots 14x24 to 30x40 m, 1 to 14 storeys, 1 to 4 flats per floor, every library plan that fits each plot.
- For each: RAJUK results, structural sizes and failures, footing sizes, bar schedule, BOQ, and a sanity pass over the 3D mesh
  (counts, sizes, overlaps, levels).
- Probed the smallest plot each plan family accepts.
- Opened the 3D model screen and read the placeholder code in `src/model/toMesh.ts`.
- Checked the door rule, door swings, and the new plan drawings from earlier today.

Results are in `scripts/audits/audit-out/engineering-scenarios.json` (re-run with `npm run audit:structural`).

## 3. Findings

Severity: **P0** wrong or unsafe if relied on, **P1** blocks real use, **P2** quality.

### P0: things that mislead

**F1. The 3D model uses placeholder sections, not the designed ones.** `src/model/toMesh.ts` draws every column 300x300, every beam
250x450 and every footing 1500x1500x450. The structure engine sizes columns from 350x350 up to 750x500, beams 250x350 to 250x650 and
footings up to 5.65 m square. A 14-storey building is drawn with 300 mm columns. The 3D screen also offers "Resize columns 350mm" and
"Extend balconies 1.5 m" tweaks that change only these placeholders and re-check nothing; the plans have no balconies at all.
Consequence: the picture an owner or contractor sees contradicts the rebar, BOQ and drawings screens.

**F2. Isolated footings overlap.** Columns on the corridor lines are only 1.5 to 2.1 m apart, but their pads are 1.7 to 2.9 m square.
Overlapping pairs found: 3 (4-storey, 1 flat), 13 (6-storey, 2x3-bed left-right), 11 (6-storey, 3 flats), 24 (14-storey). At 14 storeys
pads reach 4.75 to 5.65 m, wider than the column spacing. The model never checks this, so the BOQ double-counts the overlapping
concrete and the bar schedule lists pads that cannot exist. Needs combined footings, strip footings or a raft, chosen by a rule.

**F3. Roof tank and other roof loads are missing from the structure.** The 3D model puts a 19 m3 tank on the roof (6.6x2.4x1.2 m, about
190 kN full) plus a stair cover and lift room. `src/structure` has no tank, stair, lift or parapet load. The roof is analysed as a flat
roof. Stair flights and landings are not loaded either (already listed under "not modelled").

**F4. Tall buildings have no lateral system.** The frame is moment-frame only. With Dhaka Z 0.20, site class SD and R 8:
- 6 storeys pass but with seismic ratios of 0.85 to 1.00 (almost no margin on several plans);
- 8 storeys fail on the left-right plans (ratio 1.19 to 1.22, ground columns at the 700 mm stock limit), and on both 4-flat plans;
- 10 and 12 storeys fail on most plans (drift ratio up to 1.42, up to 9 failing members);
- the one plan that fits an 18x28 m plot at 14 storeys (front-and-back, 2 bedrooms) passes, by growing columns to 750x500 and pads to 5.65 m.
Real buildings of 8 to 14 storeys use a core or shear walls. The lift and stair core is drawn but never made structural.

**F5. Fire and egress are not checked, and a single stair serves up to 14 storeys.** Every plan has one stair. BNBC treats buildings
above about 6 storeys or 23 m as high-rise with more than one protected exit, a fire lift, refuge area and fire fighting systems. The
report says "not checked", which is honest, but a 14-storey result with a green structure and no warning is easy to misread.

**F6. BOQ steel is about 30 to 40 percent light.** Measured 2.0 to 2.4 kg per sft (22 to 26 kg per m2) for 4 to 6 storeys, and 70 to
89 kg per m3 of concrete. Usual Dhaka figures for residential frames are roughly 3.0 to 3.5 kg per sft (32 to 38 kg per m2) and
100 to 130 kg per m3. Likely causes: no stair, lift core, tie beams or parapet steel; confinement stirrups at 10 mm at 100 mm are
simplified and Sec 8.3 is not transcribed; laps and wastage are excluded. The steel-per-m3 audit band (50 to 200) is too wide to catch
this. Total priced cost per sft is BDT 850 to 1,200, which is structure materials only and far below a real cost.

### P1: blocks real use

**F7. No plan fits a typical Dhaka plot.** The smallest accepted plot is 20.5x14.5 m (4.4 katha) for 1 flat per floor, 21x14 m
(4.4 katha) for 2 flats, 24x20 m (7.2 katha) for 4 flats, and 17.5x38.5 m (10.1 katha) for 3 flats, all within the coverage limit.
Tested: 3, 3.3, 3.6 and 2.9 katha plots fit 0 of 10 plans. Most residential plots in Dhaka are 3 to 5 katha with 5 to 8 m frontage.

**F8. Plans lack the parts a Dhaka flat is sold on.** No balconies or verandahs, no sunshades (chajja), no prayer or study room
option, and the entrance of several plans goes through the dining room. In `p1-4b` the dining room is interior with
no window; BNBC lighting and ventilation rules for habitable rooms are applied to bedrooms, living rooms and kitchens only (dining is
an assumption, "gap-dining").

**F9. Ground floor and parking are a single room.** Every non-core cell is one "parking" room. There are no stalls, aisles, ramp,
gate or clear height check, and the RAJUK parking requirement is "not checked". For a stilt-parking building this is half the
compliance story.

**F10. Lift is a box.** No pit, no overrun above the top stop, no machine room sizing, no shaft walls as structure, no capacity
selection from the number of flats served. One lift serves up to 4 flats on 10 floors.

**F11. Bar anchorage warnings on edge columns.** 4 to 30 warnings per building: a 16 or 20 mm bar needs a hook of 361 to 451 mm but
the edge column gives 260 to 360 mm. Shown as warnings only; the fix is bigger edge columns or smaller bars and it should be done
by the engine.

### P2: quality

- **F12.** Foundation depth, water table, soil type and piling are not inputs; bearing is a single 150 kPa default.
- **F13.** 3D doors are drawn closed (swing is only on plans and CAD drawings).
- **F14.** Windows are fixed at sill 900 mm and height 1200 mm everywhere; doors do not appear on elevations.
- **F15.** Column sizes switch between 350x500 and 500x350 across a building; should be rationalised (fewer sizes, one orientation).
- **F16.** Parameters such as setbacks and floor-to-floor height (3000 mm everywhere, including parking) have no input.
- **F17.** The installer script contains a hard-coded test password (`src-tauri/create-dev-cert.ps1`); installers are unsigned.
- **F18.** CI has never run on a clean machine since M2; no end-to-end browser test of the real flow.

### What is good

- RAJUK setbacks, FAR and ground coverage behave sensibly and fail loudly (FAR fails at 8+ storeys on small plots, coverage fails on
  four plans for 18x28 m).
- Footing design includes one-way and punching shear. Beam, slab and column checks have independent audit tests.
- Doors now open into the room they protect, and the swing is tested on every plan at its smallest and largest sizes.
- Everything is bilingual, offline and deterministic. Gaps are labelled "not checked", never invented.

## 4. Plan to reach production

Definition of production-ready for this product: **a screening tool that a Bangladeshi architect or engineer can use on a real plot of
3 to 10 katha up to 10 storeys, whose every number agrees across the plan, 3D, structure, BOQ and drawings, and whose limits are
stated on the screen.** It does not replace a signed design; RAJUK submissions still need a registered architect and engineer.

### Phase A: make the numbers agree (2 to 3 weeks)

| # | Work | Done when |
|---|---|---|
| A1 | Drive the 3D model from the structure result: real column, beam, slab and footing sizes per storey. Remove or rewire the "resize" tweaks so they re-run the structure | 3D bounding sizes equal the Structure screen for every member; test on 6 buildings |
| A2 | Footing overlap rule: detect, then merge into combined or strip footings, or a raft above a utilisation limit. Quantities use the merged shapes | zero overlapping pads on all 38 audit cases; BOQ concrete drops where pads merged |
| A3 | Add roof tank, stair, lift room and parapet loads; load the lift and stair cores | tank load appears on the roof beams; test hand-checked |
| A4 | Calibrate steel quantities: add stair, lift core, tie beams, laps, wastage, Sec 8.3 confinement; check against 3 hand-prepared reference buildings | 28 to 38 kg per m2 on 4 to 8 storeys; band in the audit narrowed to 90 to 150 kg per m3 |
| A5 | Edge-column anchorage handled by the engine (column grows or bar size drops), warnings only for true exceptions | no hook warnings on the 38 cases |
| A6 | Wire the scenario audit into CI with hard assertions: footings do not overlap, 3D equals structure, steel in band | `npm run audit:structural` fails on regressions |

### Phase B: fit real plots and real flats (3 to 5 weeks)

| # | Work | Done when |
|---|---|---|
| B1 | New narrow-plot plans: 1 flat per floor for 2.5 to 3.5 katha (about 6 to 8 m frontage), 2 flats for 4 to 5 katha, with a side light well. Original designs only | at least 3 plans fit a 3 katha, 10x20 m plot within coverage |
| B2 | Balconies and verandahs as a plan element (cantilever slab, railing, sunshade), included in structure, BOQ and 3D | every plan offers one; cantilever designed |
| B3 | Daylight and ventilation rule for every habitable room, including dining; fix or replace interior dining rooms | validator fails an interior dining without a shaft or opening |
| B4 | Ground floor layout: stalls (2.4x4.8 m), aisle width, ramp, gate, and the Schedule 4 parking count | parking result is pass or fail, not "not checked" |
| B5 | Lift sizing from flats served, pit and overrun, shaft as structure | lift appears in 3D with pit and overrun |
| B6 | Inputs: floor-to-floor height, soil bearing and water table, setbacks override with reason | each flows through to structure and compliance |

### Phase C: tall buildings and fire (3 to 4 weeks)

| # | Work | Done when |
|---|---|---|
| C1 | Shear wall or core option: lift and stair core as walls, sized by the lateral check | 8 to 12 storey cases pass or fail with a clear reason |
| C2 | Fire and egress for the building height: second stair above 6 storeys or 23 m, fire lift, refuge area, travel distance; BNBC Part 4 clauses cited | height above 6 storeys shows pass, fail or not checked per clause |
| C3 | Above the supported height the Structure screen says "not designed" instead of showing ratios | no green result above the supported limit |

### Phase D: verification (runs alongside A to C, 2 weeks of focused review)

| # | Work | Done when |
|---|---|---|
| D1 | Five reference buildings, hand-calculated by a licensed structural engineer; app results compared in a golden test with tolerances | all five within the stated tolerance |
| D2 | Cross-check two buildings against an independent analysis package (frame model) | column loads within 10 percent, drift within 15 percent |
| D3 | Review the `candidate` rule packs (`bnbc-2020*.yaml`, rate card) and mark `active` or fix | no `candidate` pack ships |
| D4 | Plan review by a practising architect: circulation, privacy, kitchen and toilet stacking, furniture fit | sign-off notes per plan |

### Phase E: release hardening (1 to 2 weeks)

| # | Work | Done when |
|---|---|---|
| E1 | CI on a clean runner: verify, audits, build, offline check, bundle budget; then the tagged release workflow | green CI on a pushed branch |
| E2 | End-to-end browser test: new project, plan, structure, BOQ, drawings, zip; English and Bangla | test runs in CI |
| E3 | Remove the hard-coded password, create a real signing certificate, sign the installers, run them on a clean Windows machine | signed installer installs and starts |
| E4 | On-screen scope and disclaimer on every output: screening only, not for construction; signed design still required | wording approved by the owner |
| E5 | Pilot: 10 real plots from the owner's practice, compare to the engineer's own design | list of differences, each fixed or explained |

### Order and dependencies

A1 to A3 first (they change numbers the rest depend on). B1 can start in parallel (design work, no code dependency). C1 needs A3.
D1 starts as soon as A1 to A5 are in. E waits for everything else. The 3D tweak chips are the first thing to remove or rewire.

## 5. Decisions I need from you

1. **Supported height for version 1.** Recommended: up to 7 storeys with frame only (what the engine can honestly support today), with
   8 to 12 as Phase C. Or commit to 12 now and do Phase C earlier.
2. **Narrow plots.** Recommended: Phase B1 before anything else in B, because it decides whether most Dhaka users can use the app.
3. **Who does Phase D.** The reference buildings and plan review need a licensed engineer or architect other than the author.
4. **Cost promise.** Recommended: say "structure materials only" on the BOQ until labour, finishes, services and joinery have rates.

## 6. Second audit pass (same day)

Method: dense sweeps (about 6,900 fits at every 130 mm of width and 170 mm of depth, mirrored and not), an adjacency review of every
plan, geometry and 3D checks on every plan, structure invariants (mirror, determinism, 1 to 10 storeys, bearing 50 to 600 kPa, site
classes, floor heights), compliance and input extremes, and BOQ against the 3D model. Findings continue the numbering above.

### What held up

- Every plan fits and validates at every sampled size in its range, mirrored and not, with no fit or validator failures and no
  dimensions off the 10 mm grid.
- Doors and windows never overlap each other or sit on a column. Stair flights rise exactly one floor. Lift and stair openings are cut
  in the slabs of the 3D model.
- Structure is deterministic, mirror-symmetric (identical steel and concrete), has no NaN or infinite values, and grows steadily with
  storeys (footing, steel and concrete never fall as floors are added). Footings shrink as bearing rises.
- Inputs: storeys outside 1 to 30 are rejected with a clear message.

### New findings

**P0**

- **F19. The ground floor has no entrance.** On all 10 plans the ground-floor geometry has zero doors to the outside. The floor is
  lift, lobby, stair and one "parking" room, so there is no car entrance, no pedestrian door and no gate, and the stair and lobby cannot
  be reached from outside. The 3D model shows windows on the ground floor as well, so the parking floor looks like a closed storey.
  A stilt parking floor should be open on the road side.
- **F20. Walls that sit on slabs carry no line load.** In `p1-4b`, `p1-3b` and `p2-2b-fb`, 22 to 33 m of interior wall per floor
  (runs up to 4.95 m) lie on grid lines with no beam. The beam design takes wall loads only for walls on beam lines
  (`beam.ts`, `wallShare`); the slab sees only a flat partition allowance. A 125 mm brick wall is about 6 to 7 kN per metre, a
  concentrated load a slab of 125 to 150 mm at 4 to 5 m spans does not take as a uniform allowance. The other 7 plans put every interior
  wall on a beam line, which avoids this but pays for it in extra beams.

**P1**

- **F21. Dining rooms are dark.** 8 of 10 plans have a dining room with no outside wall and no shaft (all but the two redrawn 3-bedroom
  plans). The rule pack leaves dining as an assumption, so nothing is flagged.
- **F22. Privacy and circulation.** 6 plans have a toilet door opening straight onto the dining room; 7 plans have the flat's entrance
  open into the dining room (the entrance should reach the living room or a foyer).
- **F23. Rooms are small for the flat type.** Living rooms are 10.4 to 12.2 m2 on 8 plans (11.0 m2 on most 2 to 4 flat plans);
  bedrooms in the 3 and 4 flat plans are 10.1 to 10.5 m2, and master bedrooms under 11 m2. These pass the cited 9.5 m2 minimum, which is
  the legal floor, not the market norm (living 14 to 18 m2, master 13 to 16 m2).
- **F24. FAR and coverage are not checked for roads under 6 m.** For road widths 0 to 5.99 m the report returns "not checked" for FAR
  and ground coverage. Many older Dhaka plots front lanes of 3 to 5 m, so the most common narrow-plot case gets no result.
- **F25. BOQ and 3D disagree on masonry.** BOQ wall volume is 14 to 21 percent above the volume of walls and partitions in the 3D model
  (ratios 1.16, 1.14, 1.21 on 3 buildings). One of the two is wrong or they use different assumptions.
- **F26. Slab panels cover the stair and lift.** Panel areas equal footprint times storeys exactly, so the structure, concrete and
  BOQ include slab over the stair and lift cells that the 3D model cuts out.

**P2**

- **F27.** An unsupported site class (e.g. "SF") crashes the analysis with "Cannot read properties of undefined" instead of a message.
- **F28.** A plot of 0, negative or non-numeric area makes plan choice throw "No RAJUK setback row for a plot of 0 sqm"; a plot of a
  billion metres per side is accepted. Both need input limits.
- **F29.** Footing depth is 700 mm at every bearing from 50 to 600 kPa on the 6-storey test building, while pad size ranges from
  6.35 m to 1.85 m. Probably correct (shear and flexure checks pass) but worth a hand check at both ends.

### Changes to the plan

Add to Phase A: **A7** a real ground floor (open or gated car entrance, pedestrian door, stall layout; links to B4); **A8** line loads
for walls on slabs, or secondary beams under them, decided per plan; **A9** reconcile BOQ masonry and slab concrete with the model
(deduct stair and lift openings, one source of wall volume); **A10** reject or message invalid input (site class, plot size).

Add to Phase B: **B7** plan quality bar: dining reaches daylight or a shaft, entrance opens into a foyer or living room, no toilet door
onto dining, living at least 14 m2 and master at least 12 m2 on plans for 4 katha and above, checked by the validator; **B8**
RAJUK FAR and coverage for roads under 6 m, or an explicit "enter the road width" gate.

Re-run: `npm run audit:structural` (the scenario script) and the checks listed here when each item closes.
