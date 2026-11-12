import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme/theme";
import "./theme/tokens.css";
import "./theme/base.css";
import "./index.css";
import { installGlobalErrorCapture } from "./model/appHealth";

installGlobalErrorCapture();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
);

// Service worker: production web builds only. Not in dev (it served stale modules there) and not in the
// desktop shell (the installer already ships every file).
const inDesktopShell = "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD && !inDesktopShell) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[PWA] Service worker registration failed:", err));
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister())).catch(() => undefined);
    caches.keys().then((ks) => ks.filter((k) => k.startsWith("archresidencebd-")).forEach((k) => void caches.delete(k))).catch(() => undefined);
  }
}
