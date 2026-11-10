/**
 * A tiny 2D drawing scene (M5-2): lines, closed outlines and text on named layers, in millimetres
 * with y up. One scene writes both SVG and DXF, so the two files can't disagree.
 *
 * The DXF is AutoCAD R12 ASCII (LINE, POLYLINE/VERTEX/SEQEND, TEXT) which every CAD program opens
 * and which needs no handles. R12 text is ASCII only: Bengali text is written to the SVG, and the
 * DXF carries the English text (the sheet builders pass `lang: "en"` for DXF).
 */

export interface Layer {
  name: string;
  /** AutoCAD colour index (1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta, 7 white/black). */
  aci: number;
  /** SVG stroke colour. */
  stroke: string;
  /** SVG stroke width in mm of drawing space. */
  weightMm: number;
  dashed?: boolean;
}

export const LAYERS: Record<string, Layer> = {
  WALLS: { name: "WALLS", aci: 7, stroke: "#171c29", weightMm: 30 },
  CUT: { name: "CUT", aci: 7, stroke: "#171c29", weightMm: 45 },
  DOORS: { name: "DOORS", aci: 3, stroke: "#2f7d4f", weightMm: 20 },
  WINDOWS: { name: "WINDOWS", aci: 4, stroke: "#2e6fa3", weightMm: 20 },
  PARKING: { name: "PARKING", aci: 8, stroke: "#4e5668", weightMm: 15 },
  COLUMNS: { name: "COLUMNS", aci: 1, stroke: "#b3402d", weightMm: 30 },
  OUTLINE: { name: "OUTLINE", aci: 7, stroke: "#171c29", weightMm: 35 },
  SITE: { name: "SITE", aci: 2, stroke: "#8a6a12", weightMm: 25 },
  SETBACK: { name: "SETBACK", aci: 6, stroke: "#8a3ea3", weightMm: 20, dashed: true },
  LEVELS: { name: "LEVELS", aci: 5, stroke: "#2e4fa3", weightMm: 12, dashed: true },
  GROUND: { name: "GROUND", aci: 8, stroke: "#4e5668", weightMm: 50 },
  DIMENSIONS: { name: "DIMENSIONS", aci: 5, stroke: "#2e4fa3", weightMm: 10 },
  TEXT: { name: "TEXT", aci: 7, stroke: "#171c29", weightMm: 10 },
  TITLE: { name: "TITLE", aci: 7, stroke: "#171c29", weightMm: 15 },
};

export interface LineEnt {
  kind: "line";
  layer: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface PolyEnt {
  kind: "poly";
  layer: string;
  pts: Array<[number, number]>;
  closed: boolean;
  /** SVG fill, e.g. a wall cut hatch; DXF ignores it. */
  fill?: string;
}
export interface TextEnt {
  kind: "text";
  layer: string;
  x: number;
  y: number;
  /** Text height, mm of drawing space. */
  h: number;
  text: string;
  anchor?: "start" | "middle" | "end";
}
export type Entity = LineEnt | PolyEnt | TextEnt;

export interface Scene {
  id: string;
  title: string;
  entities: Entity[];
}

/** Text heights passed to the builder are nominal; drawn text is this much larger so it reads when a whole building is fitted to a screen. */
export const TEXT_SCALE = 1.6;

export class SceneBuilder {
  readonly entities: Entity[] = [];
  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.entities.push({ kind: "line", layer, x1, y1, x2, y2 });
  }
  rect(layer: string, x0: number, y0: number, x1: number, y1: number, fill?: string) {
    this.entities.push({ kind: "poly", layer, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], closed: true, fill });
  }
  poly(layer: string, pts: Array<[number, number]>, closed = true, fill?: string) {
    this.entities.push({ kind: "poly", layer, pts, closed, fill });
  }
  text(layer: string, x: number, y: number, h: number, text: string, anchor: "start" | "middle" | "end" = "start") {
    this.entities.push({ kind: "text", layer, x, y, h: h * TEXT_SCALE, text, anchor });
  }
  /** A horizontal or vertical dimension line with end ticks and its value in mm, offset from the measured edge. */
  dimension(x1: number, y1: number, x2: number, y2: number, label: string, textH = 150) {
    this.line("DIMENSIONS", x1, y1, x2, y2);
    const t = 80;
    if (y1 === y2) {
      this.line("DIMENSIONS", x1, y1 - t, x1, y1 + t);
      this.line("DIMENSIONS", x2, y2 - t, x2, y2 + t);
      this.text("DIMENSIONS", (x1 + x2) / 2, y1 + 60, textH, label, "middle");
    } else {
      this.line("DIMENSIONS", x1 - t, y1, x1 + t, y1);
      this.line("DIMENSIONS", x2 - t, y2, x2 + t, y2);
      this.text("DIMENSIONS", x1 - 60, (y1 + y2) / 2, textH, label, "end");
    }
  }
  scene(id: string, title: string): Scene {
    return { id, title, entities: this.entities };
  }
}

