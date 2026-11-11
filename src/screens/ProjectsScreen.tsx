import { useState, useEffect } from "react";
import { fmtNum, useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";
import { getSavedProjects, getSavedSpecs, addImportedSpecs, deleteSavedProject } from "../engine/projectState";
import { exportProjects, importProjectFile, projectFileName, FILE_EXTENSION } from "../model/projectFile";
import { openTextFile, saveFile } from "../platform/saveFile";
import { APP_VERSION } from "../version";
import { Callout } from "../ui/kit";
import type { BuildingProject } from "../engine/projectState";
import { ConfirmDialog } from "../components/ConfirmDialog";

/**
 * Projects dashboard — shows all saved projects from localStorage with create/delete actions.
 */
export function ProjectsScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [projects, setProjects] = useState<BuildingProject[]>([]);

  useEffect(() => {
    setProjects(getSavedProjects());
  }, []);

  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; en: string; bn: string } | null>(null);
  const bn = lang === "bn";
  const exportOne = async (id: string, name: string) => {
    const spec = getSavedSpecs().find((p) => p.project.id === id);
    if (spec) await saveFile(projectFileName(name), exportProjects([spec], APP_VERSION), "application/json", [{ name: "ArchResidenceBD project", extensions: [FILE_EXTENSION] }]);
  };
  const exportAll = async () => {
    const all = getSavedSpecs();
    if (all.length) await saveFile(projectFileName("ArchResidenceBD-backup"), exportProjects(all, APP_VERSION), "application/json", [{ name: "ArchResidenceBD project", extensions: [FILE_EXTENSION] }]);
  };
  const importFile = async () => {
    const picked = await openTextFile(`.${FILE_EXTENSION},application/json`, [{ name: "ArchResidenceBD project", extensions: [FILE_EXTENSION, "json"] }]);
    if (!picked.opened) return;
    const result = importProjectFile(picked.text);
    if (!result.ok) {
      setNotice({ tone: "bad", en: result.error.en, bn: result.error.bn });
      return;
    }
    const added = addImportedSpecs(result.projects);
    setProjects(getSavedProjects());
    setNotice({ tone: "ok", en: `Imported ${added} project(s)${result.skipped ? `; ${result.skipped} could not be read` : ""}.`, bn: `${added}টি প্রজেক্ট আমদানি হয়েছে${result.skipped ? `; ${result.skipped}টি পড়া যায়নি` : ""}।` });
  };

  const [pendingDelete, setPendingDelete] = useState<BuildingProject | null>(null);
  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>, project: BuildingProject) => {
    e.stopPropagation();
    setPendingDelete(project);
  };
  const confirmDelete = () => {
    if (pendingDelete) {
      deleteSavedProject(pendingDelete.id);
      setProjects(getSavedProjects());
    }
    setPendingDelete(null);
  };

  const handleOpen = (project: BuildingProject) => {
    // Navigate to the project's last active phase or final design
    const activePhase = project.activePhaseId || "phase-site";
    onNavigate(`design:${activePhase}`);
  };

  const handleOpenClick = (e: React.MouseEvent<HTMLDivElement>, project: BuildingProject) => {
    e.stopPropagation();
    handleOpen(project);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="screen">
      <PageHeader
        title={t("projects")}
        subtitle={t("tagline")}
        actions={
          <>
            <Button variant="ghost" onClick={importFile}>{bn ? "ফাইল থেকে খুলুন" : "Import file"}</Button>
            {projects.length > 0 && <Button variant="ghost" onClick={exportAll}>{bn ? "সব প্রজেক্টের ব্যাকআপ" : "Back up all"}</Button>}
            <Button variant="primary" onClick={() => onNavigate("setup")}>
              {t("newProject")}
            </Button>
          </>
        }
      />

      {notice && (
        <Callout tone={notice.tone === "ok" ? "info" : "bad"} title={notice.tone === "ok" ? (bn ? "আমদানি সম্পন্ন" : "Import done") : bn ? "আমদানি করা যায়নি" : "Could not import"}>
          {bn ? notice.bn : notice.en}
        </Callout>
      )}

      {projects.length === 0 ? (
        <Card className="stack" style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ fontSize: "16px", marginBottom: "16px" }}>
            {lang === "bn" ? "কোনো প্রকল্প নেই। নতুন প্রকল্প শুরু করুন!" : "No projects yet. Start a new project!"}
          </p>
          <Button variant="primary" onClick={() => onNavigate("setup")}>
            {t("newProject")}
          </Button>
        </Card>
      ) : (
        <div className="grid-3">
          {projects.map((proj) => (
            <Card
              key={proj.id}
              className="project-card"
              style={{ cursor: "pointer" }}
              onClick={(e) => handleOpenClick(e, proj)}
            >
              <div className="row-between" style={{ marginBottom: "8px" }}>
                <h3 style={{ margin: 0 }}>{proj.name}</h3>
                <div style={{ display: "flex", gap: "4px" }}>
                  <Badge tone="sage">
                    {proj.stories} {lang === "bn" ? "তলা" : "St"}
                  </Badge>
                  <Badge tone="sky">
                    {proj.unitsPerFloor} {lang === "bn" ? "ইউনিট" : "U"}
                  </Badge>
                </div>
              </div>
              <p className="muted" style={{ margin: "4px 0" }}>
                📍 {proj.address || "Dhaka, Bangladesh"}
              </p>
              <p className="faint small" style={{ margin: "4px 0" }}>
                📐 {proj.plotSize} {proj.plotUnit} ({fmtNum(proj.plotSqm || 0, lang)} m²)
              </p>
              <p className="faint small" style={{ margin: "4px 0" }}>
                🕐 {formatDateTime(proj.updatedAt)}
              </p>
              <div className="row" style={{ marginTop: "12px", gap: "8px" }}>
                <Button
                  variant="primary"
                  size="small"
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); handleOpen(proj); }}
                >
                  {lang === "bn" ? "খুলুন" : "Open"}
                </Button>
                <Button variant="ghost" size="small" onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); void exportOne(proj.id, proj.name); }}>
                  {bn ? "এক্সপোর্ট" : "Export"}
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  style={{ color: "var(--bad-ink)" }}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => handleDelete(e, proj)}
                >
                  {lang === "bn" ? "মুছুন" : "Delete"}
                </Button>
              </div>
            </Card>
          ))}
          <Card
            className="project-card project-card--new"
            onClick={() => onNavigate("setup")}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "160px" }}
          >
            <span className="new-plus" style={{ fontSize: "32px" }}>+</span>
            <span style={{ fontWeight: 600, marginTop: "8px" }}>{t("newProject")}</span>
          </Card>
        </div>
      )}
    <ConfirmDialog
      open={pendingDelete !== null}
      title={lang === "bn" ? "প্রকল্প মুছবেন?" : "Delete this project?"}
      message={
        lang === "bn"
          ? `"${pendingDelete?.name ?? ""}" এই ডিভাইস থেকে মুছে যাবে। এটি ফেরানো যাবে না।`
          : `"${pendingDelete?.name ?? ""}" will be removed from this device. This cannot be undone.`
      }
      confirmLabel={lang === "bn" ? "মুছুন" : "Delete project"}
      cancelLabel={lang === "bn" ? "বাতিল" : "Cancel"}
      onConfirm={confirmDelete}
      onCancel={() => setPendingDelete(null)}
    />
    </div>
  );
}
