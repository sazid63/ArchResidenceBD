import { describe, expect, it } from "vitest";
import { deriveBuilding, DEFAULT_SETBACKS_MM as S } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { MAX_SPAN_MM } from "../plans/rules";
import { analyzeStructure } from "../structure/analyze";
import { lineSpans } from "./ColumnGridOptimizerScreen";

describe("the column grid screen's data", () => {
  it("lists every structural line with the span from the previous one, and the spans add up to the building", () => {
    expect(lineSpans([0, 3000, 7000], [0, 1, 2])).toEqual([{ at: 0, span: null }, { at: 3000, span: 3000 }, { at: 7000, span: 4000 }]);
    expect(lineSpans([0, 3000, 7000], [0, 2])).toEqual([{ at: 0, span: null }, { at: 7000, span: 7000 }]);
  });

  for (const plan of PLAN_LIBRARY) {
    it(`${plan.id}: one column per grid crossing, every span within the limit, every column has a size on every storey`, () => {
      const r = fitRange(plan);
      const b = deriveBuilding({ planId: plan.id, storeys: 4, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
      if (!b.ok) throw new Error("fit");
      const f = b.model.storeys[0].geometry.fitted;
      const xs = lineSpans(f.xLines, f.structuralX);
      const ys = lineSpans(f.yLines, f.structuralY);
      const res = analyzeStructure(b.model);
      expect(res.frame.columns.length).toBe(xs.length * ys.length);
      for (const l of [...xs, ...ys]) if (l.span !== null) expect(l.span).toBeLessThanOrEqual(MAX_SPAN_MM);
      expect(xs[xs.length - 1].at).toBe(b.model.widthMm);
      for (const c of res.frame.columns) {
        expect(c.storeys.length).toBeGreaterThan(0);
        for (const s of c.storeys) expect(s.section.bx).toBeGreaterThanOrEqual(250);
      }
    });
  }
});
