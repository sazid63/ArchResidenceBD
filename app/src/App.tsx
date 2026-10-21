import { useState } from "react";

import { Sidebar } from "./layout/Sidebar";
import { BoqScreen } from "./screens/BoqScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { NativeCadScreen } from "./screens/NativeCadScreen";
import { PhaseChatScreen } from "./screens/PhaseChatScreen";
import { ProjectSetupScreen } from "./screens/ProjectSetupScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
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
  if (view.startsWith("docs:")) return <DocumentsScreen />;
  return <ProjectsScreen onNavigate={navigate} />;
}
