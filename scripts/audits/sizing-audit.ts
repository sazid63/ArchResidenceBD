/**
 * Section-sizing audit: for every storey count / plot size, the recommended grid, column and beam
 * must pass the structural checks in src/cad/sectionSizing.ts (screening level, not a design).
 *   npm run audit:sizing
 */
import { recommendSections } from "../../src/cad/sectionSizing";

let bad = 0;
console.log("storeys plot  grid  span  column(util)   beam(util)");
for (const s of [2, 3, 4, 5, 6, 7, 8, 10, 12])
  for (const a of [80, 134, 200, 234, 335, 450, 500]) {
    const r = recommendSections(s, a);
    if (!r.adequate) bad++;
    console.log(`${String(s).padStart(5)} ${String(a).padStart(4)}  ${r.colsX}x${r.colsY}  ${r.maxSpanM.toFixed(1)}m  ${r.colSizeMm}(${r.colUtilization.toFixed(2)})  ${r.beamWidthMm}x${r.beamDepthMm}(${r.beamUtilization.toFixed(2)}) ${r.adequate ? "" : "  INADEQUATE"}`);
  }
console.log(bad ? `\n${bad} inadequate combinations` : "\nall combinations adequate");
process.exit(bad ? 1 : 0);
