import { useState } from "react";

import { Sidebar } from "./layout/Sidebar";
import { AboutScreen } from "./screens/AboutScreen";
import { BoqScreen } from "./screens/BoqScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { HelpScreen } from "./screens/HelpScreen";
import { ImportReviewScreen } from "./screens/ImportReviewScreen";
import { LicencesScreen } from "./screens/LicencesScreen";
import { NativeCadScreen } from "./screens/NativeCadScreen";
import { PhaseChatScreen } from "./screens/PhaseChatScreen";
import { ProjectSetupScreen } from "./screens/ProjectSetupScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { TemplatesScreen } from "./screens/TemplatesScreen";
import { UnitsScreen } from "./screens/UnitsScreen";
import "./app.css";

export function App() {
  const [view, setView] = useState("projects");

  return (
    <div className="app-shell">
      <Sidebar active={view} onNavigate={setView} />
      <main className="app-main">{renderView(view, setView)}</main>
    </div>
  );
}

function renderView(view: string, navigate: (id: string) => void) {
  if (view === "setup") return <ProjectSetupScreen onNavigate={navigate} />;
  if (view.startsWith("phase:")) return <PhaseChatScreen phaseId={view.slice("phase:".length)} />;
  // The design section opens the NativeCAD workspace: the engine's own geometry, not a mock.
  if (view.startsWith("design:")) return <NativeCadScreen />;
  if (view === "boq") return <BoqScreen />;
  if (view === "import-review") return <ImportReviewScreen />;
  // The legal surface: the required notices live here and nowhere else (ADR-0004).
  if (view === "licences") return <LicencesScreen />;
  // The offline help: the app answers with no network and no model (W5.5).
  if (view === "help") return <HelpScreen />;
  // The land-unit converter and the project's templates (W5.7).
  if (view === "units") return <UnitsScreen />;
  if (view === "templates")
    return <TemplatesScreen onPick={() => navigate("setup")} />;
  if (view === "about")
    return <AboutScreen onOpenLicences={() => navigate("licences")} />;
  if (view.startsWith("docs:")) return <DocumentsScreen />;
  return <ProjectsScreen onNavigate={navigate} />;
}
