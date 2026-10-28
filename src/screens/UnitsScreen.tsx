import { useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

const AREA_UNITS = ["katha", "shotok", "bigha", "gonda", "sqft", "sqm"];
const LENGTH_UNITS = ["ft", "m", "inch"];

/**
 * The land-unit converter (W5.7).
 *
 * The conversion is the **core's** ✓ — one implementation ✓, the module's `Decimal` maths
 * ✓ — so a katha is the same number in the app, in the documents and in the drawings ✓ ✓.
 * An area and a length are not the same kind of thing ✓, and the core says so ✓ ✓.
 */
export function UnitsScreen() {
  const { t } = useI18n();
  const [value, setValue] = useState("5");
  const [from, setFrom] = useState("katha");
  const [to, setTo] = useState("sqm");
  const [result, setResult] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const units = from === "m" || from === "ft" || from === "inch" ? LENGTH_UNITS : AREA_UNITS;

  const convert = async () => {
    if (!isDesktopShell()) {
      setProblem(t("unitsNeedsShell"));
      return;
    }
    try {
      const reply = await ask("units.convert", {
        value: Number(value),
        from,
        to,
      });
      if (reply.error) {
        setProblem(String(reply.error.message));
        setResult(null);
        return;
      }
      setResult(String((reply.result as { value: string }).value));
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="screen">
      <PageHeader title={t("unitsTitle")} subtitle={t("unitsSubtitle")} />
      <div className="row">
        <input
          className="input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <select className="input" value={from} onChange={(event) => setFrom(event.target.value)}>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <span className="faint">→</span>
        <select className="input" value={to} onChange={(event) => setTo(event.target.value)}>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
        <Button variant="soft" onClick={() => void convert()}>
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
