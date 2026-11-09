import { useMemo } from "react";
import { useI18n, fmtNum } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";
import { fitPlan } from "../plans/fit";
import { deriveGeometry } from "../plans/geometry";
import { PLAN_LIBRARY } from "../plans/library";
import { renderPlanSvg } from "../plans/render";
import type { Bay, PlanDefinition } from "../plans/types";

/**
 * The plan library: the original floor plans the app can fit to a plot. Each is drawn at its
 * preferred size; the real fit (and the RAJUK coverage check) happens on the Project setup screen,
 * which picks plans from the plot you enter. Nothing here is a finished building.
 */

const sum = (bays: Bay[], key: keyof Bay) => bays.reduce((s, b) => s + b[key], 0);
const metres = (mm: number, lang: "en" | "bn") => fmtNum(Math.round(mm / 100) / 10, lang);

function preview(plan: PlanDefinition, lang: "en" | "bn") {
  const fit = fitPlan(plan, { widthMm: sum(plan.baysX, "pref"), depthMm: sum(plan.baysY, "pref") });
  return fit.ok ? renderPlanSvg(deriveGeometry(fit.fitted), { lang }) : null;
}

export function TemplatesScreen({ onPick }: { onPick: (id: string) => void }) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const cards = useMemo(() => PLAN_LIBRARY.map((plan) => ({ plan, svg: preview(plan, lang) })), [lang]);

  return (
    <div className="screen">
      <PageHeader
        title={bn ? "প্ল্যান লাইব্রেরি" : "Plan library"}
        subtitle={
          bn
            ? `${fmtNum(PLAN_LIBRARY.length, lang)}টি মৌলিক ফ্লোর প্ল্যান। প্রকল্পের জমির মাপ দিলে যেগুলো আঁটে সেগুলো বাছাই করা যায়।`
            : `${PLAN_LIBRARY.length} original floor plans. Enter your plot on Project setup and the ones that fit are offered.`
        }
        actions={<Button variant="primary" onClick={() => onPick("setup")}>{bn ? "নতুন প্রকল্প শুরু করুন" : "Start a project"}</Button>}
      />
      <div className="stack" style={{ gap: 12 }}>
        {cards.map(({ plan, svg }) => (
          <Card key={plan.id} className="row" style={{ gap: 16, padding: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            {svg ? <div className="plan-thumb" style={{ width: 220 }} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
            <div className="stack" style={{ gap: 6, flex: 1, minWidth: 240 }}>
              <h3 style={{ margin: 0 }}>{plan.name[lang]}</h3>
              <p className="small muted" style={{ margin: 0 }}>{plan.description[lang]}</p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Badge tone="neutral">{fmtNum(plan.unitsPerFloor, lang)} {bn ? "ইউনিট / তলা" : "unit(s) / floor"}</Badge>
                <Badge tone="neutral">{fmtNum(plan.bedroomsPerUnit, lang)} {bn ? "শয়নকক্ষ / ইউনিট" : "bedroom(s) / unit"}</Badge>
                <Badge tone="sky">
                  {bn ? "প্রস্থ" : "Width"} {metres(sum(plan.baysX, "min"), lang)}–{metres(sum(plan.baysX, "max"), lang)} {bn ? "মি" : "m"}
                  {" · "}
                  {bn ? "গভীরতা" : "Depth"} {metres(sum(plan.baysY, "min"), lang)}–{metres(sum(plan.baysY, "max"), lang)} {bn ? "মি" : "m"}
                </Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
