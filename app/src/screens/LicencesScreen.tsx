import { notices } from "../legal/notices";
import { useI18n } from "../i18n";
import { Badge, Card, PageHeader } from "../ui/kit";

/**
 * The Licences screen (ADR-0004, W5.1).
 *
 * The **only** legal surface in the app: the required licence notices live here, and
 * About links to it. Nothing else in the app names a bundled component - the brand
 * guard holds that (ADR-0004), and `app/src/legal/**` is the one path it skips.
 */
export function LicencesScreen() {
  const { t } = useI18n();
  return (
    <div className="screen">
      <PageHeader title={t("licencesTitle")} subtitle={t("licencesSubtitle")} />
      <div className="stack">
        {notices.map((notice) => (
          <Card key={notice.id} className="doc-row">
            <Badge tone={notice.status === "bundled" ? "sage" : "neutral"}>
              {notice.status === "bundled" ? t("licencesBundled") : t("licencesPlanned")}
            </Badge>
            <div className="grow">
              <div className="doc-desc muted">{notice.component}</div>
              <div className="faint small">
                {notice.role} · {notice.licence} · {notice.licenceFile}
              </div>
              <div className="small">{notice.notice}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
