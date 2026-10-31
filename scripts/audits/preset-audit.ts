/**
 * Floor-plan preset audit (relative coordinates, building-size independent):
 * room overlaps, uncovered area, rooms without door / exterior window, outline problems.
 *   npx tsx scripts/audits/preset-audit.ts
 */
import { FLOORPLAN_PRESETS, type RoomPartition } from "../../src/data/floorplanPresets";

const N = 200;
const inPoly = (pts: Array<[number, number]>, x: number, y: number) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    if (pts[i][1] > y !== pts[j][1] > y && x < ((pts[j][0] - pts[i][0]) * (y - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
  return c;
};
const inRoom = (r: RoomPartition, x: number, y: number) =>
  r.pointsRel && r.pointsRel.length >= 4
    ? inPoly(r.pointsRel as Array<[number, number]>, x, y)
    : x >= r.boundsRel[0] && x < r.boundsRel[2] && y >= r.boundsRel[1] && y < r.boundsRel[3];

let issues = 0;
for (const p of FLOORPLAN_PRESETS) {
  let covered = 0, over = 0;
  const pair = new Map<string, number>();
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = (i + .5) / N, y = (j + .5) / N;
    const hit = p.rooms.filter((r) => inRoom(r, x, y));
    if (hit.length) covered++;
    if (hit.length > 1) { over++; for (let a = 0; a < hit.length; a++) for (let b = a + 1; b < hit.length; b++) { const k = `${hit[a].id}|${hit[b].id}`; pair.set(k, (pair.get(k) ?? 0) + 1); } }
  }
  const msgs: string[] = [];
  const cov = covered / (N * N);
  if (cov < 0.85 && p.id !== "preset-ground-parking") msgs.push(`only ${(cov * 100).toFixed(0)}% of the footprint is assigned to rooms`);
  for (const [k, n] of pair) if (n / (N * N) > 0.002) msgs.push(`rooms overlap: ${k} (${((n / (N * N)) * 100).toFixed(1)}% of footprint)`);
  for (const r of p.rooms) {
    const area = (r.boundsRel[2] - r.boundsRel[0]) * (r.boundsRel[3] - r.boundsRel[1]);
    if (!r.doorSide && !["corridor", "balcony"].includes(r.kind) && p.id !== "preset-ground-parking") msgs.push(`${r.id}: no door`);
    if (["bedroom", "living", "kitchen"].includes(r.kind) && !r.windowSide && p.id !== "preset-ground-parking") msgs.push(`${r.id}: no window side (habitable ${r.kind})`);
    if (area < 0.004) msgs.push(`${r.id}: tiny room (${(area * 100).toFixed(2)}% of footprint)`);
  }
  issues += msgs.length;
  console.log(`${msgs.length ? "WARN" : " ok "} ${p.id} (${p.rooms.length} rooms)`);
  msgs.forEach((m) => console.log("      - " + m));
}
console.log(`\n${issues} preset data issues`);
