/**
 * Draws a fitted plan as an SVG string: rooms with names and net areas, walls at their real
 * thickness, door openings with swings, windows, structural grid lines with labels, columns and
 * bay dimensions. The road side (y = 0) is drawn at the bottom, as on a site plan.
 *
 * Colours are CSS variables with fallbacks, so the same SVG follows the app theme inline and still
 * prints correctly as a standalone file.
 */

import type { FloorGeometry, Opening, WallSegment } from "./geometry";
import { doorLeaf, OUTSIDE } from "./geometry";
import type { RoomKind } from "./types";

export interface RenderOptions {
  lang?: "en" | "bn";
  /** Pixels per metre. */
  scale?: number;
  showGrid?: boolean;
  showDimensions?: boolean;
  /** Column marker size, mm (until M4 sizes the real columns). */
  columnMm?: number;
}

const FILL: Partial<Record<RoomKind, string>> = {
  bedroom: "var(--plan-bed, #e8edf8)",
  living: "var(--plan-living, #e3ece6)",
  dining: "var(--plan-living, #e3ece6)",
  kitchen: "var(--plan-wet, #f6efdc)",
  toilet: "var(--plan-wet, #f6efdc)",
  corridor: "var(--plan-circ, #f3f5f9)",
  lobby: "var(--plan-core, #e6e3f1)",
  stair: "var(--plan-core, #e6e3f1)",
  lift: "var(--plan-core, #e6e3f1)",
  shaft: "var(--plan-void, #ffffff)",
  store: "var(--plan-circ, #f3f5f9)",
  parking: "var(--plan-circ, #f3f5f9)",
  driveway: "var(--plan-circ, #f3f5f9)",
  guard: "var(--plan-core, #e6e3f1)",
};

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const digits = (s: string, lang: "en" | "bn") => (lang === "bn" ? s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : s);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderPlanSvg(geo: FloorGeometry, opts: RenderOptions = {}): string {
  const f = geo.fitted;
  const lang = opts.lang ?? "en";
  const s = (opts.scale ?? 40) / 1000; // px per mm
  const pad = 70;
  const W = f.widthMm * s;
  const H = f.depthMm * s;
  const X = (mm: number) => pad + mm * s;
  const Y = (mm: number) => pad + (f.depthMm - mm) * s; // road side at the bottom
  const out: string[] = [];
  const fmt = (n: number, d = 2) => digits(n.toFixed(d), lang);

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(W + 2 * pad)} ${Math.ceil(H + 2 * pad)}" width="${Math.ceil(W + 2 * pad)}" height="${Math.ceil(H + 2 * pad)}" font-family="var(--font-ui, 'Noto Sans', 'Noto Sans Bengali', sans-serif)" role="img" aria-label="${esc(f.plan.name[lang])}">`,
    `<rect width="100%" height="100%" fill="var(--paper, #ffffff)"/>`,
  );

  // Rooms.
  f.rooms.forEach((room, i) => {
    for (const r of room.rects)
      out.push(`<rect x="${X(r.x0)}" y="${Y(r.y1)}" width="${(r.x1 - r.x0) * s}" height="${(r.y1 - r.y0) * s}" fill="${FILL[room.def.kind] ?? "#f3f5f9"}"/>`);
    if (room.def.kind === "shaft") {
      const r = room.rects[0];
      out.push(`<path d="M${X(r.x0)} ${Y(r.y0)} L${X(r.x1)} ${Y(r.y1)} M${X(r.x0)} ${Y(r.y1)} L${X(r.x1)} ${Y(r.y0)}" stroke="var(--line-strong, #cdd2dd)" stroke-width="1"/>`);
    }
    // Label at the centre of the largest rect.
    const r = [...room.rects].sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))[0];
    const cx = X((r.x0 + r.x1) / 2);
    const cy = Y((r.y0 + r.y1) / 2);
    const met = geo.metrics[i];
    const small = Math.min((r.x1 - r.x0) * s, (r.y1 - r.y0) * s) < 70;
    // Dwelling letters are shown by position on the drawing, so names drop their "A "/"B " prefix.
    const raw = room.def.name[lang].replace(/^[A-Z] /, "").replace(/^(এ|বি|সি|ডি) /, "");
    const name = raw.charAt(0).toUpperCase() + raw.slice(1);
    out.push(
      `<text x="${cx}" y="${cy - (small ? 0 : 6)}" text-anchor="middle" font-size="${small ? 10 : 12}" font-weight="600" fill="var(--ink, #171c29)">${esc(name)}</text>`,
    );
    if (!small && room.def.kind !== "shaft")
      out.push(`<text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="10.5" fill="var(--ink-soft, #4e5668)">${fmt(met.netAreaM2, 1)} m²</text>`);
  });

  // Walls at real thickness.
  const wallRect = (w: WallSegment) => {
    const t = w.thicknessMm;
    return w.orientation === "v"
      ? { x: X(w.at - t / 2), y: Y(w.to), w: t * s, h: (w.to - w.from) * s }
      : { x: X(w.from), y: Y(w.at + t / 2), w: (w.to - w.from) * s, h: t * s };
  };
  for (const w of geo.walls) {
    const r = wallRect(w);
    out.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="var(--ink, #171c29)"/>`);
  }

  // Openings: cut the wall, then draw the door swing or the window glazing lines.
  const cut = (o: Opening, thick: number) =>
    o.orientation === "v"
      ? { x: X(o.at - thick / 2) - 0.5, y: Y(o.to), w: thick * s + 1, h: (o.to - o.from) * s }
      : { x: X(o.from), y: Y(o.at + thick / 2) - 0.5, w: (o.to - o.from) * s, h: thick * s + 1 };
  for (const d of geo.doors) {
    const c = cut(d, 260);
    out.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="var(--paper, #ffffff)"/>`);
    // A hinged door swings into the room it protects (see opensInto); a lift door slides and has no leaf.
    const leaf = doorLeaf(d);
    if (leaf) {
      const r = leaf.lengthMm * s;
      const [hx, hy] = [X(leaf.hinge[0]), Y(leaf.hinge[1])];
      const [cx, cy] = [X(leaf.closed[0]), Y(leaf.closed[1])];
      const [tx, ty] = [X(leaf.open[0]), Y(leaf.open[1])];
      const sweep = (cx - hx) * (ty - hy) - (cy - hy) * (tx - hx) > 0 ? 1 : 0;
      out.push(`<path d="M${hx} ${hy} L${tx} ${ty} M${cx} ${cy} A${r} ${r} 0 0 ${sweep} ${tx} ${ty}" fill="none" stroke="var(--ink-soft, #4e5668)" stroke-width="0.8"/>`);
    }
    if (d.main) {
      const mx = d.orientation === "v" ? X(d.at) : X((d.from + d.to) / 2);
      const my = d.orientation === "v" ? Y((d.from + d.to) / 2) : Y(d.at);
      out.push(`<circle cx="${mx}" cy="${my}" r="3.5" fill="var(--primary, #2e4fa3)"/>`);
    }
  }
  for (const w of geo.windows) {
    const c = cut(w, 250);
    out.push(`<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="var(--paper, #ffffff)" stroke="var(--ink, #171c29)" stroke-width="0.8"/>`);
    if (w.orientation === "v") out.push(`<line x1="${X(w.at)}" y1="${Y(w.to)}" x2="${X(w.at)}" y2="${Y(w.from)}" stroke="var(--ink, #171c29)" stroke-width="0.8"/>`);
    else out.push(`<line x1="${X(w.from)}" y1="${Y(w.at)}" x2="${X(w.to)}" y2="${Y(w.at)}" stroke="var(--ink, #171c29)" stroke-width="0.8"/>`);
  }

  // Structural grid and columns.
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  if (opts.showGrid !== false) {
    f.structuralX.forEach((gx, k) => {
      const x = X(f.xLines[gx]);
      out.push(`<line x1="${x}" y1="${pad - 34}" x2="${x}" y2="${pad + H + 6}" stroke="var(--primary, #2e4fa3)" stroke-width="0.6" stroke-dasharray="6 4" opacity="0.7"/>`);
      out.push(`<circle cx="${x}" cy="${pad - 44}" r="9" fill="var(--paper, #fff)" stroke="var(--primary, #2e4fa3)" stroke-width="1"/>`);
      out.push(`<text x="${x}" y="${pad - 40}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--primary-ink, #233d80)">${letters[k]}</text>`);
    });
    f.structuralY.forEach((gy, k) => {
      const y = Y(f.yLines[gy]);
      out.push(`<line x1="${pad - 34}" y1="${y}" x2="${pad + W + 6}" y2="${y}" stroke="var(--primary, #2e4fa3)" stroke-width="0.6" stroke-dasharray="6 4" opacity="0.7"/>`);
      out.push(`<circle cx="${pad - 44}" cy="${y}" r="9" fill="var(--paper, #fff)" stroke="var(--primary, #2e4fa3)" stroke-width="1"/>`);
      out.push(`<text x="${pad - 44}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="600" fill="var(--primary-ink, #233d80)">${digits(String(k + 1), lang)}</text>`);
    });
    const c = (opts.columnMm ?? 300) * s;
    for (const col of geo.columns) out.push(`<rect x="${X(col.x) - c / 2}" y="${Y(col.y) - c / 2}" width="${c}" height="${c}" fill="var(--primary, #2e4fa3)"/>`);
  }

  // Bay dimensions along the bottom (road side) and the right.
  if (opts.showDimensions !== false) {
    const yd = pad + H + 22;
    for (let i = 1; i < f.xLines.length; i++) {
      const a = X(f.xLines[i - 1]);
      const b = X(f.xLines[i]);
      out.push(`<line x1="${a}" y1="${yd}" x2="${b}" y2="${yd}" stroke="var(--ink-faint, #626a7d)" stroke-width="0.8"/><line x1="${a}" y1="${yd - 4}" x2="${a}" y2="${yd + 4}" stroke="var(--ink-faint, #626a7d)" stroke-width="0.8"/>`);
      out.push(`<text x="${(a + b) / 2}" y="${yd - 4}" text-anchor="middle" font-size="9.5" fill="var(--ink-soft, #4e5668)">${fmt((f.xLines[i] - f.xLines[i - 1]) / 1000)}</text>`);
    }
    out.push(`<line x1="${X(f.widthMm)}" y1="${yd - 4}" x2="${X(f.widthMm)}" y2="${yd + 4}" stroke="var(--ink-faint, #626a7d)" stroke-width="0.8"/>`);
    out.push(`<text x="${pad + W / 2}" y="${yd + 18}" text-anchor="middle" font-size="10.5" font-weight="600" fill="var(--ink, #171c29)">${fmt(f.widthMm / 1000)} m</text>`);
    const xd = pad + W + 22;
    for (let i = 1; i < f.yLines.length; i++) {
      const a = Y(f.yLines[i - 1]);
      const b = Y(f.yLines[i]);
      out.push(`<line x1="${xd}" y1="${a}" x2="${xd}" y2="${b}" stroke="var(--ink-faint, #626a7d)" stroke-width="0.8"/><line x1="${xd - 4}" y1="${a}" x2="${xd + 4}" y2="${a}" stroke="var(--ink-faint, #626a7d)" stroke-width="0.8"/>`);
      out.push(`<text x="${xd + 6}" y="${(a + b) / 2 + 3}" font-size="9.5" fill="var(--ink-soft, #4e5668)">${fmt((f.yLines[i] - f.yLines[i - 1]) / 1000)}</text>`);
    }
    out.push(`<text x="${pad + W / 2}" y="${pad + H + 58}" text-anchor="middle" font-size="10" letter-spacing="0.5" fill="var(--ink-faint, #626a7d)">${lang === "bn" ? "রাস্তা" : "ROAD"}</text>`);
  }

  out.push("</svg>");
  return out.join("\n");
}

/** Room indices that touch the outside (for callers that colour facades). */
export function exteriorRooms(geo: FloorGeometry): Set<number> {
  const set = new Set<number>();
  for (const w of geo.walls) if (w.exterior) set.add(w.a === OUTSIDE ? w.b : w.a);
  return set;
}
