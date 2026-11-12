import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import { WelcomeScreen } from "./screens/WelcomeScreen";
import { Sidebar } from "./layout/Sidebar";
import { activateSavedProject, getActiveProject, create4StoryBuildingProject } from "./engine/projectState";
import { PWAInstallPrompt } from "./components/PWAInstallPrompt";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { HealthBanner } from "./components/HealthBanner";
import { useHashRoute } from "./hooks/useHashRoute";
import { useI18n } from "./i18n";
import { useActiveProject } from "./context/ProjectContext";
import { ProjectProvider } from "./context/ProjectContext";
import "./app.css";

// Screens load on demand so the first paint ships only the shell (see scripts/check-bundle-size.mjs).
const AboutScreen = lazy(() => import("./screens/AboutScreen").then((m) => ({ default: m.AboutScreen })));
const AssetsLibraryScreen = lazy(() => import("./screens/AssetsLibraryScreen").then((m) => ({ default: m.AssetsLibraryScreen })));
const BoqScreen = lazy(() => import("./screens/BoqScreen").then((m) => ({ default: m.BoqScreen })));
const ComplianceScreen = lazy(() => import("./screens/ComplianceScreen").then((m) => ({ default: m.ComplianceScreen })));
const StructureScreen = lazy(() => import("./screens/StructureScreen").then((m) => ({ default: m.StructureScreen })));
const DocumentsScreen = lazy(() => import("./screens/DocumentsScreen").then((m) => ({ default: m.DocumentsScreen })));
const DrawingsScreen = lazy(() => import("./screens/DrawingsScreen").then((m) => ({ default: m.DrawingsScreen })));
const FormworkScaffoldScreen = lazy(() => import("./screens/FormworkScaffoldScreen").then((m) => ({ default: m.FormworkScaffoldScreen })));
const PourSequenceScreen = lazy(() => import("./screens/PourSequenceScreen").then((m) => ({ default: m.PourSequenceScreen })));
const RebarScheduleScreen = lazy(() => import("./screens/RebarScheduleScreen").then((m) => ({ default: m.RebarScheduleScreen })));
const ColumnGridOptimizerScreen = lazy(() => import("./screens/ColumnGridOptimizerScreen").then((m) => ({ default: m.ColumnGridOptimizerScreen })));
const HelpScreen = lazy(() => import("./screens/HelpScreen").then((m) => ({ default: m.HelpScreen })));
const LicencesScreen = lazy(() => import("./screens/LicencesScreen").then((m) => ({ default: m.LicencesScreen })));
const NativeCadScreen = lazy(() => import("./screens/NativeCadScreen").then((m) => ({ default: m.NativeCadScreen })));
const PhaseChatScreen = lazy(() => import("./screens/PhaseChatScreen").then((m) => ({ default: m.PhaseChatScreen })));
const ProjectSetupScreen = lazy(() => import("./screens/ProjectSetupScreen").then((m) => ({ default: m.ProjectSetupScreen })));
const ProjectsScreen = lazy(() => import("./screens/ProjectsScreen").then((m) => ({ default: m.ProjectsScreen })));
const TemplatesScreen = lazy(() => import("./screens/TemplatesScreen").then((m) => ({ default: m.TemplatesScreen })));
const UnitsScreen = lazy(() => import("./screens/UnitsScreen").then((m) => ({ default: m.UnitsScreen })));
const SettingsScreen = lazy(() => import("./screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })));

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
  "column-grid": ["Column Grid", "কলাম গ্রিড"],
  settings: ["Settings", "সেটিংস"],
  units: ["Land Units", "জমির একক"],
  templates: ["Plan library", "প্ল্যান লাইব্রেরি"],
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
        <HealthBanner />
        <main id="main-content" ref={mainRef} tabIndex={-1} className="app-main">
          <ErrorBoundary
            resetKey={view}
            onRecover={() => navigate("setup")}
            recoverLabel={lang === "bn" ? "শুরুতে ফিরুন" : "Back to start"}
          >
            <Suspense fallback={<div className="screen" role="status" aria-live="polite"><p className="faint">{lang === "bn" ? "লোড হচ্ছে…" : "Loading…"}</p></div>}>
              {renderView(view, navigate)}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <PWAInstallPrompt />
    </div>
  );
}

export function App() {
  // An empty install (no open project and nothing saved) starts on the welcome screen; otherwise reopen the most recent project.
  const [welcome, setWelcome] = useState(() => !getActiveProject() && !activateSavedProject());
  if (welcome) {
    return (
      <WelcomeScreen
        onNewProject={() => { window.location.hash = "#/setup"; setWelcome(false); }}
        onSample={() => { create4StoryBuildingProject(); window.location.hash = "#/design:final"; setWelcome(false); }}
        onImported={() => { activateSavedProject(); window.location.hash = "#/design:final"; setWelcome(false); }}
      />
    );
  }
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
    return <ProjectSetupScreen onNavigate={navigate} onProjectCreated={() => navigate("phase:phase-basics")} />;
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
  if (view === "column-grid") return <ColumnGridOptimizerScreen onNavigate={navigate} />;
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
  return <ProjectSetupScreen onNavigate={navigate} onProjectCreated={() => navigate("phase:phase-basics")} />;
}
