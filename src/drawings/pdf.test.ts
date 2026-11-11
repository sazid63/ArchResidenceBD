import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "../structure/analyze";
import { buildSheets } from "./permit";
import { chooseScale, PAPER_MM, scriptRuns, sheetsToPdf, type FontBytes } from "./pdf";

const font = (p: string) => new Uint8Array(readFileSync(new URL(`../../node_modules/${p}`, import.meta.url)));
const fonts: FontBytes = { latin: font("@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"), bengali: font("@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff") };

const sheetsFor = (storeys: number, lang: "en" | "bn") => {
  const b = deriveBuilding({ plotWidthMm: 14000, plotDepthMm: 26000, storeys, planId: "p2-2b-fb" });
  if (!b.ok) throw new Error("fit");
  return buildSheets(b.model, analyzeStructure(b.model), "Test plot", "2026-11-12", lang);
};

describe("PDF drawing sheets", () => {
  it("has one A3 landscape page per sheet, the PDF header and the app as producer", async () => {
    const sheets = sheetsFor(4, "en");
    const bytes = await sheetsToPdf(sheets, { paper: "A3", fonts, title: "Test plot: drawings" });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBe(sheets.length);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo((PAPER_MM.A3.w * 72) / 25.4, 0);
    expect(height).toBeCloseTo((PAPER_MM.A3.h * 72) / 25.4, 0);
    expect(doc.getTitle()).toBe("Test plot: drawings");
    expect(doc.getProducer()).toBe("ArchResidenceBD");
  });

  it("stays small and renders Bangla sheets too", async () => {
    const bytes = await sheetsToPdf(sheetsFor(6, "bn"), { paper: "A4", fonts });
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getPageCount()).toBeGreaterThan(5);
  });

  it("picks the smallest standard scale that fits the paper", () => {
    expect(chooseScale(10000, 8000, "A3")).toBe(50); // 200 x 160 mm at 1:50
    expect(chooseScale(25000, 18000, "A3")).toBe(100);
    expect(chooseScale(30000, 20000, "A4")).toBe(150);
    expect(chooseScale(10_000_000, 10_000_000, "A3")).toBe(2000); // never fails, the largest scale
  });

  it("splits mixed English and Bangla text into runs per script", () => {
    expect(scriptRuns("Plan A-101")).toEqual([{ text: "Plan A-101", bengali: false }]);
    const runs = scriptRuns("নিচতলা Plan 2");
    expect(runs.map((r) => r.bengali)).toEqual([true, false]);
    expect(runs.map((r) => r.text).join("")).toBe("নিচতলা Plan 2");
  });
});
