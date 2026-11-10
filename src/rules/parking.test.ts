import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import type { Rect } from "../plans/types";
import { check, requiredParking } from "./check";
import { COLUMN_BLOCK_MM, layoutParking } from "./parking";

const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe("B4 parking stalls (RAJUK 2008 section 56(1)-(3))", () => {
  for (const plan of PLAN_LIBRARY) {
    it(`${plan.id}: stalls are the cited size, inside parking floor, off columns, the core and each other`, () => {
      const r = fitRange(plan);
      const b = deriveBuilding({ plotWidthMm: r.widthMm.pref + 4000, plotDepthMm: r.depthMm.pref + 9000, storeys: 4, planId: plan.id });
      if (!b.ok) throw new Error("fit");
      const lay = layoutParking(b.model);
      const fitted = b.model.storeys[0].geometry.fitted;
      const park = fitted.rooms.filter((x) => x.def.kind === "parking").flatMap((x) => x.rects);
      const blocked: Rect[] = [
        ...fitted.rooms.filter((x) => x.def.kind !== "parking").flatMap((x) => x.rects),
        ...b.model.storeys[0].geometry.columns.map((c) => ({ x0: c.x - COLUMN_BLOCK_MM / 2, y0: c.y - COLUMN_BLOCK_MM / 2, x1: c.x + COLUMN_BLOCK_MM / 2, y1: c.y + COLUMN_BLOCK_MM / 2 })),
      ];
      const all = [...lay.cars.map((s) => ({ s, car: true })), ...lay.motorcycles.map((s) => ({ s, car: false }))];
      all.forEach(({ s, car }, i) => {
        const w = s.x1 - s.x0;
        const l = s.y1 - s.y0;
        expect([Math.min(w, l), Math.max(w, l)]).toEqual(car ? [2400, 4600] : [1000, 2000]);
        expect(park.some((q) => s.x0 >= q.x0 && s.x1 <= q.x1 && s.y0 >= q.y0 && s.y1 <= q.y1) || inUnion(s, park)).toBe(true);
        expect(blocked.some((q) => hit(s, q))).toBe(false);
        all.slice(i + 1).forEach((o) => expect(hit(s, o.s)).toBe(false));
        if (lay.aisle) expect(hit(s, lay.aisle)).toBe(false);
      });
    });
  }

  it("the Compliance parking row says pass or fail with the stall counts", () => {
    const b = deriveBuilding({ plotWidthMm: 14000, plotDepthMm: 28000, storeys: 4, planId: "p2-2b-fb" });
    if (!b.ok) throw new Error("fit");
    const row = check(b.model, { roadWidthM: 9 }).find((x) => x.ruleId === "rajuk.parking")!;
    const need = requiredParking(b.model)!;
    expect(row.expected!.value).toBe(need.cars);
    expect(row.actual!.value).toBe(layoutParking(b.model).cars.length);
    expect(row.status).toBe(layoutParking(b.model).cars.length >= need.cars ? "pass" : "fail");
  });
});

/** A rectangle covered by several touching parking rectangles (sampled every 100 mm). */
function inUnion(s: Rect, park: Rect[]): boolean {
  for (let x = s.x0; x < s.x1; x += 100) for (let y = s.y0; y < s.y1; y += 100) if (!park.some((q) => x >= q.x0 && x < q.x1 && y >= q.y0 && y < q.y1)) return false;
  return true;
}
