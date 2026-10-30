import type { ReactNode } from "react";

import type { PhaseStatus } from "../data/mock";
import { statusTone } from "../theme/tokens";
import type { Tone } from "../theme/tokens";
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
  variant?: "primary" | "soft" | "ghost";
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

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="callout">
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
