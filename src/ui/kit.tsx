import { useId, type KeyboardEvent, type ReactNode } from "react";

import { statusTone } from "../theme/tokens";
import type { CheckResult, PhaseStatus, Tone } from "../theme/tokens";
import "./kit.css";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  onClick,
  style,
  role,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: {
  children: ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  role?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <div className={cx("card", className)} onClick={onClick} style={style} role={role} aria-labelledby={ariaLabelledBy} aria-describedby={ariaDescribedBy}>
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = "soft",
  onClick,
  className,
  disabled,
  style,
  title,
  size,
  id,
  tabIndex,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-controls": ariaControls,
  onKeyDown,
  role,
  "aria-selected": ariaSelected,
}: {
  children: ReactNode;
  variant?: "primary" | "soft" | "ghost" | "danger";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
  size?: "small" | "medium" | "large";
  id?: string;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-controls"?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  role?: string;
  "aria-selected"?: boolean;
}) {
  return (
    <button
      type="button"
      id={id}
      tabIndex={tabIndex}
      className={cx("button", `button--${variant}`, size && `button--${size}`, className)}
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={disabled}
      style={style}
      title={title}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-controls={ariaControls}
      role={role}
      aria-selected={ariaSelected}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  tone = "neutral",
  onClick,
}: {
  children: ReactNode;
  tone?: Tone;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button type="button" className={cx("chip", `chip--${tone}`)} onClick={onClick}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={cx("badge", `badge--${tone}`)}>{children}</span>;
}

export function StatusBadge({ status, label }: { status: PhaseStatus; label: string }) {
  return <span className={cx("badge", `badge--${statusTone[status]}`)}>{label}</span>;
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={cx("dot", `dot--${tone}`)} />;
}

export function StatusDot({ status }: { status: PhaseStatus }) {
  return (
    <span
      className={cx("sdot", `sdot--${statusTone[status]}`)}
      title={status}
      role="status"
      aria-label={`Status: ${status}`}
    />
  );
}

export function Callout({
  title,
  children,
  tone,
}: {
  title: string;
  children: ReactNode;
  /** Colour the callout by meaning; omit for a neutral note. */
  tone?: "info" | "ok" | "warn" | "bad";
}) {
  return (
    <div className={cx("callout", tone && `callout--${tone}`)} role={tone === "bad" || tone === "warn" ? "alert" : undefined}>
      <div className="callout-title">{title}</div>
      <div className="callout-body">{children}</div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <div className="sub">{subtitle}</div> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

const RESULT_LABEL: Record<CheckResult, { en: string; bn: string }> = {
  pass: { en: "Pass", bn: "উত্তীর্ণ" },
  fail: { en: "Fail", bn: "অনুত্তীর্ণ" },
  warn: { en: "Check", bn: "যাচাই করুন" },
  not_checked: { en: "Not checked", bn: "যাচাই হয়নি" },
  not_applicable: { en: "Not applicable", bn: "প্রযোজ্য নয়" },
};

/** The outcome of one check. "Not checked" is shown honestly instead of a fake pass. */
export function ResultChip({ result, lang = "en", children }: { result: CheckResult; lang?: "en" | "bn"; children?: ReactNode }) {
  return <span className={cx("result", `result--${result}`)}>{children ?? RESULT_LABEL[result][lang]}</span>;
}

/** A number with its unit, tabular digits, unit in a quieter style (e.g. 1.20 m, ৳ 2.4 cr). */
export function Value({ children, unit, prefix }: { children: ReactNode; unit?: string; prefix?: string }) {
  return (
    <span className="value">
      {prefix ? <span className="value-unit" style={{ marginLeft: 0, marginRight: "0.25em" }}>{prefix}</span> : null}
      {children}
      {unit ? <span className="value-unit">{unit}</span> : null}
    </span>
  );
}

/** Choose one of a few options (radio group semantics, arrow keys move the choice). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
}) {
  const name = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          name={name}
          data-value={o.value}
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className="segmented-item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** An empty area that invites the next step. */
export function EmptyState({
  title,
  children,
  icon,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="placeholder">
      {icon ? <div className="placeholder-icon" aria-hidden="true">{icon}</div> : null}
      <div className="placeholder-title">{title}</div>
      {children ? <div className="placeholder-text">{children}</div> : null}
      {action ?? null}
    </div>
  );
}

/** A short confirmation that appears bottom-right. Render inside a polite live region. */
export function Toast({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      <div className="toast">
        <span className="grow">{children}</span>
        {action ?? null}
      </div>
    </div>
  );
}
