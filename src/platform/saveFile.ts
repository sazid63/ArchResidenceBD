/**
 * Saving and opening files: one place for every export and import.
 *
 * In the desktop app (Tauri) the user gets the native Save / Open dialog and the app reads or writes only the file they pick
 * (capability `src-tauri/capabilities/default.json`). In the browser it is a download and a file picker. Both paths return the
 * same result so screens do not care which one ran.
 */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export type SaveResult = { saved: true; where: "dialog" | "download"; path?: string } | { saved: false; cancelled: true };
export type OpenResult = { opened: true; name: string; text: string } | { opened: false; cancelled: true };

/** True when running inside the Tauri desktop shell. */
export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function browserDownload(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Save text or bytes under a suggested file name. */
export async function saveFile(name: string, data: string | Uint8Array, type: string, filters?: FileFilter[]): Promise<SaveResult> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile, writeTextFile } = await import("@tauri-apps/plugin-fs");
    const ext = name.includes(".") ? name.split(".").pop()! : "";
    const path = await save({ defaultPath: name, filters: filters ?? (ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : undefined) });
    if (!path) return { saved: false, cancelled: true };
    if (typeof data === "string") await writeTextFile(path, data);
    else await writeFile(path, data);
    return { saved: true, where: "dialog", path };
  }
  browserDownload(name, data as BlobPart, type);
  return { saved: true, where: "download" };
}

/** Let the user pick a file and read it as text. `accept` is the browser's accept list, e.g. ".archres,application/json". */
export async function openTextFile(accept: string, filters?: FileFilter[]): Promise<OpenResult> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const picked = await open({ multiple: false, filters });
    if (!picked || Array.isArray(picked)) return { opened: false, cancelled: true };
    const path = typeof picked === "string" ? picked : (picked as { path: string }).path;
    return { opened: true, name: path.split(/[\/]/).pop() ?? path, text: await readTextFile(path) };
  }
  return new Promise<OpenResult>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { opened: true, name: file.name, text: await file.text() } : { opened: false, cancelled: true });
    };
    input.oncancel = () => resolve({ opened: false, cancelled: true });
    input.click();
  });
}
