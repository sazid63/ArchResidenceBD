import { useState } from "react";
import verdictData from "../data/compliance/verdict-set.json";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader, Stat } from "../ui/kit";

export function ComplianceScreen() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<"all" | "passed" | "deviation">("all");

  const verdicts = verdictData.verdicts;
  const filtered = verdicts.filter((v) => {
    if (filter === "passed") return v.status === "compliant";
    if (filter === "deviation") return v.status === "deviation";
    return true;
  });

  return (
    <div className="screen">
      <PageHeader
        title={t("complianceTitle")}
        subtitle={t("complianceSubtitle")}
        actions={
          <div className="row">
            <Button
              variant={filter === "all" ? "primary" : "soft"}
              onClick={() => setFilter("all")}
            >
              All Rules ({verdicts.length})
            </Button>
            <Button
              variant={filter === "deviation" ? "primary" : "soft"}
              onClick={() => setFilter("deviation")}
            >
              Deviations ({verdictData.summary.deviation})
            </Button>
            <Button
              variant={filter === "passed" ? "primary" : "soft"}
              onClick={() => setFilter("passed")}
            >
              Compliant ({verdictData.summary.compliant})
            </Button>
          </div>
        }
      />

      <Callout title="Authority: RAJUK Dhaka Mohanogor Imarat Nirman Bidhimala 2008 & BNBC 2020">
        <span>
          Evaluated against official gazette rules for Residential A1-A4 occupancy. Rule Pack:{" "}
          <code>{verdictData.pack.id}</code>.
        </span>
      </Callout>

      <div className="row" style={{ gap: "16px", marginBottom: "16px" }}>
        <Stat label="Total Rules Checked" value={String(verdicts.length)} />
        <Stat label="Compliant" value={String(verdictData.summary.compliant)} />
        <Stat label="Deviations / Warnings" value={String(verdictData.summary.deviation)} />
        <Stat label="Pack Gaps Recorded" value={String(verdictData.unevaluated.length)} />
      </div>

      <div className="stack" style={{ gap: "12px" }}>
        {filtered.map((item, idx) => {
          const isPassed = item.status === "compliant";
          return (
            <Card key={idx} className="stack">
              <div className="row-between">
                <div>
                  <h4 style={{ margin: "0 0 4px 0" }}>
                    {lang === "bn" ? item.title.bn : item.title.en}
                  </h4>
                  <span className="faint small font-mono">{item.ruleRef}</span>
                </div>
                <Badge tone={isPassed ? "sage" : "amber"}>
                  {isPassed ? "✓ Compliant" : "⚠ Deviation"}
                </Badge>
              </div>

              <p style={{ margin: "8px 0", fontSize: "14px", lineHeight: "1.5" }}>
                {lang === "bn" ? item.summary.bn : item.summary.en}
              </p>

              <div
                className="row"
                style={{
                  background: "var(--surface-sunken)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  gap: "16px",
                  fontSize: "13px",
                }}
              >
                <div>
                  <span className="faint small">Required Limit: </span>
                  <strong>
                    {item.limit.comparator} {item.limit.value} {item.limit.unit}
                  </strong>
                </div>
                <div>
                  <span className="faint small">Measured in Plan: </span>
                  <strong>
                    {item.measured.value} {item.measured.unit}
                  </strong>
                </div>
                {item.limit.note ? (
                  <div className="muted small font-italic">({item.limit.note})</div>
                ) : null}
              </div>

              {!isPassed && item.alternative ? (
                <div
                  style={{
                    borderLeft: "3px solid var(--accent-amber, #f59e0b)",
                    paddingLeft: "10px",
                    marginTop: "6px",
                  }}
                >
                  <span className="field-label" style={{ color: "#d97706" }}>
                    Recommended Correction:
                  </span>
                  <div className="small">
                    {lang === "bn"
                      ? item.alternative.description.bn
                      : item.alternative.description.en}
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
