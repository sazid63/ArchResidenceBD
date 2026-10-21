import { useI18n } from "../i18n";
import { Button, Card, PageHeader, Stat } from "../ui/kit";

/**
 * About (ADR-0004, W5.1).
 *
 * It carries the product's own name and version, and **links** to the Licences screen.
 * It carries no "powered by" line - the required notices are legal text and they live
 * on the one legal surface (the Licences screen), not in the branding.
 */
export function AboutScreen({ onOpenLicences }: { onOpenLicences: () => void }) {
  const { t } = useI18n();
  return (
    <div className="screen">
      <PageHeader title={t("aboutTitle")} subtitle={t("aboutTagline")} />
      <div className="row">
        <Stat label={t("aboutVersion")} value={t("aboutVersionValue")} />
        <Stat label={t("aboutBuild")} value={t("aboutBuildValue")} />
      </div>
      <Card>
        <div className="grow">
          <div className="doc-desc muted">{t("aboutLicencesLine")}</div>
          <div className="faint small">{t("aboutTermsPending")}</div>
        </div>
        <Button variant="soft" onClick={onOpenLicences}>
          {t("licencesTitle")}
        </Button>
      </Card>
    </div>
  );
}
