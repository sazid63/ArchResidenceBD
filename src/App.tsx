import { useState } from "react";

import { Sidebar } from "./layout/Sidebar";
import { AboutScreen } from "./screens/AboutScreen";
import { AssetsLibraryScreen } from "./screens/AssetsLibraryScreen";
import { BoqScreen } from "./screens/BoqScreen";
import { ComplianceScreen } from "./screens/ComplianceScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { DrawingsScreen } from "./screens/DrawingsScreen";
import { FormworkScaffoldScreen } from "./screens/FormworkScaffoldScreen";
import { PourSequenceScreen } from "./screens/PourSequenceScreen";
import { RebarScheduleScreen } from "./screens/RebarScheduleScreen";
import { ConnectionDetailingScreen } from "./screens/ConnectionDetailingScreen";
import { DaylightAnalysisScreen } from "./screens/DaylightAnalysisScreen";
import { UnitMixOptimizerScreen } from "./screens/UnitMixOptimizerScreen";
import { ColumnGridOptimizerScreen } from "./screens/ColumnGridOptimizerScreen";
import { FleetScreen } from "./screens/FleetScreen";
import { HelpScreen } from "./screens/HelpScreen";
import { ImportReviewScreen } from "./screens/ImportReviewScreen";
import { LicencesScreen } from "./screens/LicencesScreen";
import { NativeCadScreen } from "./screens/NativeCadScreen";
import { PhaseChatScreen } from "./screens/PhaseChatScreen";
import { ProjectSetupScreen } from "./screens/ProjectSetupScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { TemplatesScreen } from "./screens/TemplatesScreen";
import { UnitsScreen } from "./screens/UnitsScreen";
import { WindowsInstallerScreen } from "./screens/WindowsInstallerScreen";
import { getActiveProject, create4StoryBuildingProject } from "./engine/projectState";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { ProjectProvider } from "./context/ProjectContext";
import "./app.css";

export function App() {
  const [view, setView] = useState(() => {
    // Restore existing project if present, otherwise create fresh 4-storey building project
    const active = getActiveProject();
    if (active) return "design:final";
    create4StoryBuildingProject();
    return "design:final";
  });

  return (
    <ProjectProvider>
      <div className="app-shell">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Sidebar active={view} onNavigate={setView} />
        <main id="main-content" tabIndex={-1} className="app-main">
          {renderView(view, setView)}
        </main>
        <PWAInstallPrompt />
      </div>
    </ProjectProvider>
  );
}

function renderView(
  view: string,
  navigate: (id: string) => void,
) {
  if (view === "setup") {
    return <ProjectSetupScreen onNavigate={navigate} onProjectCreated={() => navigate("phase:phase-site")} />;
  }
  if (view.startsWith("phase:")) {
    return (
      <PhaseChatScreen
        phaseId={view.slice("phase:".length)}
        onNavigate={navigate}
      />
    );
  }
  if (view.startsWith("design:")) {
    return (
      <NativeCadScreen
        designPhaseId={view.slice("design:".length)}
        onNavigate={navigate}
      />
    );
  }
  if (view === "boq") return <BoqScreen />;
  if (view === "assets") return <AssetsLibraryScreen />;
  if (view === "compliance") return <ComplianceScreen />;
  if (view === "formwork") return <FormworkScaffoldScreen />;
  if (view === "pour") return <PourSequenceScreen />;
  if (view === "rebar") return <RebarScheduleScreen />;
  if (view === "connections") return <ConnectionDetailingScreen />;
  if (view === "daylight") return <DaylightAnalysisScreen />;
  if (view === "unit-mix") return <UnitMixOptimizerScreen />;
  if (view === "column-grid") return <ColumnGridOptimizerScreen />;
  if (view === "fleet") return <FleetScreen />;
  if (view === "windows") return <WindowsInstallerScreen />;
  if (view === "import-review") return <ImportReviewScreen />;
  if (view === "licences") return <LicencesScreen />;
  if (view === "help") return <HelpScreen />;
  if (view === "units") return <UnitsScreen />;
  if (view === "templates") return <TemplatesScreen onPick={() => navigate("setup")} />;
  if (view === "about") return <AboutScreen onOpenLicences={() => navigate("licences")} />;
  if (view.startsWith("docs:")) {
    const docType = view.slice("docs:".length);
    if (docType === "drawings") return <DrawingsScreen />;
    return <DocumentsScreen />;
  }
  return <ProjectSetupScreen onNavigate={navigate} onProjectCreated={() => navigate("phase:phase-site")} />;
}
