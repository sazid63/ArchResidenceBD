import { useState } from "react";

import { AREA_TO_M2, LENGTH_TO_M, formatNumber } from "../interview/units";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

const AREA_UNITS = ["katha", "shotok", "bigha", "gonda", "sqft", "sqm"];
const LENGTH_UNITS = ["ft", "m", "inch"];

/**
 * The land-unit converter. katha = 720 sqft, shotok = 435.6 sqft, bigha = 20 katha, gonda = 1/20 katha (see src/interview/units.ts).
 * An area and a length are not the same kind of thing, and the screen says so.
 */
export function UnitsScreen() {
  const { t } = useI18n();
  const [value, setValue] = useState("5");
  const [from, setFrom] = useState("katha");
  const [to, setTo] = useState("sqm");
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const units = from === "m" || from === "ft" || from === "inch" ? LENGTH_UNITS : AREA_UNITS;

  const convert = () => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) {
      setProblem(t("unitsFailed"));
      setResult(null);
      return;
    }
    const area = from in AREA_TO_M2 && to in AREA_TO_M2;
    const length = from in LENGTH_TO_M && to in LENGTH_TO_M;
    if (!area && !length) {
      setProblem(`${from} and ${to} measure different things (area vs length).`);
      setResult(null);
      return;
    }
    const table = area ? AREA_TO_M2 : LENGTH_TO_M;
    setResult(formatNumber((amount * table[from]) / table[to], 4));
    setProblem(null);
  };

  return (
    <div className="screen">
      <PageHeader title={t("unitsTitle")} subtitle={t("unitsSubtitle")} />
      <div className="row">
        <label htmlFor="units-value-input" className="visually-hidden">
          {t("unitsValueLabel")}
        </label>
        <input
          className="input"
          id="units-value-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <label htmlFor="units-from-select" className="visually-hidden">{t("unitsFromLabel")}</label>
        <select id="units-from-select" className="input" value={from} onChange={(event) => setFrom(event.target.value)}>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <span className="faint">→</span>
        <label htmlFor="units-to-select" className="visually-hidden">{t("unitsToLabel")}</label>
        <select id="units-to-select" className="input" value={to} onChange={(event) => setTo(event.target.value)}>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <Button variant="soft" onClick={convert}>
          {t("unitsConvert")}
        </Button>
      </div>
      {result ? (
        <Card>
          <div className="grow">
            <div className="doc-desc muted">
              {value} {from} = {result} {to}
            </div>
          </div>
          <Badge tone="sage">{t("unitsConverted")}</Badge>
        </Card>
      ) : null}
      {problem ? (
        <Callout title={t("unitsFailed")}>
          <span className="small">{problem}</span>
        </Callout>
      ) : null}
    </div>
  );
}
