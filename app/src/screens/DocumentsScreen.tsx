import { useState } from "react";

import { documents } from "../data/mock";
import type { DocItem } from "../data/mock";
import { ask, isDesktopShell } from "../ipc/core";
import { fmtNum, useI18n } from "../i18n";
import type { TKey } from "../i18n";
import type { Tone } from "../theme/tokens";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

const META: Record<DocItem["id"], { label: TKey; desc: TKey; tone: Tone }> = {
  drawings: { label: "drawings", desc: "drawingsDesc", tone: "sky" },
  bbs: { label: "bbs", desc: "bbsDesc", tone: "sage" },
  reports: { label: "reports", desc: "reportsDesc", tone: "lavender" },
  "engineer-pack": { label: "engineerPack", desc: "engineerPackDesc", tone: "amber" },
};

export function DocumentsScreen() {
  const { t, lang } = useI18n();
  const [exported, setExported] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** The project's bundle: one file, the whole history, checked (W5.5). */
  const exportBundle = async () => {
    if (!isDesktopShell()) {
      setProblem(t("bundleNeedsShell"));
      return;
    }
    try {
      const reply = await ask("bundle.export", {
        project: "projects/current",
        target: "projects/current.bundle.zip",
      });
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      setExported("projects/current.bundle.zip");
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

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
              <Button variant="soft" onClick={exportBundle}>
                {t("exportLabel")}
              </Button>
            </Card>
          );
        })}
      </div>
      {exported ? (
        <Callout title={t("bundleExported")}>
          <span className="small">{exported}</span>
        </Callout>
      ) : null}
      {problem ? (
        <Callout title={t("bundleFailed")}>
          <span className="small">{problem}</span>
        </Callout>
      ) : null}
    </div>
  );
}
