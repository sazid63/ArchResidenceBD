import { describe, expect, it } from "vitest";
import { distribute, fitPlan, fitRange } from "./fit";
import { deriveGeometry } from "./geometry";
import { PLAN_LIBRARY, P1_4B, getPlan } from "./library";
import { availableUnitCounts, planChoices } from "../model/planChoices";
import { validateFitted } from "./validate";

describe("distribute", () => {
  const bays = [
    { min: 3000, pref: 3600, max: 3900 },
    { min: 1200, pref: 1200, max: 1500 },
  ];
  it("uses the preferred sizes at the preferred total", () => {
    expect(distribute(bays, 4800)?.sizes).toEqual([3600, 1200]);
  });
  it("adds up exactly and stays inside every range", () => {
    for (let target = 4200; target <= 5400; target += 37) {
      const r = distribute(bays, target)!;
      expect(r.total).toBe(Math.round(target / 10) * 10);
      r.sizes.forEach((s, i) => {
        expect(s).toBeGreaterThanOrEqual(bays[i].min);
        expect(s).toBeLessThanOrEqual(bays[i].max);
        expect(s % 10).toBe(0);
      });
    }
  });
  it("stops at the maximum and refuses below the minimum", () => {
    expect(distribute(bays, 9000)?.total).toBe(5400);
    expect(distribute(bays, 4199)).toBeNull();
  });
});

describe("fitPlan", () => {
  it("rejects a plot that is too small, saying what it needs", () => {
    const r = fitPlan(P1_4B, { widthMm: 9000, depthMm: 15000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.map((x) => x.code).sort()).toEqual(["too_narrow", "too_shallow"]);
      expect(r.reasons[0].requiredMm).toBe(fitRange(P1_4B).widthMm.min);
      expect(r.reasons[0].message.en).toMatch(/Needs at least 10\.03 m/);
    }
  });

  it("changes the building when the plot changes (no fixed preset)", () => {
    const a = fitPlan(P1_4B, { widthMm: 10200, depthMm: 16000 });
    const b = fitPlan(P1_4B, { widthMm: 12000, depthMm: 18000 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.fitted.widthMm).toBe(10200);
      expect(b.fitted.widthMm).toBe(12000);
      expect(a.fitted.xLines).not.toEqual(b.fitted.xLines);
    }
  });

  it("mirrors left-right without changing sizes", () => {
    const env = { widthMm: 11000, depthMm: 17000 };
    const a = fitPlan(P1_4B, env);
    const b = fitPlan(P1_4B, env, { mirror: true });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      const bed = (f: typeof a.fitted) => f.rooms.find((r) => r.def.id === "a-bed1")!.rects[0];
      expect(bed(a.fitted).x0).toBe(0);
      expect(bed(b.fitted).x1).toBe(b.fitted.widthMm);
      expect(bed(b.fitted).x1 - bed(b.fitted).x0).toBe(bed(a.fitted).x1 - bed(a.fitted).x0);
    }
  });
});

describe("plan library", () => {
  for (const plan of PLAN_LIBRARY) {
    const range = fitRange(plan);
    const widths = [range.widthMm.min, Math.round((range.widthMm.min + range.widthMm.max) / 2 / 10) * 10, range.widthMm.max];
    const depths = [range.depthMm.min, Math.round((range.depthMm.min + range.depthMm.max) / 2 / 10) * 10, range.depthMm.max];
    for (const mirror of [false, true])
      for (const w of widths)
        for (const d of depths)
          it(`${plan.id} passes the validator at ${w} × ${d} mm${mirror ? " (mirrored)" : ""}`, () => {
            const r = fitPlan(plan, { widthMm: w, depthMm: d }, { mirror });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            const { issues } = validateFitted(r.fitted);
            expect(issues.filter((i) => i.severity === "error").map((i) => i.message)).toEqual([]);
          });

    it(`${plan.id} puts a column at every structural crossing and every beam within limits`, () => {
      const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
      if (!r.ok) throw new Error("fit failed");
      const geo = deriveGeometry(r.fitted);
      expect(geo.columns.length).toBe(plan.structuralX.length * plan.structuralY.length);
      expect(Math.max(...geo.beams.map((b) => b.spanMm))).toBeLessThanOrEqual(6000);
    });
  }
});

