import { useEffect, useRef } from "react";

type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Global keyboard shortcuts hook.
 *
 * Combo format: "ctrl+s", "ctrl+shift+v", "space", "escape"
 * Keys are normalized to lowercase; modifier order doesn't matter.
 * Handlers are ignored while typing in input/textarea/select/contenteditable.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled: boolean = true): void {
  // Keep latest shortcuts in a ref so the listener binds once
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      // Ignore when typing in form fields
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const key = e.key.toLowerCase();
      const combo = [
        e.ctrlKey || e.metaKey ? "ctrl" : null,
        e.altKey ? "alt" : null,
        e.shiftKey ? "shift" : null,
        key === " " ? "space" : key,
      ]
        .filter(Boolean)
        .join("+");

      // Also try plain key when no modifiers are pressed
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey ? key : combo;

      const map = shortcutsRef.current;
      const action = map[combo] || (e.ctrlKey || e.metaKey ? undefined : map[plain]);

      if (action) {
        e.preventDefault();
        action(e);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled]);
}

/** Default app shortcuts — returns a map the caller can extend. */
export function defaultAppShortcuts(handlers: {
  onSave?: () => void;
  onBatchExport?: () => void;
  onReRunCompliance?: () => void;
  onToggleView?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}): ShortcutMap {
  const map: ShortcutMap = {};
  if (handlers.onSave) map["ctrl+s"] = () => handlers.onSave!();
  if (handlers.onBatchExport) map["ctrl+e"] = () => handlers.onBatchExport!();
  if (handlers.onReRunCompliance) map["ctrl+r"] = () => handlers.onReRunCompliance!();
  if (handlers.onToggleView) map["ctrl+shift+v"] = () => handlers.onToggleView!();
  if (handlers.onUndo) map["ctrl+z"] = () => handlers.onUndo!();
  if (handlers.onRedo) map["ctrl+y"] = () => handlers.onRedo!();
  return map;
}