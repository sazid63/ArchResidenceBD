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
  it("the limit is 7 storeys and the flag follows it", () => {
    expect(SUPPORTED_MAX_STOREYS).toBe(7);
    expect(structureSupported(7)).toBe(true);
    expect(structureSupported(8)).toBe(false);
    expect(analyse(7).supported).toBe(true);
    expect(analyse(8).supported).toBe(false);
  });

  it("the permit package assumptions say NOT DESIGNED above the limit and not below it", () => {
    const card = { cardId: "c", status: "candidate", effectiveFrom: "2022-01-01", sourceName: "s" };
    expect(assumptionsMarkdown({ rateCard: card, structureOk: false, supported: false, storeys: 9 })).toMatch(/NOT DESIGNED: this building has 9 storeys/);
    expect(assumptionsMarkdown({ rateCard: card, structureOk: true, supported: true, storeys: 5 })).not.toMatch(/NOT DESIGNED/);
  });
});