export function bounds(entities: Entity[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const e of entities) {
    if (e.kind === "line") {
      add(e.x1, e.y1);
      add(e.x2, e.y2);
    } else if (e.kind === "poly") {
      for (const [x, y] of e.pts) add(x, y);
    } else {
      const w = e.text.length * e.h * 0.6;
      const x0 = e.anchor === "middle" ? e.x - w / 2 : e.anchor === "end" ? e.x - w : e.x;
      add(x0, e.y - e.h * 0.2);
      add(x0 + w, e.y + e.h);
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

export const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const num = (n: number) => String(Math.round(n * 100) / 100);

/** SVG of a scene: y is flipped so the drawing reads right way up; stroke widths are in drawing mm. */
export function sceneToSvg(scene: Scene): string {
  const b = bounds(scene.entities);
  const pad = 400;
  const x0 = b.minX - pad;
  const w = b.maxX - b.minX + 2 * pad;
  const h = b.maxY - b.minY + 2 * pad;
  const Y = (y: number) => b.maxY + pad - y; // flip inside the padded box: maxY lands at pad, minY at h - pad
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(x0)} 0 ${num(w)} ${num(h)}" width="100%" role="img" aria-label="${escapeXml(scene.title)}" font-family="'Noto Sans','Noto Sans Bengali',Arial,sans-serif">`,
    `<title>${escapeXml(scene.title)}</title>`,
    `<rect x="${num(x0)}" y="0" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>`,
  );
  const yy = (y: number) => num(Y(y));
  for (const e of scene.entities) {
    const L = LAYERS[e.layer] ?? LAYERS.OUTLINE;
    const dash = L.dashed ? ` stroke-dasharray="${L.weightMm * 6} ${L.weightMm * 4}"` : "";
    if (e.kind === "line") {
      out.push(`<line x1="${num(e.x1)}" y1="${yy(e.y1)}" x2="${num(e.x2)}" y2="${yy(e.y2)}" stroke="${L.stroke}" stroke-width="${L.weightMm}"${dash}/>`);
    } else if (e.kind === "poly") {
      const pts = e.pts.map(([x, y]) => `${num(x)},${yy(y)}`).join(" ");
      const tag = e.closed ? "polygon" : "polyline";
      out.push(`<${tag} points="${pts}" fill="${e.fill ?? "none"}" stroke="${L.stroke}" stroke-width="${L.weightMm}" stroke-linejoin="round"${dash}/>`);
    } else {
      out.push(`<text x="${num(e.x)}" y="${yy(e.y)}" font-size="${num(e.h)}" text-anchor="${e.anchor ?? "start"}" fill="${L.stroke}">${escapeXml(e.text)}</text>`);
    }
  }
  out.push("</svg>");
  return out.join("\n");
}

const asciiOnly = (s: string) => s.replace(/[^\x20-\x7e]/g, "?");

/** AutoCAD R12 ASCII DXF of a scene, millimetres, y up. */
export function sceneToDxf(scene: Scene): string {
  const used = [...new Set(scene.entities.map((e) => e.layer))];
  const g: Array<string | number> = [];
  const pair = (code: number, v: string | number) => g.push(code, v);
  const d = (n: number) => num(n);

  pair(0, "SECTION");
  pair(2, "HEADER");
  pair(9, "$ACADVER");
  pair(1, "AC1009");
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "TABLES");
  pair(0, "TABLE");
  pair(2, "LTYPE");
  pair(70, 1);
  pair(0, "LTYPE");
  pair(2, "CONTINUOUS");
  pair(70, 0);
  pair(3, "Solid line");
  pair(72, 65);
  pair(73, 0);
  pair(40, 0);
  pair(0, "ENDTAB");
  pair(0, "TABLE");
  pair(2, "LAYER");
  pair(70, used.length);
  for (const name of used) {
    pair(0, "LAYER");
    pair(2, name);
    pair(70, 0);
    pair(62, (LAYERS[name] ?? LAYERS.OUTLINE).aci);
    pair(6, "CONTINUOUS");
  }
  pair(0, "ENDTAB");
  pair(0, "ENDSEC");
  pair(0, "SECTION");
  pair(2, "ENTITIES");
  for (const e of scene.entities) {
    if (e.kind === "line") {
      pair(0, "LINE");
      pair(8, e.layer);
      pair(10, d(e.x1));
      pair(20, d(e.y1));
      pair(30, 0);
      pair(11, d(e.x2));
      pair(21, d(e.y2));
      pair(31, 0);
    } else if (e.kind === "poly") {
      pair(0, "POLYLINE");
      pair(8, e.layer);
      pair(66, 1);
      pair(70, e.closed ? 1 : 0);
      for (const [x, y] of e.pts) {
        pair(0, "VERTEX");
        pair(8, e.layer);
        pair(10, d(x));
        pair(20, d(y));
        pair(30, 0);
      }
      pair(0, "SEQEND");
      pair(8, e.layer);
    } else {
      pair(0, "TEXT");
      pair(8, e.layer);
      pair(10, d(e.x));
      pair(20, d(e.y));
      pair(30, 0);
      pair(40, d(e.h));
      pair(1, asciiOnly(e.text));
      if (e.anchor && e.anchor !== "start") {
        // Alignment point for centred / right text: horizontal justification 1 = centre, 2 = right.
        pair(72, e.anchor === "middle" ? 1 : 2);
        pair(11, d(e.x));
        pair(21, d(e.y));
        pair(31, 0);
      }
    }
  }
  pair(0, "ENDSEC");
  pair(0, "EOF");
  return g.join("\n") + "\n";
}
