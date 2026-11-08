import { notices } from "../legal/notices";
import { useI18n } from "../i18n";
import { Badge, Card, PageHeader } from "../ui/kit";

/** Third-party notices (the list lives in src/legal/notices.ts). About links here. */
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
                {notice.role} · {notice.licence} · <a href={notice.source} target="_blank" rel="noreferrer">{notice.source.replace("https://", "")}</a>
              </div>
              <div className="small">{notice.notice}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
