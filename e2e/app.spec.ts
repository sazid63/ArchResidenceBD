import { expect, test } from "@playwright/test";

// A first-time user: welcome screen, the sample building, then the result screens and a project file.
test("first run to results and a project file", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Screening design for Dhaka/ })).toBeVisible();
  await page.getByRole("button", { name: "Open sample" }).click();

  await page.goto("/#/compliance");
  await expect(page.getByText("Maximum ground coverage")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Dwellings and daylight")).toBeVisible();

  await page.goto("/#/structure");
  await expect(page.getByText(/screening/i).first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/#/boq");
  await expect(page.getByText(/Total|lower bound/i).first()).toBeVisible({ timeout: 30_000 });

  await page.goto("/#/formwork");
  await expect(page.getByText("Total form area")).toBeVisible({ timeout: 30_000 });

  await page.goto("/#/projects");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).first().click()]);
  expect(download.suggestedFilename()).toMatch(/\.archres$/);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("Bangla is remembered after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "বাংলা" }).click();
  await expect(page.getByRole("heading", { name: /ঢাকার আবাসিক ভবনের/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /ঢাকার আবাসিক ভবনের/ })).toBeVisible();
});
