import { describe, expect, it } from "vitest";
import { checkCore, dualLateral, stairWallMm, wallProps, type CoreSection } from "./core";

const core: CoreSection = { lxMm: 2000, lyMm: 3000, tMm: 150, shafts: 1, heightMm: 30000, doorWidthMm: 900, cxMm: 0, cyMm: 0 };
const EC = 4700 * Math.sqrt(20);

describe("core wall section and dual-system lateral analysis", () => {
  it("hollow box inertia and the door opening in the web", () => {
    const p = wallProps(core, "x");
    // box 3000 (y) x 2000 (x): I about the axis across the load direction, load along x: flange 3000, web length 2000
    expect(p.igMm4).toBeCloseTo((3000 * 2000 ** 3 - 2700 * 1700 ** 3) / 12, -3);
    expect(p.acvMm2).toBeCloseTo((2 * 2000 - 900) * 150, 6);
    expect(wallProps(core, "y").acvMm2).toBeCloseTo(2 * 3000 * 150, 6); // the door sits in a flange for the y direction
  });

  it("with a very flexible frame the wall is a cantilever: tip drift from F L^3 / 3EI plus shear", () => {
    const n = 4, h = 3000;
    const w = wallProps(core, "x");
    const f = [10, 10, 10, 10];
    const r = dualLateral({ forcesKn: f, hMm: h, frameKnPerMm: Array(n).fill(1e-6), wall: w, ecMPa: EC });
    // base shear carried by the wall = total, moment = sum F z
    expect(r.wallShearKn[0]).toBeCloseTo(40, 3);
    expect(r.wallMomentKnM[0]).toBeCloseTo((10 * (3 + 6 + 9 + 12)), 2);
    // flexural drift of a cantilever under the same loads (point loads at levels), no shear term
    const ei = (EC * w.ieMm4) / 1000;
    let tip = 0;
    for (let i = 1; i <= n; i++) tip += (10 * (i * h) ** 2 * (3 * n * h - i * h)) / (6 * ei);
    const total = r.driftMm.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(tip * 0.98); // shear deformation only adds
    expect(total).toBeLessThan(tip * 1.25);
  });

  it("a stiff frame takes the load and leaves the wall little shear; shears add up", () => {
    const w = wallProps(core, "x");
    const r = dualLateral({ forcesKn: [10, 20, 30], hMm: 3000, frameKnPerMm: [1e5, 1e5, 1e5], wall: w, ecMPa: EC });
    for (let i = 0; i < 3; i++) expect(r.frameShearKn[i] + r.wallShearKn[i]).toBeCloseTo(r.storeyShearKn[i], 6);
    expect(Math.abs(r.wallShearKn[0])).toBeLessThan(0.1 * r.storeyShearKn[0]);
  });

  it("shear design: min 0.25 % steel for small shear, more steel for large, and the 0.83 sqrt(fc) crushing cap", () => {
    const small = checkCore(core, "x", 100, 1000, 30000);
    expect(small.rhoHorizontal).toBeCloseTo(0.0025, 6);
    expect(small.shearUtil).toBeLessThan(1);
    const p = wallProps(core, "x");
    // alpha_c = 0.17 (hw/lw = 15): Vc = 0.17 sqrt(20) Acv
    const vc = (0.17 * Math.sqrt(20) * p.acvMm2) / 1000;
    const big = checkCore(core, "x", (0.75 * vc) + 500, 1000, 30000);
    expect(big.rhoHorizontal).toBeGreaterThan(0.0025);
    expect(big.shearUtil).toBeLessThanOrEqual(1);
    const crush = checkCore(core, "x", 0.75 * ((0.83 * Math.sqrt(20) * p.acvMm2) / 1000) * 1.2, 1000, 30000);
    expect(crush.shearUtil).toBeGreaterThan(1);
  });

  it("flexure: boundary steel = Mu / (0.9 fy 0.8 lw) split over the two flanges", () => {
    const c = checkCore(core, "x", 100, 10000, 30000);
    expect(c.boundarySteelMm2).toBeCloseTo((10000e6 / (0.9 * 420 * 0.8 * 2000)) / 2, 3);
  });
});

