import { useEffect, useState } from "react";

import { project } from "../data/mock";
import { ask, isDesktopShell } from "../ipc/core";
import { fmtNum, useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";

interface ProjectRow {
  name: string;
  path: string;
  readable: boolean;
  id?: string;
  address?: string;
  revision?: number;
  updatedAt?: string;
  locked?: boolean;
}

/**
 * The projects dashboard (W5.6).
 *
 * The list comes from the **core** — the projects on this machine, each read from its own
 * tip — so the dashboard shows the project's facts and not a mock. In a browser (the
 * prototype) the core is not there, and the screen shows the mock project it always did.
 */
export function ProjectsScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;
    let live = true;
    ask("projects.list", {})
      .then((reply) => {
        if (!live || reply.error) return;
        setRows((reply.result as { projects: ProjectRow[] }).projects);
      })
      .catch(() => {
        /* the core is not answering - the mock stands in */
      });
    return () => {
      live = false;
    };
  }, []);

  const shown = rows && rows.length > 0 ? rows : null;

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
      <div className="grid-2">
        {shown
          ? shown.map((row) => (
              <Card key={row.path} className="project-card" onClick={() => onNavigate("setup")}>
                <div className="row-between">
                  <h3>{row.name}</h3>
                  <Badge tone={row.locked ? "amber" : "sage"}>
                    {row.locked ? t("locked") : t("designed")}
                  </Badge>
                </div>
                <p className="muted">{row.address ?? ""}</p>
                <p className="faint small">
                  {t("revisionLabel").replace("{n}", fmtNum(row.revision ?? 0, lang))}
                </p>
              </Card>
            ))
          : (
              <Card className="project-card" onClick={() => onNavigate("setup")}>
                <div className="row-between">
                  <h3>{project.name}</h3>
                  <Badge tone="sage">{t("designed")}</Badge>
                </div>
                <p className="muted">{project.address}</p>
                <div className="row">
                  <Badge tone="sky">
                    {t("stories").replace("{n}", fmtNum(project.stories, lang))}
                  </Badge>
                  <Badge tone="lavender">
                    {t("units").replace("{n}", fmtNum(project.unitsPerFloor, lang))}
                  </Badge>
                </div>
                <p className="faint small">
                  {t("lastUpdated").replace(
                    "{date}",
                    lang === "bn" ? project.updatedBn : project.updatedEn,
                  )}
                </p>
              </Card>
            )}
        <Card className="project-card project-card--new" onClick={() => onNavigate("setup")}>
          <span className="new-plus">+</span>
          <span>{t("newProject")}</span>
        </Card>
      </div>
    </div>
  );
}
