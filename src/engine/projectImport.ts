import { FILE_EXTENSION, importProjectFile } from "../model/projectFile";
import { openTextFile } from "../platform/saveFile";
import { addImportedSpecs } from "./projectState";

export interface ImportNotice {
  tone: "ok" | "bad";
  en: string;
  bn: string;
  added: number;
}

/** Let the user pick a project file, read it and add its projects to the saved ones. Null when they cancel. */
export async function pickAndImportProjects(): Promise<ImportNotice | null> {
  const picked = await openTextFile(`.${FILE_EXTENSION},application/json`, [{ name: "ArchResidenceBD project", extensions: [FILE_EXTENSION, "json"] }]);
  if (!picked.opened) return null;
  const result = importProjectFile(picked.text);
  if (!result.ok) return { tone: "bad", en: result.error.en, bn: result.error.bn, added: 0 };
  const added = addImportedSpecs(result.projects);
  const skipped = result.skipped;
  return {
    tone: "ok",
    added,
    en: `Imported ${added} project(s)${skipped ? `; ${skipped} could not be read` : ""}.`,
    bn: `${added}টি প্রজেক্ট আমদানি হয়েছে${skipped ? `; ${skipped}টি পড়া যায়নি` : ""}।`,
  };
}
