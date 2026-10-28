import { useState, useEffect } from "react";

import { Sidebar } from "./layout/Sidebar";
import { AboutScreen } from "./screens/AboutScreen";
import { AssetsLibraryScreen } from "./screens/AssetsLibraryScreen";
import { BoqScreen } from "./screens/BoqScreen";
import { ComplianceScreen } from "./screens/ComplianceScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
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
import "./app.css";

export function App() {
  const [projectVersion, setProjectVersion] = useState(0);
  const [view, setView] = useState(() => {
    // Purge previous projects and generate fresh 4-storey building project
    const active = create4StoryBuildingProject();
    return "design:final";
  });

  const refreshProject = () => setProjectVersion((v) => v + 1);

  return (
    <div className="app-shell">
      <Sidebar active={view} onNavigate={setView} projectVersion={projectVersion} />
      <main className="app-main">{renderView(view, setView, refreshProject)}</main>
    </div>
  );
}

function renderView(
  view: string,
  navigate: (id: string) => void,
  refreshProject: () => void,
) {
  if (view === "setup") {
    return <ProjectSetupScreen onNavigate={navigate} onProjectCreated={refreshProject} />;
  }
  if (view.startsWith("phase:")) {
    return (
      <PhaseChatScreen
        phaseId={view.slice("phase:".length)}
        onNavigate={navigate}
        onProjectUpdated={refreshProject}
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
  if (view === "fleet") return <FleetScreen />;
  if (view === "windows") return <WindowsInstallerScreen />;
  if (view === "import-review") return <ImportReviewScreen />;
  if (view === "licences") return <LicencesScreen />;
  if (view === "help") return <HelpScreen />;
  if (view === "units") return <UnitsScreen />;
  if (view === "templates") return <TemplatesScreen onPick={() => navigate("setup")} />;
  if (view === "about") return <AboutScreen onOpenLicences={() => navigate("licences")} />;
  if (view.startsWith("docs:")) return <DocumentsScreen />;
  return <ProjectSetupScreen onNavigate={navigate} onProjectCreated={refreshProject} />;
}
