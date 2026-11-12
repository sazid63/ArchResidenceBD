/**
 * The permit package (M5-2): drawings, the BOQ, the bar schedule, the compliance report and the
 * assumptions as downloadable files. Pure: the caller supplies the date, and nothing here reads the clock.
 *
 * It is a screening package. It does not replace drawings signed by licensed professionals, which
 * RAJUK requires; the index and every sheet say so.
 */

import type { BuildingProject } from "../engine/projectState";
import type { BuildingModel } from "../model/building";
import { renderPlanSvg } from "../plans/render";
import { BOQ_ASSUMPTIONS, boqToCsv, buildBoq } from "../quantities/takeoff";
import { buildReport, type Report, type ReportItem } from "../rules/report";
import { SUPPORTED_MAX_STOREYS, analyzeStructure, type StructureResult } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";
import { bbsToCsv } from "../structure/bbsCsv";
import { ASSUMPTIONS } from "../structure/materials";
import { sceneToDxf, sceneToSvg, type Scene } from "./scene";
import { elevationScene, planScene, sectionScene, siteScene, withTitleBlock, type ElevationSide, type Lang, type SheetOptions, type TitleInfo } from "./sheets";
import { structuralScenes } from "./structSheets";
import { makeZip } from "./zip";

export interface PackageFile {
  /** Path inside the package, forward slashes. */
  path: string;
  mime: string;
  text: string;
  /** Binary content (a PDF); when set it is stored instead of `text`. */
  data?: Uint8Array;
}

export interface Sheet {
  id: string;
  sheetNo: string;
  title: string;
  /** Scene with the title block; the SVG and DXF both come from it. */
  scene: Scene;
}

export function columnSizer(res: StructureResult): NonNullable<SheetOptions["columnSize"]> {
  const map = new Map(res.frame.columns.map((c) => [`${c.xMm},${c.yMm}`, c]));
  return (x, y, storey) => {
    const c = map.get(`${x},${y}`);
    if (!c) return null;
    const s = c.storeys[Math.min(storey, c.storeys.length - 1)].section;
    return { bx: s.bx, by: s.by };
  };
}

/** The deepest beam under the slab above a storey, from the structure result. */
export function beamUnder(res: StructureResult, storey: number): { bMm: number; hMm: number } | null {
  const lv = res.levels[storey];
  if (!lv || lv.beamLines.length === 0) return null;
  const s = lv.beamLines.map((b) => b.result.section).reduce((a, c) => (c.hMm > a.hMm ? c : a));
  return { bMm: s.bMm, hMm: s.hMm };
}

/** Every drawing sheet of the building, in sheet order, each with its title block. */
export function buildSheets(model: BuildingModel, res: StructureResult, projectName: string, date: string, lang: Lang = "en"): Sheet[] {
  const opts: SheetOptions = { lang, columnSize: columnSizer(res), beamUnderSlab: (storey) => beamUnder(res, storey) };
  const slabMm = res.levels[0]?.slabThicknessMm ?? 150;
  const raw: Scene[] = [
    siteScene(model, opts),
    ...model.storeys.map((s) => planScene(model, s.index, opts)),
    sectionScene(model, slabMm, opts),
    ...(["front", "rear", "left", "right"] as ElevationSide[]).map((side) => elevationScene(model, side, opts)),
    ...structuralScenes(model, res, lang),
  ];
  let planN = 0;
  let elevN = 0;
  let beamN = 0;
  const structNo = (id: string) => (id === "struct-notes" ? "S-001" : id === "struct-columns" ? "S-101" : id === "struct-footings" ? "S-102" : `S-2${String(++beamN).padStart(2, "0")}`);
  return raw.map((scene) => {
    const sheetNo = scene.id.startsWith("struct-") ? structNo(scene.id) : scene.id === "site" ? "A-001" : scene.id.startsWith("plan-") ? `A-1${String(++planN).padStart(2, "0")}` : scene.id.startsWith("section") ? "A-301" : `A-2${String(++elevN).padStart(2, "0")}`;
    const info: TitleInfo = { project: projectName, sheetNo, title: scene.title, date, scale: lang === "bn" ? "১ একক = ১ মিমি (প্লটের সময় শিটে বসান)" : "1 unit = 1 mm (fit to sheet when plotting)" };
    return { id: scene.id, sheetNo, title: scene.title, scene: withTitleBlock(scene, info, lang) };
  });
}

