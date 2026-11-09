import { describe, expect, it } from "vitest";
import { fitPlan } from "./fit";
import { P1_4B, P2_2B_FB } from "./library";
import type { PlanDefinition } from "./types";
import { validateFitted } from "./validate";

/** The validator must catch real problems, not just pass good plans. */

function codes(plan: PlanDefinition, env = { widthMm: 10950, depthMm: 16650 }, floorToFloorMm?: number) {
  const r = fitPlan(plan, env);
  if (!r.ok) throw new Error(r.reasons.map((x) => x.message.en).join("; "));
  return validateFitted(r.fitted, { floorToFloorMm }).issues.map((i) => `${i.code}:${i.roomId ?? ""}`);
}

const clone = (p: PlanDefinition): PlanDefinition => JSON.parse(JSON.stringify(p));

describe("validator catches problems", () => {
  it("a good plan has no issues", () => {
    expect(codes(P1_4B)).toEqual([]);
  });

  it("a corridor narrower than the BNBC 915 mm minimum", () => {
    const p = clone(P1_4B);
    p.baysX[1] = { min: 1000, pref: 1000, max: 1000 };
    expect(codes(p, { widthMm: 10600, depthMm: 16650 })).toContain("room_too_narrow:a-corridor");
  });

  it("a toilet with no outside wall and no shaft", () => {
    const p = clone(P1_4B);
    // Swap the store (interior) and the common toilet (on the outside wall).
    p.rooms.find((r) => r.id === "a-store")!.cells = [[0, 3, 0, 3]];
    p.rooms.find((r) => r.id === "a-toilet2")!.cells = [[2, 3, 2, 3]];
    expect(codes(p)).toContain("no_ventilation:a-toilet2");
  });

  it("a shaft next to an inside toilet fixes ventilation", () => {
    const p = clone(P1_4B);
    // Common toilet moves inside (x2), toilet 3 moves to the outside wall (x0), and a shaft takes x3 next to the toilet.
    p.rooms.find((r) => r.id === "a-toilet2")!.cells = [[2, 3, 2, 3]];
    p.rooms.find((r) => r.id === "a-toilet3")!.cells = [[0, 3, 0, 3]];
    const store = p.rooms.find((r) => r.id === "a-store")!;
    store.kind = "shaft";
    store.cells = [[3, 3, 3, 3]];
    p.doors = p.doors.filter((d) => !d.between.includes("a-store") && !d.between.includes("a-toilet3"));
    p.doors.push({ between: ["a-corridor", "a-toilet3"] });
    expect(codes(p)).toEqual([]);
  });

  it("a bedroom with no outside wall", () => {
    const p = clone(P1_4B);
    p.rooms.find((r) => r.id === "a-bed2")!.kind = "bedroom";
    p.rooms.find((r) => r.id === "a-dining")!.kind = "bedroom";
    p.bedroomsPerUnit = 5;
    expect(codes(p)).toContain("no_daylight:a-dining");
  });

  it("a room nobody can reach", () => {
    const p = clone(P1_4B);
    p.doors = p.doors.filter((d) => !(d.between.includes("a-bed3")));
    expect(codes(p)).toContain("unreachable:a-bed3");
  });

  it("a door between rooms that don't touch", () => {
    const p = clone(P1_4B);
    p.doors.push({ between: ["a-bed1", "a-bed4"] });
    expect(codes(p).some((c) => c.startsWith("door_not_placeable"))).toBe(true);
  });

  it("a stair too small for tall floors", () => {
    // 4.5 m floors still fit (needs 5.0 m, has 5.2 m at minimum width); 5.5 m floors need 5.75 m.
    expect(codes(P1_4B, { widthMm: 10030, depthMm: 15650 }, 4500)).not.toContain("stair_too_small:stair");
    expect(codes(P1_4B, { widthMm: 10030, depthMm: 15650 }, 5500)).toContain("stair_too_small:stair");
  });

  it("a dwelling without its own entrance", () => {
    const p = clone(P2_2B_FB);
    p.doors = p.doors.filter((d) => !(d.main && d.between.includes("b-corridor")));
    expect(codes(p, { widthMm: 10950, depthMm: 20250 }).some((c) => c.startsWith("no_entrance"))).toBe(true);
  });

  it("a plan that claims more bedrooms than it has", () => {
    const p = clone(P2_2B_FB);
    p.bedroomsPerUnit = 3;
    expect(codes(p, { widthMm: 10950, depthMm: 20250 }).filter((c) => c.startsWith("unit_incomplete"))).toHaveLength(2);
  });

  it("a beam span over the limit", () => {
    const p = clone(P1_4B);
    p.structuralX = [0, 4];
    expect(codes(p).some((c) => c.startsWith("span_too_long"))).toBe(true);
  });

  it("overlapping or missing cells are a definition error", () => {
    const p = clone(P1_4B);
    p.rooms.find((r) => r.id === "a-store")!.cells = [[2, 4, 2, 4]];
    const r = fitPlan(p, { widthMm: 10950, depthMm: 16650 });
    expect(r.ok).toBe(false);
  });
});
