import type { BbsRow } from "./bbs";

/** The schedule as CSV text: one line per row, dimensions in separate columns. */
export function bbsToCsv(rows: BbsRow[]): string {
  const head = ["mark", "member", "description", "dia_mm", "shape", "A_mm", "B_mm", "C_mm", "cut_length_mm", "bars_per_member", "members", "total_bars", "total_length_m", "weight_kg"];
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.mark, r.family, q(r.description.en), r.diaMm, r.shape, r.dimsMm[0] ?? "", r.dimsMm[1] ?? "", r.dimsMm[2] ?? "", r.cutLengthMm, r.barsPerMember, r.members, r.totalBars, r.totalLengthM.toFixed(2), r.weightKg.toFixed(1)].join(","));
  return [head.join(","), ...lines].join("\n");
}
