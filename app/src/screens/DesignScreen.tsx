import { designStats, phases } from "../data/mock";
import { useI18n } from "../i18n";
import { phaseName, STATUS_KEY } from "../labels";
import { phaseTone } from "../theme/tokens";
import { Badge, Button, Card, Dot, PageHeader, Stat, StatusBadge } from "../ui/kit";

export function DesignScreen({ target }: { target: string }) {
  const { t, lang } = useI18n();
  const targetPhase = phases.find((p) => p.id === target);
  const subtitle = targetPhase ? phaseName(targetPhase, lang, t) : t("designFinal");

  return (
    <div className="screen">
      <PageHeader
        title={t("designTitle")}
        subtitle={subtitle}
        actions={<Button variant="primary">{t("rebuildAll")}</Button>}
      />
      <div className="chat-layout">
        <Card>
          <div className="design-canvas">
            <span>{t("designPreview")}</span>
            <div className="row">
              {phases.map((p) => (
                <Badge key={p.id} tone={phaseTone[p.kind]}>
                  {phaseName(p, lang, t)}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
        <div className="stack">
          <Card className="stack">
            <h3>{t("phaseToggles")}</h3>
            {phases.map((p) => (
              <div className="phase-toggle" key={p.id}>
                <span className="row">
                  <Dot tone={phaseTone[p.kind]} />
                  {phaseName(p, lang, t)}
                </span>
                <StatusBadge status={p.status} label={t(STATUS_KEY[p.status])} />
              </div>
            ))}
          </Card>
          <Card className="stack">
            <div className="stats-grid">
              <Stat label={t("lastRun")} value={designStats.lastRun} />
              <Stat label={t("modelVersion")} value={designStats.model} />
              <Stat label={t("designPhaseStat")} value={designStats.phaseDesigns} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
