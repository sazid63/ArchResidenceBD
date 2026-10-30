import React from "react";
import { FloorPlanImage } from "../data/bangladeshFloorplans";
import { getFloorplanImage } from "../data/floorplanImages";

interface Props {
  plan: FloorPlanImage;
  size?: number;
}

/**
 * Floorplan Preview Component
 * Shows real floorplan image when available, falls back to procedural SVG.
 * Accessibility: role="img" with aria-label for screen readers.
 */
export function FloorplanPreview({ plan, size = 280 }: Props) {
  const localImage = getFloorplanImage(plan.id);
  const ariaLabel = `${plan.title} - ${plan.unitsCount} ${plan.unitsCount === 1 ? "unit" : "units"} floor plan`;

  if (localImage) {
    return (
      <div
        role="img"
        aria-label={ariaLabel}
        style={{
          width: size,
          height: size,
          borderRadius: 8,
          overflow: "hidden",
          background: "#faf8f5",
          border: "1px solid #e8e4dc",
        }}
      >
        <img
          src={localImage}
          alt={ariaLabel}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback: Procedural SVG
  const w = size;
  const h = size;
  const pad = 16;
  const bw = w - pad * 2;
  const bh = h - pad * 2;

  const units = plan.unitsCount;
  const unitWidth = bw / Math.max(units, 1);
  const unitGap = 4;
  const unitW = unitWidth - unitGap;
  const unitH = bh * 0.7;
  const unitY = pad + bh * 0.15;

  const roomColors: Record<string, string> = {
    bedroom: "#e8d5c4",
    living: "#d4e8c4",
    dining: "#d4c4e8",
    kitchen: "#e8c4c4",
    bath: "#c4d4e8",
    balcony: "#c4e8d4",
    corridor: "#e8e4c4",
    stair: "#d4d4d4",
  };

  const roomsPerUnit = Math.max(2, Math.min(5, plan.features.length));
  const roomW = unitW / roomsPerUnit;
  const roomH = unitH / 3;

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {/* Background */}
      <rect x={0} y={0} width={w} height={h} fill="#faf8f5" rx="8" />

      {/* Title */}
      <text x={w / 2} y={18} textAnchor="middle" fontSize="11" fill="#5a4a3a" fontWeight="600">
        {plan.title}
      </text>
      <text x={w / 2} y={32} textAnchor="middle" fontSize="9" fill="#8a7a6a">
        {plan.unitsCount} {plan.unitsCount === 1 ? "Unit" : "Units"} · {plan.plotSizeRange}
      </text>

      {/* Building outline */}
      <rect
        x={pad}
        y={pad + 36}
        width={bw}
        height={bh - 36}
        fill="none"
        stroke="#3d3226"
        strokeWidth="2"
        rx="2"
      />

      {/* Units */}
      {Array.from({ length: units }).map((_, ui) => {
        const ux = pad + ui * unitWidth + unitGap / 2;
        return (
          <g key={ui}>
            {/* Unit box */}
            <rect
              x={ux}
              y={unitY}
              width={unitW}
              height={unitH}
              fill="none"
              stroke="#6b5b4a"
              strokeWidth="1.5"
              rx="2"
            />
            {/* Unit label */}
            <text x={ux + unitW / 2} y={unitY - 4} textAnchor="middle" fontSize="8" fill="#6b5b4a">
              Unit {String.fromCharCode(65 + ui)}
            </text>

            {/* Rooms inside unit */}
            {Array.from({ length: roomsPerUnit }).map((_, ri) => {
              const kinds: (keyof typeof roomColors)[] = ["bedroom", "living", "bath", "kitchen", "balcony"];
              const kind = kinds[ri % kinds.length];
              const rx = ux + ri * roomW + 1;
              const ry = unitY + 1;
              const rw = roomW - 2;
              const rh = roomH - 2;
              return (
                <g key={ri}>
                  <rect
                    x={rx}
                    y={ry}
                    width={rw}
                    height={rh}
                    fill={roomColors[kind]}
                    stroke="#8a7a6a"
                    strokeWidth="0.5"
                    rx="1"
                  />
                  <text x={rx + rw / 2} y={ry + rh / 2 + 2} textAnchor="middle" fontSize="6" fill="#5a4a3a">
                    {kind}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Stair core */}
      {units > 1 && (
        <rect
          x={pad + bw * 0.42}
          y={unitY + unitH + 4}
          width={bw * 0.16}
          height={bh - 36 - unitH - 8}
          fill="#d4d4d4"
          stroke="#6b5b4a"
          strokeWidth="1"
          rx="1"
        />
      )}

      {/* Features list */}
      <text x={w / 2} y={h - 6} textAnchor="middle" fontSize="7" fill="#8a7a6a">
        {plan.features.slice(0, 4).join(" · ")}
      </text>
    </svg>
  );
}

export default FloorplanPreview;