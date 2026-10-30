import { useState, useRef, useEffect } from "react";
import { useI18n } from "../i18n";

interface CodeTooltipProps {
  ruleId: string;
  children: React.ReactNode;
  /** BNBC clause reference (e.g. "BNBC 2020 §4.4") */
  clause?: string;
  /** Short explanation of the rule */
  explanation?: string;
  /** Remedy if deviating from the rule */
  remedy?: string;
  /** Severity tone: "info" | "warning" | "error" */
  severity?: "info" | "warning" | "error";
  /** Optional custom content override */
  customContent?: React.ReactNode;
}

const SEVERITY_COLORS = {
  info: { bg: "var(--sky-soft)", border: "var(--sky)", text: "var(--sky)" },
  warning: { bg: "var(--amber-soft)", border: "var(--amber)", text: "var(--amber)" },
  error: { bg: "var(--blush-soft)", border: "var(--blush)", text: "var(--blush)" },
};

/**
 * Smart code tooltip for BNBC/RAJUK rule references.
 * Hover any rule ID to see the clause, explanation, and remedy.
 */
export function CodeTooltip({
  ruleId,
  children,
  clause,
  explanation,
  remedy,
  severity = "info",
  customContent,
}: CodeTooltipProps) {
  const { lang } = useI18n();
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showTooltip = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 200;

    // Position below the trigger, centered
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX + rect.width / 2 - tooltipWidth / 2;

    // Keep within viewport
    if (left < 16) left = 16;
    if (left + tooltipWidth > window.innerWidth - 16) {
      left = window.innerWidth - tooltipWidth - 16;
    }
    if (top + tooltipHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - tooltipHeight - 8;
    }

    setPosition({ top, left });
    setIsVisible(true);
  };

  const hideTooltip = () => {
    setIsVisible(false);
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideTooltip();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isVisible) {
        hideTooltip();
      } else {
        showTooltip();
      }
    }
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        style={{
          cursor: "help",
          borderBottom: `1px dotted ${SEVERITY_COLORS[severity].text}`,
          color: SEVERITY_COLORS[severity].text,
          fontWeight: 500,
        }}
        role="button"
        tabIndex={0}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onKeyDown={handleKeyDown}
        aria-describedby={`tooltip-${ruleId}`}
        aria-label={`${ruleId}: ${explanation || "View BNBC clause details"}`}
        aria-expanded={isVisible}
      >
        {children}
      </span>

      {isVisible && (
        <div
          ref={tooltipRef}
          id={`tooltip-${ruleId}`}
          role="tooltip"
          style={{
            position: "absolute",
            top: `${position.top}px`,
            left: `${position.left}px`,
            width: "320px",
            background: "var(--color-surface)",
            border: `1px solid ${SEVERITY_COLORS[severity].border}`,
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            zIndex: 1000,
            fontSize: "13px",
            lineHeight: "1.5",
          }}
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
        >
          {customContent ? (
            customContent
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom: "12px", paddingBottom: "8px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", opacity: 0.7, marginBottom: "4px" }}>
                  {ruleId}
                </div>
                {clause && (
                  <div style={{ fontSize: "14px", fontWeight: 600, color: SEVERITY_COLORS[severity].text }}>
                    {clause}
                  </div>
                )}
              </div>

              {/* Explanation */}
              {explanation && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", opacity: 0.7, marginBottom: "4px" }}>
                    {lang === "bn" ? "ব্যাখ্যা" : "Explanation"}
                  </div>
                  <div style={{ fontSize: "13px" }}>{explanation}</div>
                </div>
              )}

              {/* Remedy */}
              {remedy && (
                <div style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", opacity: 0.7, marginBottom: "4px" }}>
                    {lang === "bn" ? "সমাধান" : "Remedy"}
                  </div>
                  <div style={{ 
                    fontSize: "13px", 
                    background: "var(--sage-soft)", 
                    padding: "8px", 
                    borderRadius: "4px",
                    borderLeft: `3px solid var(--sage)`
                  }}>
                    {remedy}
                  </div>
                </div>
              )}

              {/* Footer hint */}
              <div style={{ fontSize: "11px", opacity: 0.6, textAlign: "right" }}>
                {lang === "bn" ? "এস্কিপ বন্ধ করুন" : "Press Esc to close"}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/** Pre-configured BNBC rule tooltips */
export const BNBCRules = {
  rampSlope: {
    clause: "BNBC 2020 Ch.8 §8.3.2",
    explanation: "Maximum ramp slope for wheelchair access shall not exceed 12% (1:8.33).",
    remedy: "Reduce slope to 12% or provide elevator alternative.",
  },
  doorWidth: {
    clause: "BNBC 2020 Ch.8 §8.4.1",
    explanation: "Minimum clear door width for accessible routes shall be 900mm.",
    remedy: "Widen door opening or replace with wider door unit.",
  },
  elevator: {
    clause: "BNBC 2020 Ch.8 §8.6",
    explanation: "Buildings with 4 or more stories shall provide at least one passenger elevator.",
    remedy: "Install elevator or apply for variance with alternative accessibility measures.",
  },
  stairWidth: {
    clause: "BNBC 2020 Part 4 §4.7.3",
    explanation: "Minimum stair width for fire egress in residential buildings shall be 1000mm.",
    remedy: "Widen stair enclosure or provide additional exit stairs.",
  },
  corridorWidth: {
    clause: "BNBC 2020 Part 4 §4.7.4",
    explanation: "Minimum corridor width for fire egress shall be 1200mm.",
    remedy: "Widen corridor or reduce travel distance to exits.",
  },
  travelDistance: {
    clause: "BNBC 2020 Part 4 §4.8.2",
    explanation: "Maximum travel distance from any point to nearest exit shall not exceed 30m.",
    remedy: "Add additional exits or reconfigure floor plan to reduce distance.",
  },
  windowRatio: {
    clause: "BNBC 2020 §4.4",
    explanation: "Minimum window-to-floor area ratio for daylighting shall be 15% per room.",
    remedy: "Increase window size or add skylights to meet ratio requirement.",
  },
};