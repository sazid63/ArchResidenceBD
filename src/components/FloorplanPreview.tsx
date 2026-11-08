import React from "react";
import type { FloorPlanTemplate } from "../data/floorplanLibrary";

interface Props {
  plan: FloorPlanTemplate;
  size?: number;
}

/**
 * FloorplanPreview — shows the curated 2D drawing for a template.
 *
 * If a template's file is missing at runtime the onError handler swaps in a procedural SVG, so the
 * gallery never shows a broken image; the fallback is drawn from the same unit count as the plan.
 */
export function FloorplanPreview({ plan, size = 280 }: Props) {
  const [failed, setFailed] = React.useState(false);
  const label = plan.title + " — " + plan.unitsPerFloor + (plan.unitsPerFloor === 1 ? " unit" : " units") + " per floor";

  React.useEffect(() => {
    setFailed(false);
  }, [plan.image]);

  if (!failed) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
        }}
      >
        <img
          src={plan.image}
          alt={label}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          loading="lazy"
        />
      </div>
    );
  }

  return <ProceduralPlan plan={plan} size={size} label={label} />;
}

function ProceduralPlan({ plan, size, label }: { plan: FloorPlanTemplate; size: number; label: string }) {
  const pad = 16;
  const bw = size - pad * 2;
  const bh = size - pad * 2;
  const units = Math.max(1, plan.unitsPerFloor);
  const unitWidth = bw / units;
  const unitW = unitWidth - 4;
  const unitH = bh * 0.66;
  const unitY = pad + bh * 0.17;

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={"0 0 " + size + " " + size}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface-2)" }}
    >
      <text x={size / 2} y={18} textAnchor="middle" fontSize="11" fill="var(--ink)" fontWeight="600">
        {plan.id}
      </text>
      <text x={size / 2} y={32} textAnchor="middle" fontSize="9" fill="var(--ink-soft)">
        {units + (units === 1 ? " unit" : " units") + " per floor · drawing unavailable"}
      </text>
      <rect x={pad} y={pad + 36} width={bw} height={bh - 36} fill="none" stroke="var(--ink)" strokeWidth={2} />
      {Array.from({ length: units }).map((_, i) => (
        <g key={i}>
          <rect
            x={pad + i * unitWidth + 2}
            y={unitY}
            width={unitW}
            height={unitH}
            fill="none"
            stroke="var(--ink-soft)"
            strokeWidth={1.5}
          />
          <text x={pad + i * unitWidth + unitW / 2 + 2} y={unitY - 4} textAnchor="middle" fontSize="8" fill="var(--ink-soft)">
            {"Unit " + String.fromCharCode(65 + i)}
          </text>
        </g>
      ))}
      <rect x={pad + bw * 0.42} y={unitY + unitH + 4} width={bw * 0.16} height={bh - 36 - unitH - 8} fill="var(--surface-3)" stroke="var(--ink-soft)" />
    </svg>
  );
}

export default FloorplanPreview;
