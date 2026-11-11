import { defineConfig } from "@playwright/test";

// End-to-end checks against the production build served by `vite preview` (run `npm run build` first; CI does).
// Locally the installed Chrome is used; in CI `npx playwright install chromium` provides the browser.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: "http://localhost:4173", ...(process.env.CI ? {} : { channel: "chrome" }), acceptDownloads: true },
  webServer: { command: "npx vite preview --port 4173 --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, timeout: 60_000 },
});
