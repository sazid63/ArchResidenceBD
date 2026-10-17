import { phases } from "../data/mock";
import { useI18n } from "../i18n";
import { phaseName, STATUS_KEY } from "../labels";
import { phaseTone } from "../theme/tokens";
import { Button, Card, Chip, Dot, PageHeader, StatusBadge } from "../ui/kit";

export function PhaseChatScreen({ phaseId }: { phaseId: string }) {
  const { t, lang } = useI18n();
  const phase = phases.find((p) => p.id === phaseId) ?? phases[1];
  const statusKey = STATUS_KEY[phase.status];

  return (
    <div className="screen">
      <PageHeader
        title={phaseName(phase, lang, t)}
        subtitle={t("phase")}
        actions={<StatusBadge status={phase.status} label={t(statusKey)} />}
      />
      <div className="chat-layout">
        <Card className="chat">
          <div className="bubble bubble--ai">{t("chatAi1")}</div>
          <div className="chips">
            <Chip tone="sky">{t("chipHaveReport")}</Chip>
            <Chip tone="amber">{t("chipDontKnow")}</Chip>
            <Chip tone="lavender">{t("chipEstimate")}</Chip>
          </div>
          <div className="bubble bubble--user">{t("chatUser1")}</div>
          <div className="bubble bubble--ai">{t("chatAi2")}</div>
          <div className="chat-input-row">
            <input className="input" placeholder={t("chatPlaceholder")} />
            <Button variant="primary">{t("send")}</Button>
          </div>
        </Card>
        <div className="stack">
          <Card className="stack">
            <h3>{t("phaseInfo")}</h3>
            <div className="row-between">
              <span className="row">
                <Dot tone={phaseTone[phase.kind]} />
                {phaseName(phase, lang, t)}
              </span>
              <StatusBadge status={phase.status} label={t(statusKey)} />
            </div>
            <div className="field">
              <span className="field-label">{t("provenance")}</span>
              <span className="faint small">{t("provenanceNote")}</span>
            </div>
            <Button variant="primary" className="w-full">
              {t("designPhase")}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
