import { describe, expect, it } from "vitest";
import { buildingForProject } from "../model/projectMesh";
import { generateRandomBuildingProject } from "./projectState";

describe("the random demo building", () => {
  it("always gets a plan that fits its plot, so the 3D model is never empty", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const p = generateRandomBuildingProject(() => (i + 0.5) / 6); // each of the six archetypes, no randomness
      seen.add(p.name);
      const b = buildingForProject(p);
      expect(p.planId, p.name).toBeTruthy();
      expect(b && b.ok, `${p.name}: ${b && !b.ok ? b.reasons.map((r) => r.message.en).join(" ") : "no building"}`).toBe(true);
    }
    expect(seen.size).toBe(6);
    expect(generateRandomBuildingProject(() => 0.1).name).toBe(generateRandomBuildingProject(() => 0.1).name);
  });
});

describe("the project a fresh install opens on", () => {
  it("has a real plot and a plan that fits and keeps within the ground-coverage limit, and nothing pre-answered", async () => {
    const { create4StoryBuildingProject } = await import("./projectState");
    const { check } = await import("../rules/check");
    const p = create4StoryBuildingProject();
    expect(p.plot).toMatchObject({ frontageM: 18, depthM: 28, roadWidthM: 9 });
    expect(p.planId).toBeTruthy();
    const b = buildingForProject(p);
    expect(b && b.ok).toBe(true);
    if (!b || !b.ok) return;
    expect(check(b.model, { roadWidthM: 9 }).find((r) => r.ruleId === "rajuk.mgc")?.status).toBe("pass");
    // honest phases: not started, no canned messages, the basics phase first
    expect(p.phases[0].id).toBe("phase-basics");
    for (const ph of p.phases) {
      expect(ph.status).toBe("not_started");
      expect(ph.messages).toEqual([]);
    }
    expect(p.designStarted).toBe(false);
  });
});
