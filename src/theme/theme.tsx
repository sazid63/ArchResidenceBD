import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type Theme = "light" | "dark" | "high-contrast";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const KEY = "archres-theme";
const HC_KEY = "archres-high-contrast";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(KEY) as Theme | null;
    const hc = localStorage.getItem(HC_KEY) === "true";
    if (hc) return "high-contrast";
    return saved === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    const isHC = theme === "high-contrast";
    document.documentElement.dataset.theme = isHC ? "dark" : theme;
    document.documentElement.dataset.highContrast = isHC ? "true" : "false";
    localStorage.setItem(KEY, isHC ? "dark" : theme);
    localStorage.setItem(HC_KEY, isHC ? "true" : "false");
  }, [theme]);

  const toggle = () => {
    setTheme((t) => {
      if (t === "light") return "dark";
      if (t === "dark") return "high-contrast";
      return "light";
    });
  };

  const value = useMemo(
    () => ({ theme, toggle, setTheme }),
    [theme],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
