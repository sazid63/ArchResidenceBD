import { useState, useEffect } from "react";
import { fmtNum, useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";
import { getSavedProjects, deleteSavedProject } from "../engine/projectState";
import type { BuildingProject } from "../engine/projectState";

/**
 * Projects dashboard — shows all saved projects from localStorage with create/delete actions.
 */
export function ProjectsScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [projects, setProjects] = useState<BuildingProject[]>([]);

  useEffect(() => {
    setProjects(getSavedProjects());
  }, []);

  const handleDelete = (e: React.MouseEvent<HTMLButtonElement>, project: BuildingProject) => {
    e.stopPropagation();
    if (window.confirm(
      lang === "bn" 
        ? `আপনি কি "${project.name}" প্রকল্পটি মুছে ফেলতে চান?` 
        : `Are you sure you want to delete "${project.name}"?`
    )) {
      deleteSavedProject(project.id);
      setProjects(getSavedProjects());
    }
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
          <Button variant="primary" onClick={() => onNavigate("setup")}>
            {t("newProject")}
          </Button>
        }
      />

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
                <Button
                  variant="ghost"
                  size="small"
                  style={{ color: "var(--tone-blush, #ef4444)" }}
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
    </div>
  );
}
