import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

// The tests mutation testing runs. Left out: the slow whole-pipeline sweeps (they time out under instrumentation) and the golden
// hashes (they would kill nearly every mutant by pinning outputs, which says nothing about whether the unit tests assert anything).
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: {
    include: process.env.MUTATION_TESTS ? process.env.MUTATION_TESTS.split(",") : ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "src/model/toMesh.test.ts",
      "src/plans/balcony.test.ts",
      "src/drawings/pdf.test.ts",
      "src/screens/screens.smoke.test.tsx",
      "src/structure/foundation.test.ts",
      "src/design/design.test.ts",
      "src/validation/golden.test.ts",
      "src/structure/rebar.test.ts",
    ],
    environment: "node",
    testTimeout: 60000,
  },
});
