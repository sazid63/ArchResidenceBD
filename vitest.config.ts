import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// Unit tests run in Node: the engines under test are pure TypeScript with no DOM. Screen tests (*.test.tsx) opt in to jsdom with
// a `// @vitest-environment jsdom` comment on their first line.
// The audit scripts in scripts/ stay as they are and run separately (npm run verify).
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    environment: "node",
    // Generous: golden and property-style tests are slow when mutation testing or CI runs several workers at once.
    testTimeout: 30000,
  },
});
