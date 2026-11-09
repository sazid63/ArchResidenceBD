import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// Audits that need the Vite pipeline (rule packs load through ?raw) run here, apart from the unit tests.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["scripts/audits/**/*.audit.ts"],
    environment: "node",
    testTimeout: 60000,
  },
});
