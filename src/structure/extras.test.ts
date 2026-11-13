import { describe, expect, it } from "vitest";
import { designStairFlight } from "./stair";
import { deriveBuilding } from "../model/building";
import { slabOpeningAreaM2 } from "../model/openings";
import { analyzeStructure } from "./analyze";
import { buildBbs } from "./bbs";
import { PAD_TOP_BELOW_FINISH_MM, PLINTH_BEAM_DEPTH_MM, PLINTH_BEAM_WIDTH_MM } from "./foundation";

function build(planId: string, storeys: number) {
  const r = deriveBuilding({ plotWidthMm: 18000, plotDepthMm: 28000, storeys, planId });
  if (!r.ok) throw new Error("derive");
  const res = analyzeStructure(r.model);
  return { model: r.model, res, bbs: buildBbs(res, r.model) };
}

describe("members the first schedule left out: stairs, plinth beams, column stubs", () => {
  it("concrete is the sum of every member, recomputed independently (floor 3000: stair 1.611 m3 per storey by hand)", () => {
    const { model, res, bbs } = build("p2-2b-fb", 4);
    let want = 0;
    for (const lv of res.levels) {
      for (const p of lv.panels) want += ((p.x1 - p.x0) * (p.y1 - p.y0) * lv.slabThicknessMm) / 1e9;
      const geo = model.storeys[lv.index + 1 < model.storeys.length ? lv.index + 1 : 1].geometry;
      want -= (slabOpeningAreaM2(geo, model) * lv.slabThicknessMm) / 1000;
      for (const line of lv.beamLines) for (const sp of line.result.spans) want += (line.result.section.bMm * Math.max(line.result.section.hMm - lv.slabThicknessMm, 0) * sp.lengthMm) / 1e9;
    }
    for (const c of res.frame.columns) {
      for (const st of c.storeys) want += (st.section.bx * st.section.by * 3000) / 1e9;
      want += (c.storeys[0].section.bx * c.storeys[0].section.by * PAD_TOP_BELOW_FINISH_MM) / 1e9; // stub
    }
    for (const bm of model.storeys[1].geometry.beams) want += (PLINTH_BEAM_WIDTH_MM * PLINTH_BEAM_DEPTH_MM * bm.spanMm) / 1e9;
    for (const fo of res.foundation.footings) want += ((fo.x1 - fo.x0) * (fo.y1 - fo.y0) * fo.depthMm) / 1e9;
    // stairs: 18 risers of 166.7 mm, 9 per flight, tread 250: waist 150 x 2.5 m incline x 1 m + 9 steps of 0.5 x 0.1667 x 0.25 x 1 m, twice at 1.12 m wide, plus a 1.0 x 2.34 x 0.15 landing
    const stairPerStorey = 2 * 1.12 * (0.15 * 2.5 + 9 * 0.5 * (3 / 18) * 0.25) + 1.0 * 2.34 * 0.15; // flights 1.12 m wide, landing 2 x 1.12 + 0.10 m
    expect(stairPerStorey).toBeCloseTo(1.611, 3);
    want += stairPerStorey * model.storeys.length;
    // lift shaft: 150 mm walls from the 1.5 m pit to the machine-room roof less one 0.9 x 2.1 m door per storey, and the 250 mm pit slab
    const lr = model.roof.liftRoom!;
    const lw = lr.x1 - lr.x0;
    const ld = lr.y1 - lr.y0;
    const lh = 1500 + model.roof.levelMm + model.roof.coverHeightMm;
    want += (2 * (lw + ld) * lh * 200) / 1e9 - (model.storeys.length * 0.9 * 2.1 * 0.2) + ((lw + 200) * (ld + 200) * 250) / 1e9;
    expect(bbs.totals.concreteM3).toBeCloseTo(want, 6);
  });

  it("the bar schedule has stair bars for every storey and plinth beam bars and stirrups", () => {
    const { model, bbs } = build("p2-2b-fb", 4);
    const main = bbs.rows.find((r) => /Stair flights, main bars/.test(r.description.en))!;
    expect(main.members).toBe(model.storeys.length); // one set per storey
    // the main bars come from the flight design (stair.ts), not a fixed 12 mm at 150
    const design = designStairFlight(model.input.floorToFloorMm);
    expect(main.diaMm).toBe(design.main.dia);
    expect(main.description.en).toContain(`at ${design.main.spacingMm}`);
    expect(bbs.rows.some((r) => /Stair landing/.test(r.description.en))).toBe(true);
    const plinthBars = bbs.rows.find((r) => /Plinth beams, 4 bars/.test(r.description.en))!;
    expect(plinthBars.totalBars).toBe(4 * model.storeys[1].geometry.beams.length);
    const stirrups = bbs.rows.find((r) => /Plinth beams, stirrups/.test(r.description.en))!;
    expect(stirrups.diaMm).toBe(8);
    expect(stirrups.cutLengthMm).toBeGreaterThan(900);
    expect(stirrups.cutLengthMm).toBeLessThan(1100);
  });

  it("steel per m2 of floor rises with the new members, and every row still fits the stock length", () => {
    const { model, bbs } = build("p2-2b-fb", 6);
    expect(bbs.rows.every((r) => r.cutLengthMm <= 12000)).toBe(true);
    const gfa = model.footprintAreaM2 * model.storeys.length;
    expect(bbs.totals.weightKg / gfa).toBeGreaterThan(20); // kg per m2 of floor
  });
});
