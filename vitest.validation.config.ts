import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// Slow validation (property tests over the whole design pipeline, about a minute) runs here, apart from the unit tests.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["src/validation/**/*.property.ts"],
    environment: "node",
    testTimeout: 180000,
  },
});
