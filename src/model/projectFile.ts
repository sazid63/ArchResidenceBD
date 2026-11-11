/**
 * The .archres project file: one or more projects as JSON, with the format and app version, so a project can be backed up,
 * moved to another computer or sent to a colleague. Reading is defensive: a file is data from outside, so it is size-capped,
 * parsed, checked and migrated project by project; nothing is written until the caller accepts the result.
 */

import { ProjectFormatError, toProjectSpec } from "./migrate";
import { PROJECT_SCHEMA_VERSION, type ProjectSpec } from "./projectSpec";

export const FILE_FORMAT = "archres" as const;
export const FILE_EXTENSION = "archres";
/** Larger files are refused before parsing (a real project is well under 1 MB). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export interface ProjectFile {
  format: typeof FILE_FORMAT;
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  appVersion: string;
  exportedAt: string;
  projects: ProjectSpec[];
}

export type ImportError = { code: "too_big" | "not_json" | "not_archres" | "newer_version" | "empty"; en: string; bn: string };

export type ImportResult = { ok: true; projects: ProjectSpec[]; skipped: number } | { ok: false; error: ImportError };

export function exportProjects(projects: ProjectSpec[], appVersion: string, now: string = new Date().toISOString()): string {
  const file: ProjectFile = { format: FILE_FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, appVersion, exportedAt: now, projects };
  return JSON.stringify(file, null, 2);
}

/** A file name safe on Windows for a project, e.g. "Mirpur 5 katha" -> "Mirpur-5-katha.archres". */
export function projectFileName(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "project"}.${FILE_EXTENSION}`;
}

const err = (code: ImportError["code"], en: string, bn: string): ImportResult => ({ ok: false, error: { code, en, bn } });

export function importProjectFile(text: string, now: string = new Date().toISOString()): ImportResult {
  if (text.length > MAX_FILE_BYTES) return err("too_big", "This file is too large to be a project file.", "এই ফাইলটি প্রজেক্ট ফাইলের জন্য অনেক বড়।");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err("not_json", "This file is not readable: it is damaged or not an ArchResidenceBD file.", "ফাইলটি পড়া যায়নি: এটি নষ্ট অথবা আর্চরেসিডেন্সবিডি ফাইল নয়।");
  }
  if (!raw || typeof raw !== "object") return err("not_archres", "This is not an ArchResidenceBD project file.", "এটি আর্চরেসিডেন্সবিডি প্রজেক্ট ফাইল নয়।");
  const obj = raw as { format?: unknown; schemaVersion?: unknown; projects?: unknown };
  // A bare project (an older export or a copied record) is accepted as a one-project file.
  const items: unknown[] = obj.format === FILE_FORMAT && Array.isArray(obj.projects) ? obj.projects : obj.format === undefined && !Array.isArray(obj.projects) ? [raw] : [];
  if (obj.format === FILE_FORMAT && typeof obj.schemaVersion === "number" && obj.schemaVersion > PROJECT_SCHEMA_VERSION)
    return err("newer_version", `This file was saved by a newer version of ArchResidenceBD (format ${obj.schemaVersion}). Update the app to open it.`, `ফাইলটি আর্চরেসিডেন্সবিডির নতুন সংস্করণে সংরক্ষিত (ফরম্যাট ${obj.schemaVersion})। খুলতে অ্যাপ আপডেট করুন।`);
  if (obj.format !== undefined && obj.format !== FILE_FORMAT) return err("not_archres", "This is not an ArchResidenceBD project file.", "এটি আর্চরেসিডেন্সবিডি প্রজেক্ট ফাইল নয়।");
  if (items.length === 0) return err("empty", "The file holds no projects.", "ফাইলে কোনো প্রজেক্ট নেই।");

  const projects: ProjectSpec[] = [];
  let skipped = 0;
  for (const item of items) {
    try {
      projects.push(toProjectSpec(item, now));
    } catch (e) {
      if (e instanceof ProjectFormatError && e.reason === "newer_version")
        return err("newer_version", e.message, "ফাইলটি আর্চরেসিডেন্সবিডির নতুন সংস্করণে সংরক্ষিত। খুলতে অ্যাপ আপডেট করুন।");
      skipped += 1;
    }
  }
  if (projects.length === 0) return err("not_archres", "None of the projects in this file could be read.", "ফাইলের কোনো প্রজেক্টই পড়া যায়নি।");
  return { ok: true, projects, skipped };
}

/**
 * Add imported projects to the saved ones. A project whose id is already saved is imported as a copy with a new id and
 * "(imported)" in its name, so an import never overwrites existing work.
 */
export function mergeImported(existing: ProjectSpec[], imported: ProjectSpec[], newId: () => string): { merged: ProjectSpec[]; added: ProjectSpec[] } {
  const taken = new Set(existing.map((p) => p.project.id));
  const added = imported.map((p) => {
    if (!taken.has(p.project.id)) {
      taken.add(p.project.id);
      return p;
    }
    let id = newId();
    while (taken.has(id)) id = newId();
    taken.add(id);
    return { ...p, project: { ...p.project, id, name: `${p.project.name} (imported)` } };
  });
  return { merged: [...added, ...existing], added };
}
