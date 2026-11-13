/**
 * Structural drawing sheets built from the structure result (Phase 4): general notes, column layout and schedule, footing plan
 * and schedule, and the beam and slab layout of every level. Screening drawings, drawn in millimetres like the architectural sheets.
 * Bars come from the same pickers as the bar schedule (pickColumnBars, confinementDesign), so the sheets and the schedule agree.
 */
import type { BuildingModel } from "../model/building";
import { lapTension } from "../structure/anchorage";
import { pickColumnBars } from "../structure/barSelect";
import { barsPerFace, confinementDesign } from "../structure/confinement";
import type { StructureResult } from "../structure/analyze";
import { DESIGN, MATERIALS } from "../structure/materials";
import { COVER_MM } from "../structure/footing";
import { SceneBuilder, type Scene } from "./scene";
import type { Lang } from "./sheets";

const T = (lang: Lang, en: string, bn: string) => (lang === "bn" ? bn : en);
const TEXT_H = 150;
const ROW = 300;

/** Wraps a list of ids into lines of at most `width` characters. */
function wrap(ids: string[], width = 90): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const id of ids) {
    if (cur && (cur + ", " + id).length > width) {
      lines.push(cur);
      cur = id;
    } else cur = cur ? cur + ", " + id : id;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Text rows below a drawing, starting at `y` and going down. Returns the last y used. */
function rows(sb: SceneBuilder, x: number, y: number, lines: string[], h = TEXT_H): number {
  let cy = y;
  for (const l of lines) {
    sb.text("TEXT", x, cy, h, l);
    cy -= ROW;
  }
  return cy;
}

function gridAndColumns(sb: SceneBuilder, res: StructureResult, label: boolean): void {
  const xs = [...new Set(res.frame.columns.map((c) => c.xMm))].sort((a, b) => a - b);
  const ys = [...new Set(res.frame.columns.map((c) => c.yMm))].sort((a, b) => a - b);
  const x0 = Math.min(...xs) - 1500;
  const x1 = Math.max(...xs) + 1500;
  const y0 = Math.min(...ys) - 1500;
  const y1 = Math.max(...ys) + 1500;
  for (const x of xs) sb.line("LEVELS", x, y0, x, y1);
  for (const y of ys) sb.line("LEVELS", x0, y, x1, y);
  for (const c of res.frame.columns) {
    const s = c.storeys[0].section;
    sb.rect("COLUMNS", c.xMm - s.bx / 2, c.yMm - s.by / 2, c.xMm + s.bx / 2, c.yMm + s.by / 2);
    if (label) sb.text("TEXT", c.xMm, c.yMm + s.by / 2 + 90, TEXT_H, c.id, "middle");
  }
}

/** Shear walls: the lift shaft (outer box and inner face) and the stair and end walls on their centrelines (screening, WALLS layer). */
function drawWalls(sb: SceneBuilder, res: StructureResult, lang: Lang): void {
  const cr = res.frame.core;
  if (!cr) return;
  const s = cr.section;
  const t = s.tMm;
  const ox0 = s.cxMm - s.lxMm / 2;
  const ox1 = s.cxMm + s.lxMm / 2;
  const oy0 = s.cyMm - s.lyMm / 2;
  const oy1 = s.cyMm + s.lyMm / 2;
  sb.rect("WALLS", ox0, oy0, ox1, oy1);
  sb.rect("WALLS", ox0 + t, oy0 + t, ox1 - t, oy1 - t);
  sb.text("TEXT", s.cxMm, oy1 + 90, TEXT_H, T(lang, "Lift shaft wall", "লিফট শ্যাফটের দেয়াল"), "middle");
  (s.extraWalls ?? []).forEach((w, i) => {
    if (!w.span) return;
    const { x0, y0, x1, y1 } = w.span;
    sb.rect("WALLS", Math.min(x0, x1) - t / 2, Math.min(y0, y1) - t / 2, Math.max(x0, x1) + t / 2, Math.max(y0, y1) + t / 2);
    const flange = (w.kind ?? "web") === "flange";
    sb.text("TEXT", (x0 + x1) / 2, (y0 + y1) / 2 + t, TEXT_H, `W${i + 1} ${flange ? "end wall" : "stair wall"}`, "middle");
  });
}

/** The drawing's lower-left corner, for placing the schedule under it. */
function floorY(res: StructureResult): { x: number; y: number } {
  return { x: Math.min(...res.frame.columns.map((c) => c.xMm)) - 1500, y: Math.min(...res.frame.columns.map((c) => c.yMm)) - 2200 };
}

/** General structural notes: materials, cover, laps, hooks, design basis and limits. */
export function notesScene(model: BuildingModel, res: StructureResult, lang: Lang = "en"): Scene {
  const sb = new SceneBuilder();
  const o = res.frame.options;
  const lap = (d: number) => Math.ceil(lapTension(d, "B", {}) / 50) * 50;
  const hasCore = !!res.frame.core;
  const hasExtraWalls = (res.frame.core?.stairWalls?.length ?? 0) > 0;
  const notes: Array<[string, string]> = [
    ["GENERAL STRUCTURAL NOTES", "সাধারণ কাঠামোগত নোট"],
    [`1. Concrete: cylinder strength fc' ${MATERIALS.fcMPa} MPa (assumed; the gazette gives exposure minima, not a grade).`, `১. কংক্রিট: সিলিন্ডার শক্তি fc' ${MATERIALS.fcMPa} এমপিএ (অনুমিত)।`],
    [`2. Reinforcement: deformed bars Grade ${MATERIALS.fyMPa} (fy ${MATERIALS.fyMPa} MPa); ties and stirrups fyt ${MATERIALS.fytMPa} MPa.`, `২. রড: ডিফর্মড গ্রেড ${MATERIALS.fyMPa} (fy ${MATERIALS.fyMPa} এমপিএ); টাই ও স্টিরাপ fyt ${MATERIALS.fytMPa} এমপিএ।`],
    [`3. Clear cover: footings against earth ${COVER_MM} mm, columns and beams ${DESIGN.coverBeamMm} mm, slabs ${DESIGN.coverSlabMm} mm.`, `৩. কভার: মাটির সংস্পর্শে ফুটিং ${COVER_MM} মিমি, কলাম ও বিম ${DESIGN.coverBeamMm} মিমি, স্ল্যাব ${DESIGN.coverSlabMm} মিমি।`],
    [`4. Tension lap splices (class B): 12 mm ${lap(12)} mm, 16 mm ${lap(16)} mm, 20 mm ${lap(20)} mm, 25 mm ${lap(25)} mm. Column bars lap in the middle half of the storey only.`, `৪. টেনশন ল্যাপ (শ্রেণি বি): ১২ মিমি ${lap(12)}, ১৬ মিমি ${lap(16)}, ২০ মিমি ${lap(20)}, ২৫ মিমি ${lap(25)} মিমি। কলামের রড তলার মাঝের অর্ধেকে ল্যাপ করুন।`],
    ["5. Ties and stirrups: closed, 135 degree hooks with a tail of 6 bar diameters (not less than 60 mm). Cross ties alternate end for end.", "৫. টাই ও স্টিরাপ: বদ্ধ, ১৩৫ ডিগ্রি হুক, লেজ ৬ গুণ ব্যাস (অন্তত ৬০ মিমি)। ক্রস টাই একান্তরে।"],
    ["6. Columns: closed ties at the close spacing shown in the schedule over lo from each joint face (largest side, one-sixth of the clear height, 450 mm), wider spacing between (BNBC 2020 Part 6 Sec 8.3.5.4).", "৬. কলাম: জয়েন্টের মুখ থেকে lo দৈর্ঘ্যে (বড় পাশ, পরিষ্কার উচ্চতার ১/৬, ৪৫০ মিমি) সূচিতে দেখানো ঘন টাই, মাঝে বেশি ফাঁক (বিএনবিসি ২০২০ পার্ট ৬ ধারা ৮.৩.৫.৪)।"],
    ["7. Beams: stirrups are designed for the probable-moment shear (Sec 8.3.8.1); the first stirrup is 50 mm from the column face.", "৭. বিম: স্টিরাপ সম্ভাব্য-মোমেন্ট শিয়ারে নকশা (ধারা ৮.৩.৮.১); প্রথম স্টিরাপ কলামের মুখ থেকে ৫০ মিমি।"],
    [`8. Seismic: Dhaka Z ${o.z}, site class ${o.siteClass}, system ${res.frame.seismicX.system.id}; wind Dhaka V ${res.wind.velocityMs} m/s, Exposure B. Lateral design is the larger of the two.`, `৮. ভূমিকম্প: ঢাকা Z ${o.z}, সাইট শ্রেণি ${o.siteClass}; বাতাস ঢাকা V ${res.wind.velocityMs} মি/সে, এক্সপোজার B। পার্শ্ব নকশা দুটির বড়টি।`],
    [`9. Foundation: isolated and combined pads on 75 mm lean concrete, allowable bearing ${o.allowableBearingKpa} kPa (site value to be confirmed by a soil test). Tie beams join the footings.`, `৯. ভিত্তি: ৭৫ মিমি লিন কংক্রিটের ওপর প্যাড, অনুমোদিত বিয়ারিং ${o.allowableBearingKpa} কিলোপাসকাল (মাটি পরীক্ষায় নিশ্চিত করতে হবে)। ফুটিংগুলো টাই বিমে যুক্ত।`],
    ...(hasCore ? ([["10. Lift core: 150 mm reinforced concrete walls with boundary elements at the corners and coupling beams over the doors, as scheduled." + (hasExtraWalls ? " Stair and end walls are shown on the column sheet and in its wall schedule; they are screening walls for architectural review." : ""), "১০. লিফট কোর: ১৫০ মিমি আরসিসি দেয়াল, কোণে প্রান্ত অংশ ও দরজার ওপরে কাপলিং বিম, সূচি অনুযায়ী।" + (hasExtraWalls ? " সিঁড়ি ও প্রান্তের দেয়াল কলাম শিটে ও দেয়াল সূচিতে দেখানো; স্থাপত্য পর্যালোচনার জন্য প্রাথমিক নকশা।" : "")]] as Array<[string, string]>) : []),
    [`${hasCore ? 11 : 10}. This is a screening set from ArchResidenceBD. It must be checked, completed and signed by a licensed structural engineer before construction.`, `${hasCore ? "১১" : "১০"}. এটি প্রাথমিক নকশা। নির্মাণের আগে লাইসেন্সপ্রাপ্ত কাঠামো প্রকৌশলীকে যাচাই, সম্পূর্ণ ও স্বাক্ষর করতে হবে।`],
  ];
  let y = 0;
  notes.forEach(([en, bn], i) => {
    sb.text("TEXT", 0, y, i === 0 ? 260 : TEXT_H, T(lang, en, bn));
    y -= i === 0 ? 520 : ROW + 60;
  });
  return sb.scene("struct-notes", T(lang, "General structural notes", "সাধারণ কাঠামোগত নোট"));
}

/** Column layout with the column schedule: one row per distinct column type. */
export function columnPlanScene(model: BuildingModel, res: StructureResult, lang: Lang = "en"): Scene {
  void model;
  const sb = new SceneBuilder();
  gridAndColumns(sb, res, true);
  drawWalls(sb, res, lang);
  const types = new Map<string, string[]>();
  for (const c of res.frame.columns) {
    // consecutive storeys with the same section, bars and ties are one range
    let i = 0;
    const parts: string[] = [];
    while (i < c.storeys.length) {
      const key = (k: number) => {
        const st = c.storeys[k];
        const p = pickColumnBars(st.astMm2, st.section.bx, st.section.by);
        const cf = confinementDesign({ bxMm: st.section.bx, byMm: st.section.by, luMm: st.luMm, longDiaMm: p.dia, ...barsPerFace(p.n, st.section.bx, st.section.by) });
        return `${st.section.bx} x ${st.section.by}, ${p.n}-dia ${p.dia}, ties dia ${cf.tieDiaMm} @ ${cf.ok ? cf.endSpacingMm : 50}/${cf.midSpacingMm}`;
      };
      let j = i;
      while (j + 1 < c.storeys.length && key(j + 1) === key(i)) j++;
      parts.push(`S${i}${j > i ? "-S" + j : ""}: ${key(i)}`);
      i = j + 1;
    }
    const sig = parts.join("  |  ");
    types.set(sig, [...(types.get(sig) ?? []), c.id]);
  }
  const { x, y } = floorY(res);
  let cy = y;
  sb.text("TEXT", x, cy, 220, T(lang, "COLUMN SCHEDULE (section mm, main bars, ties dia @ close / wide spacing mm, storey 0 = ground)", "কলাম সূচি (সেকশন মিমি, মূল রড, টাই ব্যাস @ ঘন / ফাঁকা ব্যবধান মিমি, তলা ০ = নিচতলা)"));
  cy -= ROW + 100;
  let n = 0;
  for (const [sig, ids] of types) {
    const mark = `T${++n}`;
    cy = rows(sb, x, cy, [`${mark}: ${sig}`, ...wrap(ids).map((l) => "     " + l)]);
    cy -= 60;
  }
  const walls = res.frame.core?.stairWalls ?? [];
  if (walls.length) {
    cy = rows(sb, x, cy - 60, [T(lang, "WALL SCHEDULE (shear walls outside the lift shaft; lengths and thickness mm; end steel per end)", "দেয়াল সূচি (লিফট শ্যাফটের বাইরের শিয়ার ওয়াল; দৈর্ঘ্য ও পুরুত্ব মিমি; প্রতি প্রান্তে ইস্পাত)"),
      ...walls.map((w, i) => {
        const along = w.kind === "flange" ? (w.dir === "x" ? "y" : "x") : w.dir;
        const be = w.boundary ? `, boundary element ${w.boundary.lengthMm} mm` : "";
        return `W${i + 1}: ${w.kind === "flange" ? "end wall (across the load)" : "stair wall (web)"}, along ${along}, ${w.lengthMm} x ${w.tMm}, end steel ${Math.round(w.asEndMm2)} mm2 each end, horizontal ${(w.rhoHorizontal * 100).toFixed(2)} %${be}`;
      })]);
  }
  return sb.scene("struct-columns", T(lang, "Column layout and schedule", "কলামের বিন্যাস ও সূচি"));
}

/** Footing plan with the footing schedule and the tie beams. */
export function footingPlanScene(model: BuildingModel, res: StructureResult, lang: Lang = "en"): Scene {
  void model;
  const sb = new SceneBuilder();
  const byId = new Map(res.frame.columns.map((c) => [c.id, c]));
  for (const t of res.foundation.ties) {
    const a = byId.get(t.a);
    const b = byId.get(t.b);
    if (a && b) sb.line("SETBACK", a.xMm, a.yMm, b.xMm, b.yMm);
  }
  for (const f of res.foundation.footings) {
    sb.rect("OUTLINE", f.x0, f.y0, f.x1, f.y1);
    sb.text("TEXT", (f.x0 + f.x1) / 2, f.y0 + 120, TEXT_H, f.id, "middle");
  }
  gridAndColumns(sb, res, false);
  const sizes = new Map<string, string[]>();
  for (const f of res.foundation.footings) {
    const key = `${f.x1 - f.x0} x ${f.y1 - f.y0} x ${f.depthMm}${f.kind === "isolated" ? "" : "  (" + f.kind + ")"}`;
    sizes.set(key, [...(sizes.get(key) ?? []), f.id]);
  }
  const { x, y } = floorY(res);
  let cy = y - 300;
  sb.text("TEXT", x, cy, 220, T(lang, "FOOTING SCHEDULE (plan x plan x depth, mm; pads on 75 mm lean concrete; dashed lines are tie beams)", "ফুটিং সূচি (প্ল্যান × প্ল্যান × গভীরতা, মিমি; ৭৫ মিমি লিন কংক্রিটের ওপর; ড্যাশ লাইন টাই বিম)"));
  cy -= ROW + 100;
  for (const [key, ids] of sizes) {
    cy = rows(sb, x, cy, [key, ...wrap(ids).map((l) => "     " + l)]);
    cy -= 60;
  }
  const ties = res.foundation.ties;
  if (ties.length) {
    const worst = ties.reduce((a, t) => (t.asProvMm2 > a.asProvMm2 ? t : a));
    rows(sb, x, cy, [T(lang, `Tie beams ${ties.length}: largest tie force ${Math.max(...ties.map((t) => t.forceKn)).toFixed(0)} kN, steel up to ${worst.asProvMm2.toFixed(0)} mm2 (10 % of the larger column load).`, `টাই বিম ${ties.length}টি: সর্বোচ্চ টান ${Math.max(...ties.map((t) => t.forceKn)).toFixed(0)} কিনি, রড ${worst.asProvMm2.toFixed(0)} মিমি² পর্যন্ত।`)]);
  }
  return sb.scene("struct-footings", T(lang, "Footing plan and schedule", "ফুটিং প্ল্যান ও সূচি"));
}

/** Beam and slab layout of one level (the slab above storey `level`; the last is the roof). */
export function beamPlanScene(model: BuildingModel, res: StructureResult, level: number, lang: Lang = "en"): Scene {
  void model;
  const lv = res.levels[level];
  const sb = new SceneBuilder();
  gridAndColumns(sb, res, false);
  const sizes = new Map<string, string[]>();
  for (const bl of lv.beamLines) {
    const s = bl.result.section;
    const stir = Math.min(...bl.result.spans.map((sp) => sp.stirrupSpacingMm));
    const mark = `B-${bl.orientation}${Math.round(bl.at)}`;
    for (let j = 0; j + 1 < bl.stations.length; j++) {
      const a = bl.stations[j];
      const b = bl.stations[j + 1];
      if (bl.orientation === "h") sb.line("CUT", a, bl.at, b, bl.at);
      else sb.line("CUT", bl.at, a, bl.at, b);
    }
    const mid = (bl.stations[0] + bl.stations[bl.stations.length - 1]) / 2;
    if (bl.orientation === "h") sb.text("TEXT", mid, bl.at + 90, TEXT_H, `${s.bMm}x${s.hMm}`, "middle");
    else sb.text("TEXT", bl.at + 90, mid, TEXT_H, `${s.bMm}x${s.hMm}`, "start");
    const key = `${s.bMm} x ${s.hMm}, stirrups dia ${DESIGN.stirrupMm} @ ${stir} (closest)`;
    sizes.set(key, [...(sizes.get(key) ?? []), mark]);
  }
  for (const p of lv.panels) sb.text("TEXT", (p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 140, `S${p.px + 1}-${p.py + 1}`, "middle");
  const { x, y } = floorY(res);
  let cy = y;
  sb.text("TEXT", x, cy, 220, T(lang, `LEVEL ${level} ${lv.kind === "roof" ? "(ROOF)" : ""}: slab ${lv.slabThicknessMm} mm. BEAM SCHEDULE (b x h mm)`, `তল ${level} ${lv.kind === "roof" ? "(ছাদ)" : ""}: স্ল্যাব ${lv.slabThicknessMm} মিমি। বিম সূচি (প্রস্থ × গভীরতা মিমি)`));
  cy -= ROW + 100;
  for (const [key, ids] of sizes) {
    cy = rows(sb, x, cy, [key, ...wrap(ids).map((l) => "     " + l)]);
    cy -= 60;
  }
  if (lv.cantilevers.length) rows(sb, x, cy, [T(lang, `${lv.cantilevers.length} cantilever balcony strip(s): see the bar schedule.`, `${lv.cantilevers.length}টি ক্যান্টিলিভার বারান্দা: বার শিডিউল দেখুন।`)]);
  return sb.scene(`struct-beams-${level}`, T(lang, `Beam and slab layout, level ${level}${lv.kind === "roof" ? " (roof)" : ""}`, `বিম ও স্ল্যাব বিন্যাস, তল ${level}${lv.kind === "roof" ? " (ছাদ)" : ""}`));
}

/** All structural scenes in sheet order. */
export function structuralScenes(model: BuildingModel, res: StructureResult, lang: Lang = "en"): Scene[] {
  return [
    notesScene(model, res, lang),
    columnPlanScene(model, res, lang),
    footingPlanScene(model, res, lang),
    ...res.levels.map((_, k) => beamPlanScene(model, res, k, lang)),
  ];
}
