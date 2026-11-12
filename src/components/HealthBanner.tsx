import { useSyncExternalStore } from "react";
import { dismissHealth, getHealth, subscribeHealth } from "../model/appHealth";
import { saveFile } from "../platform/saveFile";
import { Button } from "../ui/kit";
import { useI18n } from "../i18n";

/** Problems the user must see: failed saves, projects changed elsewhere, damaged storage, unexpected errors. */
export function HealthBanner() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const events = useSyncExternalStore(subscribeHealth, getHealth, getHealth);
  if (!events.length) return null;
  const report = () => {
    const body = { at: new Date().toISOString(), userAgent: navigator.userAgent, events: events.map(({ kind, en, at, detail }) => ({ kind, en, at, detail })) };
    void saveFile(`archres-problems-${Date.now()}.json`, JSON.stringify(body, null, 2), "application/json");
  };
  return (
    <div className="stack" role="alert" aria-live="assertive" style={{ gap: 8, padding: "8px 16px" }}>
      {events.map((e) => (
        <div key={e.id} className="row-between" style={{ gap: 12, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" }}>
          <span className="small">{bn ? e.bn : e.en}</span>
          <span className="row" style={{ gap: 8 }}>
            {e.kind === "runtime" ? <Button variant="ghost" onClick={report}>{bn ? "রিপোর্ট ফাইল সংরক্ষণ" : "Save problem report"}</Button> : null}
            <Button variant="ghost" onClick={() => dismissHealth(e.id)}>{bn ? "বন্ধ করুন" : "Dismiss"}</Button>
          </span>
        </div>
      ))}
    </div>
  );
}
