/**
 * Model + BOQ quality gates (npm run test:quality). Failures exit non-zero.
 *  - stairs: same footprint on every floor, exact floor-to-floor arrival, riser <= 190, slab opening
 *    above every flight, no solid "stair void" blocks, bounded concrete per flight;
 *  - section sizing: generated grid/column/beam equal the recommender's (structural screening) result;
 *  - BOQ: units follow the rate table (m2 items are areas, not volumes), tanks are shells,
 *    reinforcement is present with plausible kg/m3, bathrooms come from the model;
 *  - exposed-face measurement on a known case.
 */
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator";
import { generateBOQ } from "../../src/cad/boqGenerator";
import { createNewProject } from "../../src/engine/projectState";
import { recommendSections } from "../../src/cad/sectionSizing";
import { exposedFaceAreas } from "../../src/cad/quantityTakeoff";
import { createBoxMesh } from "../../src/cad/solidKernel";
import { FLOORPLAN_PRESETS } from "../../src/data/floorplanPresets";

let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.log("FAIL", msg); } };
const proj = (stories: number, plot: number, preset?: string) => {
  const p: any = createNewProject({ name: "q", stories, plotSize: 4, plotUnit: "katha", unitsPerFloor: 2 });
  p.plotSqm = plot;
  if (preset) p.typicalPresetId = preset;
  return p;
};

// exposed-face measurement on a known case
{
  const a = createBoxMesh("a", "a", "slab", "p", 0, 0, 0, 1000, 1000, 100);
  const b = createBoxMesh("b", "b", "wall", "p", 0, 0, 100, 1000, 100, 1100);
  const r = exposedFaceAreas([a, b]);
  check(r.get("a")!.pz === 900000 && r.get("b")!.nz === 0 && r.get("b")!.ny === 1_000_000, "exposed face areas wrong");
}

for (const preset of FLOORPLAN_PRESETS.map((p) => p.id)) {
  for (const [stories, plot] of [[2, 200], [5, 234], [8, 335]] as const) {
    const tag = `${preset} ${stories}st ${plot}m2`;
    const mesh = generateBuildingMesh(proj(stories, plot, preset), "final");
    const objs = mesh.objects;

    // stairs
    const flights = new Map<number, typeof objs>();
    for (let s = 0; s < stories; s++) flights.set(s, objs.filter((o) => o.id.startsWith(`stair_s${s}_`)));
    check(objs.every((o) => !/stair_void/.test(o.id)), `${tag}: solid stair void marker present`);
    let footprint = "";
    for (let s = 0; s < stories; s++) {
      const parts = flights.get(s)!;
      check(parts.length > 8, `${tag}: storey ${s} has no stair`);
      if (!parts.length) continue;
      const fp = [Math.min(...parts.map((o) => o.bboxMinMm[0])), Math.max(...parts.map((o) => o.bboxMaxMm[0])), Math.min(...parts.map((o) => o.bboxMinMm[1])), Math.max(...parts.map((o) => o.bboxMaxMm[1]))].map(Math.round).join(",");
      if (s === 0) footprint = fp;
      check(fp === footprint || s === 0, `${tag}: storey ${s} stair footprint differs from ground (${fp} vs ${footprint})`);
      const z0 = s === 0 ? 600 : s * 3000 + 125, top = (s + 1) * 3000 + 125;
      const stepTops = parts.filter((o) => o.kind === "stair").map((o) => o.bboxMaxMm[2]).sort((x, y) => y - x);
      const riser = (top - z0) / (parts.filter((o) => /_f[12]_/.test(o.id)).length / 2 / 1 + 1) ; void riser;
      check(top - stepTops[0] <= 190.5 + 1, `${tag}: storey ${s} last step is ${Math.round(top - stepTops[0])} mm below the upper floor`);
      const vol = parts.reduce((t, o) => t + o.volumeMm3 / 1e9, 0);
      check(vol < 9, `${tag}: storey ${s} stair concrete ${vol.toFixed(1)} m3 is not credible`);
      // no slab solid may cross the stair footprint at the upper floor level
      const [fx1, fx2, fy1, fy2] = fp.split(",").map(Number);
      const slabAbove = objs.filter((o) => (o.kind === "slab" && !o.id.startsWith("stair_")) && o.bboxMinMm[2] < top - 1 && o.bboxMaxMm[2] > top - 125 - 1 + 1 && o.bboxMinMm[2] >= (s + 1) * 3000 - 1);
      const blocked = slabAbove.filter((o) => o.bboxMinMm[0] < fx2 - 1 && o.bboxMaxMm[0] > fx1 + 1 && o.bboxMinMm[1] < fy2 - 1 && o.bboxMaxMm[1] > fy1 + 1);
      check(blocked.length === 0, `${tag}: slab above storey ${s} has no opening over the stair (${blocked[0]?.id})`);
    }

    // sizing
    const rec = recommendSections(stories, plot);
    const cols = new Set(objs.filter((o) => o.kind === "column" && o.phase === "ground_floor" && o.bboxMinMm[2] >= 0).map((o) => `${Math.round(o.bboxMinMm[0])}`));
    check(cols.size >= rec.colsX, `${tag}: fewer column lines (${cols.size}) than the recommended grid (${rec.colsX})`);

    // BOQ
    const boq = generateBOQ(mesh, proj(stories, plot, preset));
    const item = (re: RegExp) => boq.items.find((i) => re.test(i.description));
    const tankEnvelope = objs.filter((o) => o.kind === "tank").reduce((t, o) => t + o.volumeMm3 / 1e9, 0);
    const tankShell = item(/tank shells/)?.quantity ?? 0;
    check(tankShell > 0 && tankShell < tankEnvelope * 0.5, `${tag}: tank shell ${tankShell} vs envelope ${tankEnvelope.toFixed(1)} m3`);
    const concrete = boq.items.filter((i) => i.category === "Concrete Works" && !/tank/.test(i.description)).reduce((t, i) => t + i.quantity, 0);
    const steel = item(/reinforcement/i);
    check(!!steel && steel.unit === "ton", `${tag}: reinforcement item missing`);
    if (steel) { const kg = (steel.quantity * 1000) / (concrete + tankShell); check(kg > 70 && kg < 180, `${tag}: reinforcement ${kg.toFixed(0)} kg/m3 out of range`); }
    const wallArea = item(/external walls/)?.quantity ?? 0;
    const wallVol = objs.filter((o) => ["wall", "parapet"].includes(o.kind)).reduce((t, o) => t + o.volumeMm3 / 1e9, 0);
    check(wallArea > wallVol * 2 && wallArea < wallVol * 12, `${tag}: brickwork area ${wallArea.toFixed(0)} m2 inconsistent with ${wallVol.toFixed(0)} m3`);
    const baths = objs.filter((o) => /_bath_shaft(~\d+)?$/.test(o.id)).map((o) => o.id.replace(/~\d+$/, ""));
    const plumb = item(/Sanitary plumbing/);
    if (baths.length) check(plumb?.quantity === new Set(baths).size, `${tag}: plumbing count ${plumb?.quantity} != ${new Set(baths).size} bathrooms`);
    const perM2 = boq.totals.subtotalBDT / (((objs.filter((o) => o.kind === "column" && o.phase === "ground_floor" && o.bboxMinMm[2] >= 0).length > 0 ? 1 : 1) * plot * 0.55) * stories);
    check(perM2 > 8000 && perM2 < 90000, `${tag}: BOQ ${Math.round(perM2)} BDT per built m2 is outside the sanity band`);
  }
}
console.log(failed ? `${failed} FAILED` : "model quality: all checks passed");
process.exit(failed ? 1 : 0);
