// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create4StoryBuildingProject, saveActiveProject } from "../engine/projectState";
import { I18nProvider } from "../i18n";
import { clearHealth, installGlobalErrorCapture } from "../model/appHealth";
import { HealthBanner } from "./HealthBanner";

const show = () => render(<I18nProvider><HealthBanner /></I18nProvider>);

beforeEach(() => {
  localStorage.clear();
  clearHealth();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearHealth();
});

describe("health banner", () => {
  it("shows nothing when all is well", () => {
    const { container } = show();
    expect(container.textContent).toBe("");
  });

  it("tells the user when a save fails because storage is full", () => {
    const project = create4StoryBuildingProject();
    show();
    const quota = new DOMException("quota", "QuotaExceededError");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quota; });
    act(() => saveActiveProject(project));
    expect(screen.getByRole("alert").textContent).toMatch(/could NOT be saved/);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("shows an unhandled error and lets the user save a report", () => {
    installGlobalErrorCapture(window);
    show();
    act(() => { window.dispatchEvent(new ErrorEvent("error", { error: new Error("boom"), message: "boom" })); });
    expect(screen.getByRole("alert").textContent).toMatch(/Unexpected error: boom/);
    expect(screen.getByRole("button", { name: "Save problem report" })).toBeTruthy();
  });

  it("dismissing removes the message", () => {
    installGlobalErrorCapture(window);
    show();
    act(() => { window.dispatchEvent(new ErrorEvent("error", { error: new Error("once"), message: "once" })); });
    act(() => screen.getByRole("button", { name: "Dismiss" }).click());
    expect(screen.queryByText(/once/)).toBeNull();
  });
});
