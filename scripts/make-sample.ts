/**
 * Writes samples/sample-4-storey.archres: the sample building as a project file, for the Getting started guide and for trying
 * "Open a project file". Run: npm run make:sample
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createNewProject } from "../src/engine/projectState";
import type { V2Project } from "../src/model/legacyV2";
import { migrateV2 } from "../src/model/migrate";
import { exportProjects } from "../src/model/projectFile";
import { planChoices } from "../src/model/planChoices";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = (JSON.parse((await import("node:fs")).readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;

const choices = planChoices(18, 28, { unitsPerFloor: 2, storeys: 4, roadWidthM: 9 });
const pick = choices.find((c) => c.fit.ok && c.coverage?.status !== "fail") ?? choices.find((c) => c.fit.ok);
if (!pick) throw new Error("no plan fits the sample plot");
const project = createNewProject({
  name: "Sample block (4 storeys)",
  stories: 4,
  plotSize: 7.5,
  plotUnit: "katha",
  unitsPerFloor: 2,
  address: "Dhaka",
  plot: { frontageM: 18, depthM: 28, roadWidthM: 9, roadSide: "south" },
  planId: pick.plan.id,
});
const now = "2026-11-12T00:00:00.000Z";
const spec = migrateV2({ ...(project as unknown as V2Project), createdAt: now, updatedAt: now }, now);
mkdirSync(join(root, "samples"), { recursive: true });
writeFileSync(join(root, "samples", "sample-4-storey.archres"), exportProjects([spec], version, now));
console.log("wrote samples/sample-4-storey.archres with plan", pick.plan.id);
