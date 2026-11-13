import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure, SUPPORTED_MAX_STOREYS, structureSupported } from "./analyze";
import { assumptionsMarkdown } from "../drawings/permit";

const analyse = (storeys: number) => {
  const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys, planId: "p2-2b-fb" });
  if (!b.ok) throw new Error("fit");
  return analyzeStructure(b.model);
};

describe("C3 supported height", () => {
  it("the limit is 12 storeys and the flag follows it", () => {
    expect(SUPPORTED_MAX_STOREYS).toBe(12);
    expect(structureSupported(12)).toBe(true);
    expect(structureSupported(13)).toBe(false);
    expect(analyse(12).supported).toBe(true);
    expect(analyse(13).supported).toBe(false);
  });

  it("the permit package assumptions say NOT DESIGNED above the limit and not below it", () => {
    const card = { cardId: "c", status: "candidate", effectiveFrom: "2022-01-01", sourceName: "s" };
    expect(assumptionsMarkdown({ rateCard: card, structureOk: false, supported: false, storeys: 9 })).toMatch(/NOT DESIGNED: this building has 9 storeys/);
    expect(assumptionsMarkdown({ rateCard: card, structureOk: true, supported: true, storeys: 5 })).not.toMatch(/NOT DESIGNED/);
  });
});

describe("P2-2 dual system with the lift core", () => {
  it("8 storeys default to the dual system, pass, and the core is checked in both directions with its boundary elements detailed", () => {
    const r = analyse(8);
    expect(r.frame.options.systemId).toBe("dual-special-rc-walls");
    expect(r.ok).toBe(true);
    const c = r.frame.core!;
    expect(c).not.toBeNull();
    expect(c.wallShareX).toBeGreaterThan(0.25); // the wall takes a real share of the base shear
    expect(c.wallShareX).toBeLessThan(1);
    for (const k of [c.x, c.y]) {
      expect(k.shearUtil).toBeLessThanOrEqual(1);
      expect(k.flexureUtil).toBeLessThan(1);
      expect(k.rhoHorizontal).toBeGreaterThanOrEqual(0.0025);
    }
  });
  it("7 storeys keep the moment frame and have no core result", () => {
    const r = analyse(7);
    expect(r.frame.options.systemId).toBe("special-rc-mrf");
    expect(r.frame.core).toBeNull();
  });
});
