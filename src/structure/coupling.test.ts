import { describe, expect, it } from "vitest";
import { designCouplingBeam, type CoreSection } from "./core";

// Hand values: wall t = 150, door 900 x 2100, storey 3000 so the lintel is 900 deep: Acw = 135000 mm2, fc 20, fy 420.
const core: CoreSection = { lxMm: 2300, lyMm: 2400, tMm: 150, shafts: 1, heightMm: 30000, doorWidthMm: 900, cxMm: 0, cyMm: 0 };

describe("coupling beam over a lift door", () => {
  it("shear limit phi 0.83 sqrt(fc) Acw = 0.75 x 0.83 x 4.472 x 135000 / 1000 = 375.8 kN", () => {
    const c = designCouplingBeam(core, 3000, 100, 20)!;
    expect(c.hMm).toBe(900);
    expect(c.phiVnMaxKn).toBeCloseTo(375.83, 1);
  });

  it("a small shear (at most 0.33 sqrt(fc) Acw = 199 kN) needs no diagonal bars", () => {
    const c = designCouplingBeam(core, 3000, 150)!;
    expect(c.diagonal).toBe(false);
    expect(c.fits).toBe(true);
  });

  it("diagonal bars: Avd = Vu / (phi 2 fy sin a), a = atan(780 / 900); 300 kN needs 727 mm2 (sin a = 780 / 1191 = 0.6549)", () => {
    const c = designCouplingBeam(core, 3000, 300)!;
    expect(c.diagonal).toBe(true);
    expect(c.avdMm2).toBeCloseTo(727.1, 0);
    expect(c.barsPerGroup).toBeGreaterThanOrEqual(4);
    expect(c.barsPerGroup * (Math.PI * c.barDiaMm ** 2) / 4).toBeGreaterThanOrEqual(c.avdMm2);
    expect(c.fits).toBe(true);
    expect(c.limited).toBe(false);
  });

  it("a demand above the limit is capped at the limit and reported", () => {
    const c = designCouplingBeam(core, 3000, 900)!;
    expect(c.limited).toBe(true);
    expect(c.demandKn).toBe(900);
    expect(c.vuKn).toBeCloseTo(c.phiVnMaxKn, 9);
    expect(c.util).toBeCloseTo(1, 9);
  });

  it("the 8-storey core has a coupling beam designed and in the bar schedule", async () => {
    const { deriveBuilding } = await import("../model/building");
    const { analyzeStructure } = await import("./analyze");
    const { buildBbs } = await import("./bbs");
    const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys: 8, planId: "p2-2b-fb" });
    if (!b.ok) throw new Error("fit");
    const r = analyzeStructure(b.model);
    expect(r.frame.core!.coupling).not.toBeNull();
    expect(r.frame.core!.coupling!.fits).toBe(true);
    const rows = buildBbs(r, b.model).rows.filter((x) => x.family === "core").map((x) => x.description.en);
    expect(rows.some((d) => d.startsWith("Coupling beam over lift door, diagonal bars"))).toBe(true);
    expect(rows.some((d) => d.includes("boundary element ties"))).toBe(true);
  });
});
