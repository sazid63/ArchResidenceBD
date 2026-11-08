// Thin wrappers over CSS-only patterns in src/ui/kit.css (.tabs, .slider, .modal).
// The repo has no React component for these; they reuse its exact class names.
import type { ReactNode } from "react";
import { cx } from "../../src/ui/kit";

export function Tabs(p: { items: { id: string; label: ReactNode }[]; value: string; onChange?: (id: string) => void; "aria-label"?: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={p["aria-label"]}>
      {p.items.map((it) => {
        const active = it.id === p.value;
        return (
          <button key={it.id} type="button" role="tab" aria-selected={active} className={cx("tab", active && "tab--active")} onClick={() => p.onChange?.(it.id)}>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function Slider(p: { value: number; min?: number; max?: number; step?: number; onChange?: (v: number) => void; "aria-label"?: string; children?: ReactNode }) {
  const min = p.min ?? 0, max = p.max ?? 100;
  const pct = ((p.value - min) / (max - min)) * 100;
  return (
    <div className="slider-wrap">
      <input type="range" className="slider" min={min} max={max} step={p.step ?? 1} value={p.value} aria-label={p["aria-label"]}
        style={{ backgroundSize: `${pct}% 100%, 100% 100%` }} onChange={(e) => p.onChange?.(Number(e.target.value))} />
      {p.children}
    </div>
  );
}

export function Modal(p: { title: string; children: ReactNode; footer?: ReactNode; onClose?: () => void; inline?: boolean }) {
  const box = (
    <div className="modal" role="dialog" aria-modal="true" aria-label={p.title}>
      <div className="modal-head">
        <div className="modal-title">{p.title}</div>
        <button type="button" className="modal-close" onClick={p.onClose} aria-label="Close">✕</button>
      </div>
      <div className="modal-body">{p.children}</div>
      {p.footer ? <div className="modal-foot">{p.footer}</div> : null}
    </div>
  );
  if (p.inline) return box;
  return <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) p.onClose?.(); }}>{box}</div>;
}
