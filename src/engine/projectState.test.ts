import { describe, expect, it } from "vitest";
import { buildingForProject } from "../model/projectMesh";
import { generateRandomBuildingProject } from "./projectState";

describe("the random demo building", () => {
  it("always gets a plan that fits its plot, so the 3D model is never empty", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const p = generateRandomBuildingProject();
      seen.add(p.name);
      const b = buildingForProject(p);
      expect(p.planId, p.name).toBeTruthy();
      expect(b && b.ok, `${p.name}: ${b && !b.ok ? b.reasons.map((r) => r.message.en).join(" ") : "no building"}`).toBe(true);
    }
    expect(seen.size).toBeGreaterThanOrEqual(5); // every archetype was drawn at least in passing
  });
});