const val = (v: { value: number | string; unit: string } | null) => (v ? `${v.value}${v.unit ? " " + v.unit : ""}` : "-");

const STATUS_WORD: Record<string, string> = { pass: "PASS", fail: "FAIL", warn: "WARN", not_checked: "NOT CHECKED" };

export function reportToMarkdown(report: Report, projectName: string, date: string): string {
  const lines = [`# Compliance report: ${projectName}`, "", `Date: ${date}`, ""];
  if (report.state !== "ready") {
    lines.push(report.state === "no_plan" ? "No plan has been chosen yet." : `The plan does not fit the plot. ${report.reasons.en}`);
    return lines.join("\n") + "\n";
  }
  const s = report.summary;
  lines.push(`Total ${s.total}: ${s.fail} fail, ${s.warn} warn, ${s.pass} pass, ${s.notChecked} not checked.`, "");
  lines.push("RAJUK 2008 values are cited from the gazette; anything not cited is marked NOT CHECKED, not assumed.", "");
  const sections = ["rajuk", "plan", "fire", "access"] as const;
  const names = { rajuk: "RAJUK 2008 rules", plan: "Plan checks", fire: "Fire", access: "Accessibility" };
  for (const sec of sections) {
    const items = report.items.filter((i) => i.section === sec);
    if (!items.length) continue;
    lines.push(`## ${names[sec]}`, "", "| Check | Result | Required | Actual | Basis |", "|---|---|---|---|---|");
    for (const i of items as ReportItem[]) {
      const basis = i.citation ? i.citation.en : i.note ? i.note.en : "";
      lines.push(`| ${i.title.en} | ${STATUS_WORD[i.status] ?? i.status} | ${val(i.expected)} | ${val(i.actual)} | ${basis.replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function assumptionsMarkdown(opts: { rateCard: { cardId: string; status: string; effectiveFrom: string; sourceName: string }; structureOk: boolean; supported?: boolean; storeys?: number }): string {
  const L: string[] = ["# Assumptions and limits", "", "This is a screening package from ArchResidenceBD. It is not final design and is not a substitute for drawings and calculations signed by licensed architects and engineers.", ""];
  L.push("## Structure (EN)", "");
  for (const a of ASSUMPTIONS) L.push(`- ${a.en}`);
  if (opts.supported === false) L.push("", `**NOT DESIGNED: this building has ${opts.storeys ?? "more than the supported number of"} storeys, above the ${SUPPORTED_MAX_STOREYS} the structure engine designs. A frame alone drifts too much and core shear walls are not modelled. Steel, concrete and BOQ quantities in this package are indicative only; a structural engineer must design the structure.**`);
  L.push("", `Structure result: ${opts.structureOk ? "every member passes the screening checks" : "some members FAIL the screening checks; see the Structure screen"}.`, "");
  L.push("## Quantities and prices (EN)", "");
  for (const a of BOQ_ASSUMPTIONS) L.push(`- ${a.en}`);
  L.push("", `Rate card: ${opts.rateCard.cardId}, status ${opts.rateCard.status}, effective ${opts.rateCard.effectiveFrom}, source ${opts.rateCard.sourceName}.`, "");
  L.push("## Drawings (EN)", "", "- Sections and elevations are schematic. Window sill is 900 mm and window height 1200 mm (assumptions); doors are not drawn on elevations.", "- DXF files are AutoCAD R12 ASCII in millimetres; text is English only.", "");
  L.push("## কাঠামো (BN)", "");
  for (const a of ASSUMPTIONS) L.push(`- ${a.bn}`);
  L.push("", "## পরিমাণ ও দাম (BN)", "");
  for (const a of BOQ_ASSUMPTIONS) L.push(`- ${a.bn}`);
  L.push("", "## ড্রয়িং (BN)", "", "- সেকশন ও এলিভেশন প্রাথমিক। জানালার সিল ৯০০ মিমি ও উচ্চতা ১২০০ মিমি (অনুমান); এলিভেশনে দরজা আঁকা হয়নি।", "- ডিএক্সএফ ফাইল অটোক্যাড আর১২ এএসসিআইআই, মিলিমিটারে; লেখা কেবল ইংরেজিতে।", "");
  return L.join("\n");
}

export function indexMarkdown(projectName: string, date: string, files: PackageFile[]): string {
  const L = [`# Permit package: ${projectName}`, "", `Date: ${date}`, "", "Screening package from ArchResidenceBD. Not for construction; not a signed submission. Drawings and calculations must be checked and signed by licensed professionals before they go to RAJUK.", "", "## Files", ""];
  for (const f of files) L.push(`- ${f.path}`);
  return L.join("\n") + "\n";
}

/** Builds every file of the package for a project whose plan fits the plot. */
export function buildPermitPackage(project: BuildingProject, model: BuildingModel, date: string, lang: Lang = "en", extra: PackageFile[] = []): PackageFile[] {
  const res = analyzeStructure(model);
  const bbs = buildBbs(res, model);
  const boq = buildBoq(model, bbs);
  const name = project.name || "Project";
  const files: PackageFile[] = [];

  for (const sheet of buildSheets(model, res, name, date, "en")) {
    files.push({ path: `drawings/${sheet.sheetNo}-${sheet.id}.dxf`, mime: "application/dxf", text: sceneToDxf(sheet.scene) });
  }
  // SVGs in the chosen language; the floor plans use the richer plan renderer.
  for (const sheet of buildSheets(model, res, name, date, lang)) {
    const planMatch = /^plan-(\d+)$/.exec(sheet.id);
    const svg = planMatch ? renderPlanSvg(model.storeys[Number(planMatch[1])].geometry, { lang }) : sceneToSvg(sheet.scene);
    files.push({ path: `drawings/${sheet.sheetNo}-${sheet.id}.svg`, mime: "image/svg+xml", text: svg });
  }
  files.push(...extra); // e.g. the PDF drawing set, built asynchronously by buildPermitPackageWithPdf
  files.push({ path: "boq/boq.csv", mime: "text/csv", text: boqToCsv(boq) });
  files.push({ path: "structure/bar-schedule.csv", mime: "text/csv", text: bbsToCsv(bbs.rows) });
  files.push({ path: "compliance/report.md", mime: "text/markdown", text: reportToMarkdown(buildReport(project), name, date) });
  files.push({
    path: "assumptions.md",
    mime: "text/markdown",
    text: assumptionsMarkdown({ rateCard: { cardId: boq.card.cardId, status: boq.card.status, effectiveFrom: boq.card.effectiveFrom, sourceName: boq.card.source.name }, structureOk: res.ok, supported: res.supported, storeys: model.storeys.length }),
  });
  files.unshift({ path: "README.md", mime: "text/markdown", text: indexMarkdown(name, date, files) });
  return files;
}

/** The package with a PDF drawing set (all sheets, A3) in drawings/. Loads pdf-lib and the fonts on demand. */
export async function buildPermitPackageWithPdf(project: BuildingProject, model: BuildingModel, date: string, lang: Lang = "en"): Promise<PackageFile[]> {
  const [{ sheetsToPdf }, { loadPdfFonts }] = await Promise.all([import("./pdf"), import("./pdfFonts")]);
  const name = project.name || "Project";
  const sheets = buildSheets(model, analyzeStructure(model), name, date, lang);
  const pdf = await sheetsToPdf(sheets, { paper: "A3", fonts: await loadPdfFonts(), title: `${name}: drawings` });
  return buildPermitPackage(project, model, date, lang, [{ path: "drawings/drawings-A3.pdf", mime: "application/pdf", text: "", data: pdf }]);
}

export function packageToZip(files: PackageFile[], date: string): Uint8Array {
  const enc = new TextEncoder();
  return makeZip(files.map((f) => ({ name: f.path, data: f.data ?? enc.encode(f.text) })), date);
}
