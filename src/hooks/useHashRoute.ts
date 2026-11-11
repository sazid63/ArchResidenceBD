import { useCallback, useEffect, useState } from "react";

/**
 * Keeps the current screen in the URL hash so Back/Forward, refresh and shared links work.
 *   "boq" <-> #/boq,  "phase:phase-site" <-> #/phase/phase-site,  "design:final" <-> #/design/final
 */
const PLAIN = new Set([
  "setup", "projects", "boq", "assets", "compliance", "structure", "formwork", "pour", "rebar",
  "column-grid", "licences", "help", "units", "templates", "about", "settings",
]);
const PREFIXED = ["phase", "design", "docs"];

export const viewToHash = (view: string) => "#/" + view.replace(":", "/");

export function hashToView(hash: string): string | null {
  const raw = hash.replace(/^#\/?/, "");
  if (!raw) return null;
  const i = raw.indexOf("/");
  if (i < 0) return PLAIN.has(raw) ? raw : null;
  const head = raw.slice(0, i);
  const tail = raw.slice(i + 1);
  return PREFIXED.includes(head) && tail ? `${head}:${decodeURIComponent(tail)}` : null;
}

export function useHashRoute(fallback: string): [string, (view: string) => void] {
  const [view, setViewState] = useState<string>(() => hashToView(window.location.hash) ?? fallback);

  useEffect(() => {
    const onHash = () => setViewState(hashToView(window.location.hash) ?? fallback);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [fallback]);

  // Make the URL reflect the initial screen without adding a history entry.
  useEffect(() => {
    if (!hashToView(window.location.hash)) window.history.replaceState(null, "", viewToHash(view));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = useCallback((next: string) => {
    const target = viewToHash(next);
    if (window.location.hash !== target) window.location.hash = target; // pushes a history entry
    setViewState(next);
  }, []);

  return [view, setView];
}
