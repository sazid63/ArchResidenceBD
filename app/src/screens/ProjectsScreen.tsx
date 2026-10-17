import { project } from "../data/mock";
import { fmtNum, useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";

export function ProjectsScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t, lang } = useI18n();
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
        <Card className="project-card" onClick={() => onNavigate("setup")}>
          <div className="row-between">
            <h3>{project.name}</h3>
            <Badge tone="sage">{t("designed")}</Badge>
          </div>
          <p className="muted">{project.address}</p>
          <div className="row">
            <Badge tone="sky">{t("stories").replace("{n}", fmtNum(project.stories, lang))}</Badge>
            <Badge tone="lavender">{t("units").replace("{n}", fmtNum(project.unitsPerFloor, lang))}</Badge>
          </div>
          <p className="faint small">
            {t("lastUpdated").replace("{date}", lang === "bn" ? project.updatedBn : project.updatedEn)}
          </p>
        </Card>
        <Card className="project-card project-card--new" onClick={() => onNavigate("setup")}>
          <span className="new-plus">+</span>
          <span>{t("newProject")}</span>
        </Card>
      </div>
    </div>
  );
}