describe("Eq 6.8.10 displacement route (fallback, ACI 318-14 form)", () => {
  it("c is the depth of the rectangular block in the flange wall: a = As fy / (0.85 fc fl), c = a / 0.85", async () => {
    const { neutralAxisDepthMm } = await import("./core");
    const core = { lxMm: 2400, lyMm: 2400, tMm: 200, shafts: 1, heightMm: 30000, doorWidthMm: 900, cxMm: 0, cyMm: 0 } as any;
    // 2000 mm2 at 420 MPa, fc 20, flange 2400: force 840 kN; block inside the flange wall (a < t)
    const c = neutralAxisDepthMm(core, 2000, 20, 420, 0, 2400);
    expect(c).toBeCloseTo(((2000 * 420) / (0.85 * 20 * 2400)) / 0.85, 6);
  });

  it("axial compression deepens the neutral axis", async () => {
    const { neutralAxisDepthMm } = await import("./core");
    const core = { lxMm: 2400, lyMm: 2400, tMm: 200, shafts: 1, heightMm: 30000, doorWidthMm: 900, cxMm: 0, cyMm: 0 } as any;
    expect(neutralAxisDepthMm(core, 2000, 20, 420, 2000, 2400)).toBeGreaterThan(neutralAxisDepthMm(core, 2000, 20, 420, 0, 2400));
  });

  it("limit lw / (600 * 1.5 * du/hw), with du/hw not below 0.007; triggers at c >= limit", async () => {
    const { boundaryDisplacement } = await import("./core");
    // du/hw = 0.001 is raised to 0.007: limit = 2400 / (600 * 1.5 * 0.007) = 381 mm
    const low = boundaryDisplacement(300, 2400, 30, 30000);
    expect(low.ratio).toBeCloseTo(0.007, 9);
    expect(low.limitMm).toBeCloseTo(2400 / (600 * 1.5 * 0.007), 6);
    expect(low.required).toBe(false);
    expect(boundaryDisplacement(400, 2400, 30, 30000).required).toBe(true);
  });
});

describe("stair shear walls (screening assumption)", () => {
  it("an extra wall adds its own inertia L^3 t / 12, its parallel-axis term A d^2, and shear area along the load only", () => {
    const base = wallProps(core, "x");
    const extra = { ...core, extraWalls: [{ dir: "x" as const, lengthMm: 4000, tMm: 200, leverMm: 3000 }] };
    const p = wallProps(extra, "x");
    const add = (200 * 4000 ** 3) / 12 + 200 * 4000 * 3000 ** 2;
    expect(p.igMm4).toBeCloseTo(base.igMm4 + add, -3);
    expect(p.acvMm2).toBeCloseTo(base.acvMm2 + 4000 * 200, 6);
    // a wall along x does not add shear area to the y direction, but its weight counts once for both directions
    expect(wallProps(extra, "y").acvMm2).toBeCloseTo(wallProps(core, "y").acvMm2, 6);
    expect(wallProps(extra, "y").agMm2).toBeCloseTo(base.agMm2 + 4000 * 200, 6);
  });

  it("the stair walls take the stair room's span along each direction, with the lever from the core centre", () => {
    const plan = (x0: number, y0: number, x1: number, y1: number) => ({ roof: { stairCover: { x0, y0, x1, y1 } } }) as never;
    const walls = stairWallMm(plan(4950, 8850, 10950, 11450), 1800, 10150);
    expect(walls.find((w) => w.dir === "x")).toMatchObject({ dir: "x", lengthMm: 6000, tMm: 200, leverMm: 7950 - 1800 });
    expect(walls.find((w) => w.dir === "y")).toMatchObject({ dir: "y", lengthMm: 2600, tMm: 200, leverMm: 10150 - 10150 });
    expect(stairWallMm({ roof: { stairCover: null } } as never, 0, 0)).toEqual([]);
  });
});
