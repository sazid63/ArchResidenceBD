# P2 exit review — 3D v0

**Phase:** P2 (3D v0) · **Closed:** 2026-10-21 · **Board:** `docs/work/P2.md` (13 of 13 packages
ticked) · **Plan of record:** `docs/plan/ArchResidenceBD-Plan-v1.5.md` §5–§6, §8, §9, §10,
Appendix C
**Predecessor:** `docs/work/P1-EXIT-REVIEW.md` (P1's packages are all closed; nothing here was
blocked by an open P1 package) · **Owner items:** `docs/work/OWNER-ATTENTION.md`

## What P2 delivered

| Package | What it is | The measured proof |
|---|---|---|
| **W2.1** engine + worker pool | two isolated FreeCAD workers, watchdog, restart, deadlines | 2 workers up in 1.05 s; the same job measured identically on both; a kill mid-job → `worker_restarted`, recovery ~1 s |
| **W2.2** foundation | the spec → footings + grade beams + a declared excavation prism | 4 footings (0.432 m³ each) + 3 grade beams; two runs byte-identical |
| **W2.3** floor | the storey on the foundation's grid: columns, beams, slab | 4 columns + 3 beams + 1 slab; the first floor at z 3,200 → 6,200 mm |
| **W2.4** rebar + BBS | the storey detailed, the schedule as data | 28 marks / 297 bars; schedule 279.0 kg vs measured 278.8 kg (−0.08 %) |
| **W2.5** drawing sheet | a sheet a human can read | SVG 14,466 B · DXF 19,843 B · PDF 455,726 B; byte-identical across runs; no engine name on the sheet |
| **W2.6** BOQ v0 | the takeoff priced from a card | 11 lines, **119,599.70 BDT**, 9 priced, 2 unpriced (the formwork) |
| **W2.7** price service | cards → region → the spec's pricing → the override register | the BOQ from the resolved card = **119,599.70 BDT** — the same as from the card; Chattogram ×1.06 published, Rajshahi 1.00 *assumed and labelled* |
| **W2.8** NativeCAD workspace | the app's real design surface: viewport, model tree, parametric panel | 15 objects, 180 triangles, 5.45175 m³; verified in a browser (the frame buffer holds the two phase colours) |
| **W2.9** federation | a shared datum, one file per phase, a master that links | 15 links, 15 objects, 5.45175 m³; the master (6,605 B) is smaller than the phases it links |
| **W2.10** walking skeleton | the whole chain, end to end | **15 objects, 5.45175 m³**, steel 279.0 vs 278.8 kg, a sheet, a priced BOQ |
| **W2.11** equivalence gate | incremental ≡ full rebuild | rebuilt `floor-1`, reused `foundation`, the meshes **byte-identical**; the design half in CI on every push |
| **W2.12** scale-out | two storeys, the stair, the lift, the service runs | **30 objects, 1,824 triangles**; every probe re-measured, no number moved |
| **W2.13** full-CAD tab | the engine's own window, branded | the title is **"NativeCAD"**, the theme and icon applied, 4 brand actions hidden out of 559, mode **embedded** |

**Suite at the close:** 937 tests · 199 Python files compile clean · brand guard clean · every
`--check` CLI fresh · the app typecheck clean · CI green on `fc02f7b`.

## The declared gaps (what P2 did **not** deliver)

These are recorded, not implied. None of them is a defect; each is a decision or a dependency
with a name and a place.

1. **The app is still a browser prototype.** The W0.2 prototype was the deliverable; the
   **desktop shell** (Tauri) and the one-installer build are **P5**. The full-CAD tab's
   **reparent** therefore has no host: the command, the environment, the handle, the branding
   state and the mode decision are delivered and tested; the frame that holds the window is not.
2. **The workspace reads committed artefacts, not a live stream.** The *seam* is the product's
   shape (the app fetches a URL), but the transport in v0 is the file the engine wrote. The
   desktop bridge (the IPC to the bundled engine) is P5's.
3. **The parametric panel is read-only.** The parameters, their provenance, the assumptions and
   the declared absences are all there; *editing* them needs the same bridge.
4. **The clash / coordination report** (plan §6) is not built; the federation makes it possible
   (the phases are separate files in one datum) but nothing checks the clashes yet.
