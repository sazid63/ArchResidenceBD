import { documents } from "../data/mock";
import type { DocItem } from "../data/mock";
import { fmtNum, useI18n } from "../i18n";
import type { TKey } from "../i18n";
import type { Tone } from "../theme/tokens";
import { Badge, Button, Card, PageHeader } from "../ui/kit";

const META: Record<DocItem["id"], { label: TKey; desc: TKey; tone: Tone }> = {
  drawings: { label: "drawings", desc: "drawingsDesc", tone: "sky" },
  bbs: { label: "bbs", desc: "bbsDesc", tone: "sage" },
  reports: { label: "reports", desc: "reportsDesc", tone: "lavender" },
  "engineer-pack": { label: "engineerPack", desc: "engineerPackDesc", tone: "amber" },
};

export function DocumentsScreen() {
  const { t, lang } = useI18n();
  return (
    <div className="screen">
      <PageHeader title={t("docsTitle")} subtitle={t("engineerPending")} />
      <div className="stack">
        {documents.map((doc) => {
          const meta = META[doc.id];
          return (
            <Card key={doc.id} className="doc-row">
              <Badge tone={meta.tone}>{t(meta.label)}</Badge>
              <div className="grow">
                <div className="doc-desc muted">{t(meta.desc)}</div>
                <div className="faint small">
                  {t("sheets").replace("{n}", fmtNum(doc.sheets, lang))}
                </div>
              </div>
              <Badge tone={doc.status === "ready" ? "sage" : "amber"}>
                {doc.status === "ready" ? t("docsReady") : t("docsDraft")}
              </Badge>
              <Button variant="ghost">{t("openFolder")}</Button>
              <Button variant="soft">{t("exportLabel")}</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
