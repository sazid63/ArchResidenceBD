import { describe, expect, it } from "vitest";
import { fitPlan, fitRange } from "./fit";
import { deriveGeometry, doorLeaf, OUTSIDE, opensInto, type FloorGeometry, type Opening } from "./geometry";
import { PLAN_LIBRARY } from "./library";
import { WALL_MM } from "./rules";

/**
 * Doors open inwards, into the room they protect, and the swung leaf must fit there: inside that room, clear of the
 * columns and clear of every other door's swing in the same room.
 */

type Pt = [number, number];

/** Sample points of the quarter disc a door leaf sweeps (centre = hinge, radius = door width), kept just inside the arc. */
function sweepPoints(d: Opening): Pt[] {
  const leaf = doorLeaf(d)!;
  const [hx, hy] = leaf.hinge;
  const ux = Math.sign(leaf.closed[0] - hx);
  const uy = Math.sign(leaf.closed[1] - hy);
  const vx = Math.sign(leaf.open[0] - hx);
  const vy = Math.sign(leaf.open[1] - hy);
  const pts: Pt[] = [];
  const R = leaf.lengthMm;
  for (let i = 1; i <= 6; i++)
    for (let j = 1; j <= 6; j++) {
      const a = (i / 6) * R * 0.98;
      const b = (j / 6) * R * 0.98;
      if (Math.hypot(a, b) > R * 0.98) continue;
      // a runs along the wall from the hinge, b runs out from the wall into the room.
      pts.push([hx + ux * a + vx * b, hy + uy * a + vy * b]);
    }
  return pts;
}

function problems(geo: FloorGeometry): string[] {
  const out: string[] = [];
  const f = geo.fitted;
  const half = WALL_MM.interior / 2;
  const inRoom = (room: number, [x, y]: Pt) => f.rooms[room].rects.some((r) => x >= r.x0 + half && x <= r.x1 - half && y >= r.y0 + half && y <= r.y1 - half);
  const swings = geo.doors.filter((d) => d.swing);
  for (const d of swings) {
    const name = `${f.rooms[d.a].def.id}/${d.b === OUTSIDE ? "outside" : f.rooms[d.b].def.id}`;
    const into = d.swing!.into;
    const pts = sweepPoints(d);
    if (pts.some((p) => !inRoom(into, p))) out.push(`${name}: the swing leaves ${f.rooms[into].def.id}`);
    for (const c of geo.columns) {
      const hit = pts.some(([x, y]) => Math.abs(x - c.x) < 150 && Math.abs(y - c.y) < 150);
      if (hit) out.push(`${name}: the swing hits a column at ${c.gridX},${c.gridY}`);
    }
  }
  for (let i = 0; i < swings.length; i++)
    for (let j = i + 1; j < swings.length; j++) {
      if (swings[i].swing!.into !== swings[j].swing!.into) continue;
      const lj = doorLeaf(swings[j])!;
      const rj = lj.lengthMm;
      const [hx, hy] = lj.hinge;
      const clash = sweepPoints(swings[i]).some(([x, y]) => Math.hypot(x - hx, y - hy) < rj * 0.95 && Math.sign(x - hx) !== 0);
      if (clash && sweepPoints(swings[j]).some((q) => sweepPoints(swings[i]).some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 60)))
        out.push(`${f.rooms[swings[i].swing!.into].def.id}: two door swings overlap`);
    }
  return out;
}

describe("door swings", () => {
  it("every hinged door opens into the room it protects", () => {
    for (const plan of PLAN_LIBRARY) {
      const r = fitPlan(plan, { widthMm: fitRange(plan).widthMm.pref, depthMm: fitRange(plan).depthMm.pref });
      if (!r.ok) throw new Error("fit failed");
      const geo = deriveGeometry(r.fitted);
      for (const d of geo.doors) {
        const kinds = [r.fitted.rooms[d.a].def.kind, r.fitted.rooms[d.b].def.kind];
        if (kinds.includes("lift")) {
          expect(d.swing, `${plan.id} lift door`).toBeUndefined();
          continue;
        }
        const into = d.swing!.into;
        expect(into, plan.id).toBe(opensInto(r.fitted.rooms, d.a, d.b));
        // an entrance door opens into the dwelling, never into the shared core
        if (d.main) expect(r.fitted.rooms[into].def.unit, `${plan.id} entrance`).toBeTruthy();
        // toilets and bedrooms are never swung into from the other side
        for (const k of ["toilet", "bedroom"] as const) {
          const other = into === d.a ? d.b : d.a;
          if (r.fitted.rooms[other].def.kind === k) expect(["toilet", "bedroom", "store"]).toContain(r.fitted.rooms[into].def.kind);
        }
      }
    }
  });

  it("the leaf sits on the side of the wall of the room it opens into", () => {
    for (const plan of PLAN_LIBRARY) {
      const range = fitRange(plan);
      const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
      if (!r.ok) throw new Error("fit failed");
      const geo = deriveGeometry(r.fitted);
      for (const d of geo.doors.filter((x) => x.swing)) {
        const leaf = doorLeaf(d)!;
        const probe: Pt = d.orientation === "v" ? [leaf.open[0] - Math.sign(leaf.open[0] - d.at) * 100, leaf.open[1] + (d.swing!.hinge === "from" ? 100 : -100)] : [leaf.open[0] + (d.swing!.hinge === "from" ? 100 : -100), leaf.open[1] - Math.sign(leaf.open[1] - d.at) * 100];
        expect(r.fitted.rooms[d.swing!.into].rects.some((rc) => probe[0] > rc.x0 && probe[0] < rc.x1 && probe[1] > rc.y0 && probe[1] < rc.y1), `${plan.id} ${r.fitted.rooms[d.a].def.id}`).toBe(true);
      }
    }
  });

  it("the swung leaf fits inside its room, clear of columns and other swings, in every plan at every size", () => {
    const bad: string[] = [];
    for (const plan of PLAN_LIBRARY) {
      const range = fitRange(plan);
      const widths = [range.widthMm.min, range.widthMm.max];
      const depths = [range.depthMm.min, range.depthMm.max];
      for (const mirror of [false, true])
        for (const w of widths)
          for (const d of depths) {
            const r = fitPlan(plan, { widthMm: w, depthMm: d }, { mirror });
            if (!r.ok) continue;
            for (const p of problems(deriveGeometry(r.fitted))) bad.push(`${plan.id} ${w}x${d}${mirror ? " mirrored" : ""}: ${p}`);
          }
    }
    expect(bad).toEqual([]);
  });

  it("the check itself catches a door swung out of its room and two doors swinging into each other", () => {
    const plan = PLAN_LIBRARY[0];
    const range = fitRange(plan);
    const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
    if (!r.ok) throw new Error("fit failed");
    const geo = deriveGeometry(r.fitted);
    expect(problems(geo)).toEqual([]);
    const wrong = { ...geo, doors: geo.doors.map((d, k) => (k === 1 && d.swing ? { ...d, swing: { ...d.swing, side: (d.swing.side === 1 ? -1 : 1) as 1 | -1 } } : d)) };
    expect(problems(wrong).length).toBeGreaterThan(0);
    const d0 = geo.doors.find((d) => d.swing)!;
    const twin = { ...d0, from: d0.from + 200, to: d0.to + 200 };
    expect(problems({ ...geo, doors: [...geo.doors, twin] }).some((p) => p.includes("overlap"))).toBe(true);
  });
});