describe("the three- and four-flat plans (M2-3)", () => {
  const ids = ["p3-2b", "p4-2b", "p4-1b"];

  it("are in the library, offer 3 and 4 flats per floor, and have the expected flats", () => {
    expect(PLAN_LIBRARY.length).toBe(14);
    expect(new Set(PLAN_LIBRARY.map((p) => p.id)).size).toBe(14);
    expect(availableUnitCounts()).toEqual([1, 2, 3, 4]);
    expect(getPlan("p3-2b")).toMatchObject({ unitsPerFloor: 3, bedroomsPerUnit: 2 });
    expect(getPlan("p4-2b")).toMatchObject({ unitsPerFloor: 4, bedroomsPerUnit: 2 });
    expect(getPlan("p4-1b")).toMatchObject({ unitsPerFloor: 4, bedroomsPerUnit: 1 });
  });

  for (const id of ids) {
    const plan = getPlan(id)!;
    const range = fitRange(plan);
    const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
    if (!r.ok) throw new Error(`${id} does not fit its preferred size`);
    const geo = deriveGeometry(r.fitted);

    it(`${id}: every bedroom, living room, kitchen and toilet has an outside wall (no light shaft is relied on)`, () => {
      r.fitted.rooms.forEach((room, i) => {
        if (["bedroom", "living", "kitchen", "toilet"].includes(room.def.kind)) expect(geo.metrics[i].exteriorMm, `${id} ${room.def.id}`).toBeGreaterThan(0);
      });
    });

    it(`${id}: every flat has exactly one entrance, and all of them open onto the one lobby`, () => {
      const mains = geo.doors.filter((d) => d.main);
      expect(mains.length).toBe(plan.unitsPerFloor);
      const lobby = r.fitted.rooms.findIndex((room) => room.def.id === "lobby");
      for (const d of mains) expect([d.a, d.b]).toContain(lobby);
    });

    it(`${id}: the structural grid has a column at every grid crossing and the columns line up with the walls`, () => {
      expect(geo.columns.length).toBe(plan.structuralX.length * plan.structuralY.length);
      expect(plan.structuralX).toEqual(Array.from({ length: plan.baysX.length + 1 }, (_, i) => i));
      expect(plan.structuralY).toEqual(Array.from({ length: plan.baysY.length + 1 }, (_, i) => i));
    });
  }

  it("p4-2b is symmetric: the four flats have the same rooms and areas", () => {
    const plan = getPlan("p4-2b")!;
    const range = fitRange(plan);
    const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
    if (!r.ok) throw new Error("fit");
    const geo = deriveGeometry(r.fitted);
    const area = (id: string) => geo.metrics[r.fitted.rooms.findIndex((room) => room.def.id === id)].netAreaM2;
    for (const k of ["bed1", "toilet", "bed2", "kitchen"]) {
      const a = area(`a-${k}`);
      for (const u of ["b", "c", "d"]) expect(area(`${u}-${k}`)).toBeCloseTo(a, 6);
    }
    // The front flats (A, B) open their inside dining into the living room; the back flats (C, D) have a dining lit by the duct.
    expect(area("b-living")).toBeCloseTo(area("a-living"), 6);
    expect(area("d-living")).toBeCloseTo(area("c-living"), 6);
    expect(area("d-dining")).toBeCloseTo(area("c-dining"), 6);
  });
});

describe("narrow-plot plans (Phase B1)", () => {
  const narrow = ["pn-2b", "pn-2b-f", "pn-3b", "pn-2f"];

  it("at least 3 plans fit a 3 katha, 10 x 20 m plot within the RAJUK ground coverage", () => {
    for (const storeys of [4, 6]) {
      const ok = planChoices(10, 20, { roadWidthM: 6, storeys }).filter((c) => c.fit.ok && c.coverage?.status === "pass");
      expect(ok.length, "plans that fit within coverage at " + storeys + " storeys").toBeGreaterThanOrEqual(3);
      for (const id of ["pn-2b", "pn-2b-f", "pn-3b"]) expect(ok.map((c) => c.plan.id)).toContain(id);
    }
  });

  it("a 2-flat plan fits a 4.3 katha plot (11 x 26 m) within coverage (stairs are 1120 mm wide since P2-4, which costs 100 mm of depth)", () => {
    const c = planChoices(11, 26, { roadWidthM: 6, storeys: 5, unitsPerFloor: 2 }).find((x) => x.plan.id === "pn-2f")!;
    expect(c.fit.ok).toBe(true);
    expect(c.coverage?.status).toBe("pass");
  });

  for (const id of narrow) {
    const plan = getPlan(id)!;
    const range = fitRange(plan);
    it(id + " is under 7.8 m wide and every habitable room, kitchen and toilet reaches daylight or a light well", () => {
      expect(range.widthMm.max).toBeLessThanOrEqual(7800);
      const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
      if (!r.ok) throw new Error("fit");
      const geo = deriveGeometry(r.fitted);
      r.fitted.rooms.forEach((room, i) => {
        if (["bedroom", "living", "kitchen", "toilet", "dining"].includes(room.def.kind))
          expect(geo.metrics[i].exteriorMm + geo.metrics[i].shaftMm, id + " " + room.def.id).toBeGreaterThan(0);
      });
    });

    it(id + " has a light well of at least 4 m² net (BNBC 2020 Part 3 Table 3.1.11, up to 5 storeys)", () => {
      const r = fitPlan(plan, { widthMm: fitRange(plan).widthMm.min, depthMm: fitRange(plan).depthMm.min });
      if (!r.ok) throw new Error("fit");
      const geo = deriveGeometry(r.fitted);
      const wells = r.fitted.rooms.map((room, i) => ({ room, i })).filter((x) => x.room.def.kind === "shaft");
      expect(wells.length).toBeGreaterThan(0);
      for (const w of wells) {
        expect(geo.metrics[w.i].netAreaM2).toBeGreaterThanOrEqual(4);
        expect(geo.metrics[w.i].netWidthMm).toBeGreaterThanOrEqual(1500);
      }
    });
  }
});
