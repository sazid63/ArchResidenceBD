import { useEffect, useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { fmtBdt, fmtNum, useI18n } from "../i18n";
import { Badge, Card, PageHeader, Stat } from "../ui/kit";

interface BoqLine {
  key: string;
  label: { bn: string; en: string };
  phase: string;
  /** The schema's five ✓ — the mock had four ✓, and the two unpriced formwork lines
   *  are the fifth ✓ ("other" ✓) — so a screen written from the mock would show
   *  `undefined` on exactly the lines a user notices ✓ ✓. */
  costType: "material" | "labour" | "machinery" | "subcontract" | "other";
  unit: string;
  quantity: number;
  rateBdt: number;
  amountBdt: number;
  priced: boolean;
  provenance: string;
  source?: string;
  note?: string;
}

interface Boq {
  lines: BoqLine[];
  totals: { amountBdt: number; pricedLines: number; unpricedLines: string[] };
  subtotals: { byPhase: Record<string, number>; byCostType: Record<string, number> };
  rateCard: { cardId: string; region: string; effectiveFrom: string };
}

interface PricedFrom {
  cardId: string;
  status: string;
  region: string;
  effectiveFrom: string;
}

const COST_TONE: Record<BoqLine["costType"], "sky" | "sage" | "amber" | "lavender" | "blush"> = {
  material: "sky",
  labour: "sage",
  machinery: "amber",
  subcontract: "lavender",
  other: "blush",
};

const COST_KEY: Record<
  BoqLine["costType"],
  "costMaterial" | "costLabour" | "costMachinery" | "costSubcontract" | "costOther"
> = {
  material: "costMaterial",
  labour: "costLabour",
  machinery: "costMachinery",
  subcontract: "costSubcontract",
  other: "costOther",
};

/**
 * The BOQ (W5.1's last wiring).
 *
 * The money is the **core's** ✓ — the project's own spec designed ✓ and priced ✓ — and the
 * **card it is priced from is named** ✓, with its status ✓: a candidate card says so ✓
 * (the plan's money law ✓ ✓), and the app shows it rather than hiding it ✓ ✓.
 *
 * The **unpriced lines are shown** ✓ — the BOQ says which lines could not be priced ✓ ✓ —
 * because a total that hides them is a lie ✓ ✓.
 */
export function BoqScreen() {
  const { t, lang } = useI18n();
  const [boq, setBoq] = useState<Boq | null>(null);
  const [pricedFrom, setPricedFrom] = useState<PricedFrom | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;
    let live = true;
    const load = async () => {
      const projects = await ask("projects.list", {});
      const rows =
        !projects.error && projects.result
          ? ((projects.result as { projects: { path: string }[] }).projects ?? [])
          : [];
      if (!rows.length) {
        if (live) setProblem(t("boqNoProject"));
        return;
      }
      const reply = await ask("boq.build", { project: rows[0].path });
      if (!live) return;
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      const result = reply.result as { boq: Boq; pricedFrom: PricedFrom };
      setBoq(result.boq);
      setPricedFrom(result.pricedFrom);
      setProblem(null);
    };
    void load();
    return () => {
      live = false;
    };
  }, [t]);

  if (!boq) {
    return (
      <div className="screen">
        <PageHeader title={t("boqTitle")} subtitle={t("priceNote")} />
        {problem ? (
          <Card>
            <span className="faint small">{problem}</span>
          </Card>
        ) : null}
      </div>
    );
  }

  const phases = Object.keys(boq.subtotals.byPhase);

  return (
    <div className="screen">
      <PageHeader title={t("boqTitle")} subtitle={t("priceNote")} />
      <div className="row">
        <Stat label={t("grandTotal")} value={fmtBdt(boq.totals.amountBdt, lang)} />
        <Stat label={t("boqPricedLines")} value={String(boq.totals.pricedLines)} />
        <Stat
          label={t("boqPricedFrom")}
          value={pricedFrom ? `${pricedFrom.cardId} · ${pricedFrom.status}` : "—"}
        />
      </div>
      {pricedFrom?.status === "candidate" ? (
        <Card>
          <span className="small">{t("boqCandidateNote")}</span>
        </Card>
      ) : null}
      {phases.map((phase) => (
        <Card key={phase} className="stack">
          <div className="row-between">
            <h3>{phase}</h3>
            <Badge tone="sage">
              {t("subtotal")}: {fmtBdt(boq.subtotals.byPhase[phase] ?? 0, lang)}
            </Badge>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t("item")}</th>
                <th>{t("typeCol")}</th>
                <th>{t("unitCol")}</th>
                <th className="num">{t("qty")}</th>
                <th className="num">{t("rate")}</th>
                <th className="num">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {boq.lines
                .filter((line) => line.phase === phase)
                .map((line) => (
                  <tr key={line.key}>
                    <td>
                      <span className="row">
                        {line.label[lang] ?? line.label.en}
                        {line.provenance && line.provenance !== "spec" ? (
                          <Badge tone="amber">{t("boqAssumed")}</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <Badge tone={COST_TONE[line.costType]}>
                        {t(COST_KEY[line.costType])}
                      </Badge>
                    </td>
                    <td className="muted">{line.unit}</td>
                    <td className="num">{fmtNum(line.quantity, lang)}</td>
                    <td className="num">{line.priced ? fmtBdt(line.rateBdt, lang) : "—"}</td>
                    <td className="num">
                      {line.priced ? fmtBdt(line.amountBdt, lang) : t("boqUnpriced")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      ))}
      <div className="grand">
        <span className="muted">{t("grandTotal")}</span>
        <span className="amount">{fmtBdt(boq.totals.amountBdt, lang)}</span>
      </div>
      {boq.totals.unpricedLines.length ? (
        <Card className="stack">
          <h3>{t("boqUnpricedTitle")}</h3>
          <span className="small">{t("boqUnpricedNote")}</span>
          <div className="row">
            {boq.totals.unpricedLines.map((key) => (
              <Badge key={key} tone="amber">
                {key}
              </Badge>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
