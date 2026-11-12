import { beforeEach, describe, expect, it } from "vitest";
import { clearHealth, dismissHealth, getHealth, installGlobalErrorCapture, reportHealth, subscribeHealth } from "./appHealth";

beforeEach(() => clearHealth());

describe("app health log", () => {
  it("records, deduplicates, dismisses and notifies", () => {
    let calls = 0;
    const off = subscribeHealth(() => calls++);
    reportHealth("write_failed", "a", "অ");
    reportHealth("write_failed", "a", "অ");
    expect(getHealth()).toHaveLength(1);
    expect(calls).toBe(1);
    dismissHealth(getHealth()[0].id);
    expect(getHealth()).toHaveLength(0);
    off();
  });

  it("keeps at most ten entries", () => {
    for (let i = 0; i < 15; i++) reportHealth("runtime", `e${i}`, `e${i}`);
    expect(getHealth()).toHaveLength(10);
    expect(getHealth().at(-1)!.en).toBe("e14");
  });

  it("captures unhandled errors and rejections", () => {
    const handlers: Record<string, (e: unknown) => void> = {};
    installGlobalErrorCapture({ addEventListener: (t: string, h: unknown) => void (handlers[t] = h as (e: unknown) => void) } as unknown as Window);
    handlers.error({ error: new Error("boom"), message: "boom" });
    handlers.unhandledrejection({ reason: "nope" });
    const en = getHealth().map((e) => e.en);
    expect(en).toEqual(["Unexpected error: boom", "Unexpected error: nope"]);
    expect(getHealth()[0].detail).toMatch(/boom/);
  });
});