5. **The MEP schedules** (circuits, loads, drainage slopes, the gas layout — plan §5.7) are
   P3's; v0 has the runs and the lift's fit check.
6. **The ground floor is not in the walking skeleton.** The skeleton's chain is the foundation
   and the first floor (the v0 walkthrough); the **scale-out** — two storeys plus the common
   services — is measured by its own probe (30 objects) and the skeleton's numbers did not move.
7. **No real price list exists.** The only card is the illustrative candidate ("never use for a
   BOQ"). The fetch path is implemented and consent-gated, but BBS, PWD and BWDB did not resolve
   from the build machine — an **owner item** (OWNER-ATTENTION #8). Nothing in the repo is a
   market price.
8. **Two of the plan's §9 CI guards have no package**: **spec fuzzing** and the **Bangla
   rendering regression** (the first Bangla PDF arrives with P3's reports). The third,
   incremental ≡ full rebuild, is **W2.11 — closed** ✓.
9. **Appendix A2's bench** (Bangla voice notes, "Mistri sheets", the progress tracker, site
   photos, the in-app engineer round-trip) is approved but unassigned.

## The traps P3 must not inherit

1. **119,599.70 BDT is not a price.** It is priced from a **candidate** card whose own note
   says "never use for a BOQ". A BOQ that carries that number without the candidate status
   beside it is a false document (plan §9).
2. **The mix, the productivity and the common services' dimensions are assumptions, not rules.**
   The pack has no mix rule, no productivity rule, no stair rule, no lift rule and no pipe rule.
   Every line that uses one says so; a document that drops the provenance drops the truth.
3. **Two BOQ lines are unpriced on purpose.** The formwork has no rate in the v0 card. A
   "complete" BOQ would invent one.
4. **Walls and openings are absent, not forgotten.** The v0 spec carries no wall or opening
   data, so none is built and the absence is declared. A wall nobody asked for is a fabricated
   fact.
5. **The two BOQ paths must stay equal.** The card and the resolved card price the same
   BOQ; if a future change makes them differ, the *service* moved a price — that is a defect,
   not a feature.
6. **The ground floor and the roof are not in the v0 model.** The documents P3 renders must
   say what the model does not contain, exactly as the workspace's tree does.
7. **The engine never names itself.** The full-CAD tab's title is "NativeCAD" and the brand
   actions are pruned; the licence notices live on the app's Licences screen and nowhere else
   (ADR-0004). P3's documents carry the same rule — no engine name in a generated document.
8. **An unverified price is a candidate.** A fetched list enters as `candidate` until a human
   marks it active (plan §9, the Source Registry's fetch law).

## The contract P3 builds on

- **The artefacts** — `data/cad/generated/` (the macros, the designs, the mesh, the federation's
  datum and master report, the common services, the boot report), `data/boq/`,
  `data/walking-skeleton/`, `data/prices/`.
- **The interfaces** — the frozen job protocol, the model registry, the rate card, the verdict
  set (W0.9) plus the generated BBS and BOQ schemas (W2.4, W2.6) and the Building Spec's
  pricing block (W2.7).
- **The laws** — the engine measures and the app writes (plan §2.5); every stage is checked
  against another stage, never against a stored number; a missing capability is a visible
  state; unverified content is a candidate; the ids come from stable spec ids, never from the
  build order (§8); no engine name in the product (§4, ADR-0004).
- **The probes** — `tools/cad/{foundation,floor,rebar,sheet,mesh,federation,commons,equivalence,boot}_probe.py`
  and `tools/boq/build_boq.py`, `tools/walking_skeleton/run.py`, `tools/pricing/price_service.py`:
  every one of them has a `--check` that runs in CI without an engine, and the live probes join
  the weekly `cad-execution` job.

## The next phase

**P3 — documents & money** (plan §10, weeks 18–24): the full drawing set (PDF + DXF), the BBS
in xlsx + PDF, the takeoff/BOQ with live prices, the compliance audit + the deviation register,
the engineer review pack, and the Bangla reports (HTML → print-PDF, for the glyphs). P3's
first job is the **Bangla rendering regression** the plan's §9 asks for — the first Bangla PDF
arrives there ✓ — and the **spec fuzzing** guard, which has no package yet ✓.
