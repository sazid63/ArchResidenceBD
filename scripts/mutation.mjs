/**
 * Mutation testing in a throwaway copy of the repository. `npm run test:mutation [-- --mutate src/structure/section.ts]`
 *
 * Stryker's in-place mode (needed because it cannot read tsconfig with TypeScript 7) rewrites every file of the project and puts
 * them back at the end. If the run is killed, the project is left instrumented. So the project is copied first (tracked and
 * untracked files that are not ignored, node_modules linked, not copied), Stryker runs in the copy, and only the reports come back.
 *
 * Without arguments it mutates the files listed in stryker.config.json. The reports are in reports/mutation/.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const work = join(tmpdir(), "archres-mutation-copy");

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 1 << 28 })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .filter((f) => !f.startsWith(".claude/") && !f.startsWith("src-tauri/target/") && !f.startsWith("reports/"));
for (const f of listed) {
  const from = join(root, f);
  if (!existsSync(from)) continue; // deleted in the working tree but still listed
  const to = join(work, f);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
symlinkSync(join(root, "node_modules"), join(work, "node_modules"), "junction");
console.log(`copied ${listed.length} files to ${work}`);

const args = process.argv.slice(2);
const run = spawnSync(process.execPath, [join(work, "node_modules", "@stryker-mutator", "core", "bin", "stryker.js"), "run", ...args], { cwd: work, stdio: "inherit" });

const out = join(work, "reports", "mutation");
if (existsSync(out)) {
  mkdirSync(join(root, "reports"), { recursive: true });
  cpSync(out, join(root, "reports", "mutation"), { recursive: true });
  console.log(`reports copied to ${join(root, "reports", "mutation")}`);
}
rmSync(work, { recursive: true, force: true });
process.exit(run.status ?? 1);
