import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive confirmations get the danger style and focus Cancel first. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Accessible replacement for window.confirm: focus trap, Esc to cancel, focus restored on close. */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    (danger ? cancelRef.current : confirmRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
      if (e.key === "Tab") {
        const a = cancelRef.current, b = confirmRef.current;
        if (!a || !b) return;
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
        else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); previous?.focus?.(); };
  }, [open, danger, onCancel]);

  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <h2 id="dlg-title" className="dialog-title">{title}</h2>
        <p id="dlg-msg" className="dialog-msg">{message}</p>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="button" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} type="button" className={danger ? "button button--danger" : "button button--primary"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
