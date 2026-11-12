// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { ProjectProvider } from "../context/ProjectContext";
import { create4StoryBuildingProject } from "../engine/projectState";
import { I18nProvider } from "../i18n";
import { ThemeProvider } from "../theme/theme";
import { AboutScreen } from "./AboutScreen";
import { BoqScreen } from "./BoqScreen";
import { ComplianceScreen } from "./ComplianceScreen";
import { DrawingsScreen } from "./DrawingsScreen";
import { FormworkScaffoldScreen } from "./FormworkScaffoldScreen";
import { HelpScreen } from "./HelpScreen";
import { PourSequenceScreen } from "./PourSequenceScreen";
import { ProjectsScreen } from "./ProjectsScreen";
import { RebarScheduleScreen } from "./RebarScheduleScreen";
import { StructureScreen } from "./StructureScreen";
import { UnitsScreen } from "./UnitsScreen";
import { WelcomeScreen } from "./WelcomeScreen";

const wrap = (ui: ReactElement) => (
  <ThemeProvider>
    <I18nProvider>
      <ProjectProvider>{ui}</ProjectProvider>
    </I18nProvider>
  </ThemeProvider>
);

let errors: unknown[][] = [];

beforeEach(() => {
  localStorage.clear();
  create4StoryBuildingProject(); // the sample building: a real plot and plan
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...a) => void errors.push(a));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** What each screen shows for the sample building: a heading and one figure that only the real result has. */
const CASES: Array<[string, () => ReactElement, RegExp]> = [
  ["Compliance", () => <ComplianceScreen />, /Maximum ground coverage/],
  ["Structure", () => <StructureScreen />, /Structure|screening/i],
  ["Rebar schedule", () => <RebarScheduleScreen />, /Total steel/],
  ["BOQ", () => <BoqScreen />, /Bill of quantities|BOQ/i],
  ["Formwork", () => <FormworkScaffoldScreen />, /Total form area/],
  ["Pour sequence", () => <PourSequenceScreen />, /Total concrete/],
  ["Drawings", () => <DrawingsScreen />, /Sheet/],
  ["Projects", () => <ProjectsScreen onNavigate={() => undefined} />, /Import file/],
  ["About", () => <AboutScreen onOpenLicences={() => undefined} />, /Version/i],
  ["Help", () => <HelpScreen />, /Help|manual/i],
  ["Land units", () => <UnitsScreen />, /katha/i],
];

describe("screens render for the sample building without console errors", () => {
  for (const [name, make, expected] of CASES) {
    it(name, async () => {
      render(wrap(make()));
      await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0), { timeout: 20000 });
      expect(errors, `${name} logged console errors`).toEqual([]);
    }, 30000);
  }

  it("the Formwork screen follows the language switch", async () => {
    localStorage.setItem("archres_lang", "bn");
    render(wrap(<FormworkScaffoldScreen />));
    await waitFor(() => expect(screen.getAllByText(/ফর্ম/).length).toBeGreaterThan(0), { timeout: 20000 });
  }, 30000);
});

describe("welcome screen (first run)", () => {
  it("offers a new project, the sample and a project file", () => {
    const calls: string[] = [];
    render(wrap(<WelcomeScreen onNewProject={() => calls.push("new")} onSample={() => calls.push("sample")} onImported={() => calls.push("imported")} />));
    screen.getByText("New project").click();
    screen.getByText("Open sample").click();
    expect(calls).toEqual(["new", "sample"]);
    expect(screen.getByText("Open file")).toBeTruthy();
  });
});

describe("Structure screen with the lift core as a shear wall", () => {
  it("an 8-storey building shows the dual system and the core wall table", async () => {
    const { saveActiveProject, getActiveProject } = await import("../engine/projectState");
    const p = getActiveProject()!;
    saveActiveProject({ ...p, stories: 8 });
    render(wrap(<StructureScreen />));
    await waitFor(() => expect(screen.getAllByText(/Core shear wall \(lift shaft\)/).length).toBeGreaterThan(0), { timeout: 20000 });
    expect(screen.getAllByText(/Dual system \(Table 6\.2\.19\)/).length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  }, 40000);
});
