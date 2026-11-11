/**
 * PDF sheets from the drawing scenes (P1-3). Vector output at a standard scale on A3 or A4 landscape, with a frame, the
 * scale and the sheet number. Built with pdf-lib (no DOM, works offline) and Noto Sans / Noto Sans Bengali embedded as
 * subsets, so English and Bangla titles both print. The library and the fonts load on demand (dynamic import) so the
 * first-load bundle does not grow.
 */

import { bounds, LAYERS, type Entity, type Scene } from "./scene";
import type { Sheet } from "./permit";

export type Paper = "A3" | "A4";

/** Paper size in mm, landscape. */
export const PAPER_MM: Record<Paper, { w: number; h: number }> = { A3: { w: 420, h: 297 }, A4: { w: 297, h: 210 } };
/** Drawing scales tried from the largest drawing to the smallest; the first that fits is used. */
export const SCALES = [20, 50, 100, 150, 200, 250, 500, 1000, 2000] as const;
const MARGIN_MM = 10;
const PT_PER_MM = 72 / 25.4;

export interface FontBytes {
  latin: Uint8Array;
  bengali: Uint8Array;
}

/** The smallest standard scale denominator at which a drawing of this size (mm) fits the paper inside its frame. */
export function chooseScale(widthMm: number, heightMm: number, paper: Paper): number {
  const area = { w: PAPER_MM[paper].w - 2 * MARGIN_MM - 4, h: PAPER_MM[paper].h - 2 * MARGIN_MM - 10 };
  return SCALES.find((s) => widthMm / s <= area.w && heightMm / s <= area.h) ?? SCALES[SCALES.length - 1];
}

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Bangla letters and digits (U+0980 to U+09FF) and the danda and double danda (U+0964, U+0965). */
const BENGALI = /[।॥ঀ-৿]/;
/** Text split into runs of one script, so each run can use its own font. */
export function scriptRuns(text: string): Array<{ text: string; bengali: boolean }> {
  // Only Bangla letters and Bangla digits use the Bangla font; spaces, ASCII digits and punctuation use the Latin font,
  // because the Bangla font file has no glyphs for them (they would print as empty boxes).
  const runs: Array<{ text: string; bengali: boolean }> = [];
  for (const ch of text) {
    const isBn = BENGALI.test(ch);
    const last = runs[runs.length - 1];
    if (last && last.bengali === isBn) last.text += ch;
    else runs.push({ text: ch, bengali: isBn });
  }
  return runs;
}

/** The title-block scale line says "fit to sheet"; in a PDF the scale is known, so say it. */
function withScaleText(e: Entity, scale: number, paper: Paper): Entity {
  if (e.kind !== "text") return e;
  const en = "1 unit = 1 mm (fit to sheet when plotting)";
  const bn = "১ একক = ১ মিমি (প্লটের সময় শিটে বসান)";
  const label = `1:${scale} @ ${paper}`;
  return e.text.includes(en) ? { ...e, text: e.text.replace(en, label) } : e.text.includes(bn) ? { ...e, text: e.text.replace(bn, label) } : e;
}

/** One PDF holding every sheet, one page per sheet. `fonts` are the Noto Sans (latin) and Noto Sans Bengali font files. */
export async function sheetsToPdf(sheets: Sheet[], opts: { paper?: Paper; fonts: FontBytes; title?: string }): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await import("pdf-lib");
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  const paper = opts.paper ?? "A3";
  // The shaping code for Indic scripts (Bangla) in fontkit uses generators compiled with regenerator-runtime.
  await import("regenerator-runtime/runtime");
  // updateMetadata: false keeps our producer and title (pdf-lib would otherwise stamp its own on save).
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setTitle(opts.title ?? "ArchResidenceBD drawings");
  doc.setProducer("ArchResidenceBD");
  doc.setCreator("ArchResidenceBD");
  const latin = await doc.embedFont(opts.fonts.latin, { subset: true });
  const bengali = await doc.embedFont(opts.fonts.bengali, { subset: true });

  const pageW = PAPER_MM[paper].w * PT_PER_MM;
  const pageH = PAPER_MM[paper].h * PT_PER_MM;
  const m = MARGIN_MM * PT_PER_MM;

  for (const sheet of sheets) {
    const b = bounds(sheet.scene.entities);
    const wMm = b.maxX - b.minX;
    const hMm = b.maxY - b.minY;
    const scale = chooseScale(wMm, hMm, paper);
    const k = PT_PER_MM / scale; // drawing mm -> PDF points
    const page = doc.addPage([pageW, pageH]);
    // frame
    page.drawRectangle({ x: m, y: m, width: pageW - 2 * m, height: pageH - 2 * m, borderColor: rgb(0.1, 0.11, 0.16), borderWidth: 1.2 });
    // drawing centred in the frame (a strip at the bottom is kept for the sheet line)
    const strip = 8 * PT_PER_MM;
    const ox = m + (pageW - 2 * m - wMm * k) / 2 - b.minX * k;
    const oy = m + strip + (pageH - 2 * m - strip - hMm * k) / 2 - b.minY * k;
    const X = (x: number) => ox + x * k;
    const Y = (y: number) => oy + y * k;

    for (const raw of sheet.scene.entities) {
      const e = withScaleText(raw, scale, paper);
      const L = LAYERS[e.layer] ?? LAYERS.OUTLINE;
      const [r, g, bl] = hexToRgb(L.stroke);
      const thickness = Math.max(0.25, L.weightMm * k);
      const dash = L.dashed ? [L.weightMm * 6 * k, L.weightMm * 4 * k] : undefined;
      if (e.kind === "line") {
        page.drawLine({ start: { x: X(e.x1), y: Y(e.y1) }, end: { x: X(e.x2), y: Y(e.y2) }, thickness, color: rgb(r, g, bl), dashArray: dash });
      } else if (e.kind === "poly") {
        if (e.pts.length < 2) continue;
        const path = e.pts.map(([x, y], i) => `${i ? "L" : "M"} ${X(x).toFixed(2)} ${(-Y(y)).toFixed(2)}`).join(" ") + (e.closed ? " Z" : "");
        const fill = e.fill ? hexToRgb(e.fill) : null;
        page.drawSvgPath(path, { x: 0, y: 0, borderColor: rgb(r, g, bl), borderWidth: thickness, borderDashArray: dash, ...(fill ? { color: rgb(fill[0], fill[1], fill[2]) } : {}) });
      } else {
        const size = Math.max(2, e.h * k);
        const runs = scriptRuns(e.text);
        const widths = runs.map((run) => (run.bengali ? bengali : latin).widthOfTextAtSize(run.text, size));
        const total = widths.reduce((a, w) => a + w, 0);
        let x = X(e.x) - (e.anchor === "middle" ? total / 2 : e.anchor === "end" ? total : 0);
        runs.forEach((run, i) => {
          page.drawText(run.text, { x, y: Y(e.y), size, font: run.bengali ? bengali : latin, color: rgb(r, g, bl) });
          x += widths[i];
        });
      }
    }
    // sheet line under the frame
    page.drawText(`${sheet.sheetNo}   1:${scale}   ${paper}`, { x: m + 6, y: m + 4, size: 7, font: latin, color: rgb(0.3, 0.33, 0.4) });
  }
  return doc.save();
}
