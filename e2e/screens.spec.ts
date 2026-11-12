import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Every screen, in English and Bangla: it opens with a heading, raises no console or page errors, and has no
// serious or critical accessibility violations (axe, WCAG 2.0/2.1 A and AA).
const ROUTES = [
  "projects", "compliance", "structure", "rebar", "boq", "schedules", "formwork", "pour", "column-grid",
  "templates", "units", "settings", "help", "about", "licences", "docs/drawings", "design/final", "setup",
];

async function openSample(page: Page, lang: "en" | "bn") {
  await page.goto("/");
  if (lang === "bn") await page.getByRole("button", { name: "বাংলা" }).click();
  await page.getByRole("button", { name: lang === "bn" ? /নমুনা/ : "Open sample" }).click();
}

for (const lang of ["en", "bn"] as const) {
  test(`all screens open cleanly and pass axe (${lang})`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await openSample(page, lang);

    const problems: string[] = [];
    for (const route of ROUTES) {
      await page.goto(`/#/${route}`);
      await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 30_000 });
      // The design screens compute in a worker: wait until the pending state is gone.
      await expect(page.getByText(/Computing the design|হিসাব চলছে/)).toHaveCount(0, { timeout: 30_000 });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of results.violations.filter((x) => x.impact === "serious" || x.impact === "critical")) {
        problems.push(`${route}: ${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target.join(" ")}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}

test("the door and window schedule matches the drawn building and downloads as CSV", async ({ page }) => {
  await openSample(page, "en");
  await page.goto("/#/schedules");
  await expect(page.getByRole("heading", { name: "Door and window schedule" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("cell", { name: "D1" })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/-openings\.csv$/);
});

test("a project file survives export and import", async ({ page }) => {
  await openSample(page, "en");
  await page.goto("/#/projects");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export", exact: true }).first().click()]);
  const path = await download.path();
  expect(path).toBeTruthy();
  // Import it back: the file chooser accepts the exported file and the project list still shows the sample.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Import|Open file/ }).first().click();
  await (await chooser).setFiles(path!);
  await expect(page.getByText(/Sample block/).first()).toBeVisible({ timeout: 15_000 });
});

test("a hostile project name is shown as text, never as markup", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await openSample(page, "en");
  await page.evaluate(() => {
    const k = "archres_v2_active_project";
    const p = JSON.parse(localStorage.getItem(k) ?? "null");
    if (p) { p.name = '<img src=x onerror="window.__pwned=1">'; localStorage.setItem(k, JSON.stringify(p)); }
  });
  await page.goto("/#/docs/drawings");
  await page.reload();
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});
