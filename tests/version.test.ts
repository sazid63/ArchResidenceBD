import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_BUILD, APP_VERSION } from "../src/version";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json")) as { version: string };

describe("one version number", () => {
  it("is a plain semver in package.json", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is what the app shows", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("has a build stamp for the About screen", () => {
    expect(APP_BUILD.length).toBeGreaterThan(0);
  });

  it("is read by Tauri from package.json", () => {
    const conf = JSON.parse(read("src-tauri/tauri.conf.json")) as { version: string };
    expect(conf.version).toBe("../package.json");
  });

  it("matches Cargo.toml", () => {
    const cargo = read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    expect(cargo).toBe(pkg.version);
  });

  it("matches package-lock.json", () => {
    const lock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[""].version).toBe(pkg.version);
  });

  it("matches the README title", () => {
    expect(read("README.md").split("\n")[0]).toContain(`v${pkg.version}`);
  });
});
