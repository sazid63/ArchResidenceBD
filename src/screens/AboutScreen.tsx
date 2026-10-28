import { useEffect, useState } from "react";

import { coreHealth, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { Button, Card, PageHeader, Stat } from "../ui/kit";

/**
 * About (ADR-0004, W5.1).
 *
 * It carries the product's own name and version, and **links** to the Licences screen.
 * It carries no "powered by" line - the required notices are legal text and they live
 * on the one legal surface (the Licences screen), not in the branding.
 *
 * It also carries the **core's health** ✓: the app is a shell ✓ and the core is the
 * brain ✓, so "is the core there?" is a first-class fact of the app ✓ - and in a browser
 * (the prototype) there is no core ✓, which the screen says plainly ✓ ✓.
 */
export function AboutScreen({ onOpenLicences }: { onOpenLicences: () => void }) {
  const { t } = useI18n();
  const [core, setCore] = useState<"unknown" | "connected" | "absent">("unknown");

  useEffect(() => {
    if (!isDesktopShell()) {
      setCore("absent");
      return;
    }
    let live = true;
    coreHealth().then((reply) => {
      if (live) setCore(reply && !reply.error ? "connected" : "absent");
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="screen">
      <PageHeader title={t("aboutTitle")} subtitle={t("aboutTagline")} />
      <div className="row">
        <Stat label={t("aboutVersion")} value={t("aboutVersionValue")} />
        <Stat label={t("aboutBuild")} value={t("aboutBuildValue")} />
        <Stat
          label={t("aboutCore")}
          value={
            core === "connected"
              ? t("aboutCoreConnected")
              : core === "absent"
                ? t("aboutCoreAbsent")
                : t("aboutCoreUnknown")
          }
        />
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
