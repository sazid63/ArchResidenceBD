import { saveFile } from "../platform/saveFile";

/** Save text as a file: a native Save dialog in the desktop app, a download in the browser (see platform/saveFile.ts). */
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8"): void {
  void saveFile(name, text, type);
}

/** A CSV cell: quoted when it holds a comma, quote or line break. */
export const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
