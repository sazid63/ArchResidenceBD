import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/** What the user picked. "system" follows the operating system's light/dark setting. */
export type ThemeChoice = "system" | "light" | "dark" | "high-contrast";
/** What is actually on screen. */
export type ResolvedTheme = "light" | "dark";

interface ThemeCtx {
  /** The user's choice. */
  theme: ThemeChoice;
  /** The light/dark mode currently shown (system resolved). */
  resolved: ResolvedTheme;
  highContrast: boolean;
  setTheme: (t: ThemeChoice) => void;
  /** Cycles light → dark → system (high contrast is chosen in Settings). */
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const KEY = "archres-theme";
const HC_KEY = "archres-high-contrast";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice just won't persist */
  }
}

function initialChoice(): ThemeChoice {
  if (read(HC_KEY) === "true") return "high-contrast";
  const saved = read(KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.(DARK_QUERY).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeChoice>(initialChoice);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS setting live while "system" is chosen.
  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const highContrast = theme === "high-contrast";
  const resolved: ResolvedTheme =
    theme === "dark" || highContrast ? "dark" : theme === "light" ? "light" : systemDark ? "dark" : "light";

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.highContrast = highContrast ? "true" : "false";
    write(KEY, highContrast ? "dark" : theme);
    write(HC_KEY, highContrast ? "true" : "false");
  }, [theme, resolved, highContrast]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      resolved,
      highContrast,
      setTheme,
      toggle: () => setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light")),
    }),
    [theme, resolved, highContrast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
