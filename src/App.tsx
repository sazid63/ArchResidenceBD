import { useCallback, useEffect, useRef, useState } from "react";

import { Sidebar } from "./layout/Sidebar";
import { AboutScreen } from "./screens/AboutScreen";
import { AssetsLibraryScreen } from "./screens/AssetsLibraryScreen";
import { BoqScreen } from "./screens/BoqScreen";
import { ComplianceScreen } from "./screens/ComplianceScreen";
import { StructureScreen } from "./screens/StructureScreen";
import { DocumentsScreen } from "./screens/DocumentsScreen";
import { DrawingsScreen } from "./screens/DrawingsScreen";
import { FormworkScaffoldScreen } from "./screens/FormworkScaffoldScreen";
import { PourSequenceScreen } from "./screens/PourSequenceScreen";
import { RebarScheduleScreen } from "./screens/RebarScheduleScreen";
import { ConnectionDetailingScreen } from "./screens/ConnectionDetailingScreen";
import { DaylightAnalysisScreen } from "./screens/DaylightAnalysisScreen";
import { UnitMixOptimizerScreen } from "./screens/UnitMixOptimizerScreen";
import { ColumnGridOptimizerScreen } from "./screens/ColumnGridOptimizerScreen";
import { HelpScreen } from "./screens/HelpScreen";
import { LicencesScreen } from "./screens/LicencesScreen";
import { NativeCadScreen } from "./screens/NativeCadScreen";
import { PhaseChatScreen } from "./screens/PhaseChatScreen";
import { ProjectSetupScreen } from "./screens/ProjectSetupScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { TemplatesScreen } from "./screens/TemplatesScreen";
import { UnitsScreen } from "./screens/UnitsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { activateSavedProject, getActiveProject, create4StoryBuildingProject } from "./engine/projectState";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useHashRoute } from "./hooks/useHashRoute";
import { useI18n } from "./i18n";
import { useActiveProject } from "./context/ProjectContext";
import { ProjectProvider } from "./context/ProjectContext";
import "./app.css";

const SCREEN_TITLES: Record<string, [string, string]> = {
  setup: ["New project", "নতুন প্রকল্প"],
  projects: ["My Projects", "আমার প্রকল্পসমূহ"],
  boq: ["Bill of Quantities", "বিল অব কোয়ান্টিটিজ"],
  assets: ["Asset Library", "অ্যাসেট লাইব্রেরি"],
  compliance: ["Code Compliance", "কোড কমপ্লায়েন্স"],
  structure: ["Structure", "কাঠামো"],
  formwork: ["Formwork", "ফর্মওয়ার্ক"],
  pour: ["Pour Sequence", "পোর সিকোয়েন্স"],
  rebar: ["Rebar Schedule", "রিবার শিডিউল"],
  connections: ["Connections", "সংযোগ"],
  daylight: ["Daylight", "দিনের আলো"],
  "unit-mix": ["Unit Mix", "ইউনিট মিক্স"],
  "column-grid": ["Column Grid", "কলাম গ্রিড"],
  settings: ["Settings", "সেটিংস"],
  units: ["Land Units", "জমির একক"],
  templates: ["Templates", "টেমপ্লেট"],
  about: ["About", "সম্পর্কে"],
  help: ["Help", "সহায়তা"],
  licences: ["Licences", "লাইসেন্স"],
  "docs:drawings": ["Drawings", "ড্রয়িং"],
};

function Shell() {
  const [view, setView] = useHashRoute("design:final");
  const [menuOpen, setMenuOpen] = useState(false);
  const { lang } = useI18n();
  const project = useActiveProject();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const navigate = useCallback((id: string) => {
    setView(id);
    setMenuOpen(false);
  }, [setView]);

  const title = (() => {
    const known = SCREEN_TITLES[view];
    if (known) return known[lang === "bn" ? 1 : 0];
    if (view.startsWith("phase:")) {
      const ph = project?.phases.find((p) => p.id === view.slice(6));
      return ph ? (lang === "bn" ? ph.nameBn : ph.nameEn) : "Phase";
    }
    if (view.startsWith("design:")) return view === "design:final" ? (lang === "bn" ? "৩ডি মডেল" : "3D model") : "3D design";
    return "ArchResidenceBD";
  })();

  // Page title + focus/scroll reset on navigation (keyboard and screen-reader users land on the new screen).
  useEffect(() => {
    document.title = `${title} · ArchResidenceBD`;
    if (firstRender.current) { firstRender.current = false; return; }
    mainRef.current?.scrollTo?.({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [view, title]);

  // Drawer: Escape closes it, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => { document.removeEventListener("keydown", onKey); document.body.classList.remove("no-scroll"); };
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        {lang === "bn" ? "মূল কনটেন্টে যান" : "Skip to main content"}
      </a>
      <Sidebar active={view} onNavigate={navigate} open={menuOpen} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="app-body">
        <header className="mobile-bar">
          <button
            type="button"
            className="mobile-bar-btn"
            aria-label={lang === "bn" ? "মেনু খুলুন" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <span className="mobile-bar-title">{title}</span>
        </header>
        <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
          <ErrorBoundary
            resetKey={view}
            onRecover={() => navigate("setup")}
            recoverLabel={lang === "bn" ? "শুরুতে ফিরুন" : "Back to start"}
          >
            {renderView(view, navigate)}
          </ErrorBoundary>
        </main>
      </div>
      <PWAInstallPrompt />
    </div>
  );
}

export function App() {
  // First visit: create the demo 4-storey project once so the app opens on something real.
  useState(() => {
    // Reopen the most recent saved project; only a truly empty install gets the demo.
    if (!getActiveProject() && !activateSavedProject()) create4StoryBuildingProject();
    return null;
  });
  return (
    <ProjectProvider>
      <Shell />
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
  if (view === "projects") return <ProjectsScreen onNavigate={navigate} />;
  if (view === "boq") return <BoqScreen />;
  if (view === "assets") return <AssetsLibraryScreen />;
  if (view === "compliance") return <ComplianceScreen />;
  if (view === "structure") return <StructureScreen />;
  if (view === "formwork") return <FormworkScaffoldScreen />;
  if (view === "pour") return <PourSequenceScreen />;
  if (view === "rebar") return <RebarScheduleScreen />;
  if (view === "connections") return <ConnectionDetailingScreen />;
  if (view === "daylight") return <DaylightAnalysisScreen />;
  if (view === "unit-mix") return <UnitMixOptimizerScreen />;
  if (view === "column-grid") return <ColumnGridOptimizerScreen />;
  if (view === "settings") return <SettingsScreen />;
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
