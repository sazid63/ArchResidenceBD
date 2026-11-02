import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useTheme } from "../theme/theme";
import { cx, Badge, Dot } from "../ui/kit";
import {
  BuildingProject,
  areAllPhasesCompleted,
  clearAllProjects,
} from "../engine/projectState";
import { useActiveProject, useProject } from "../context/ProjectContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import "./sidebar.css";

interface Props {
  active: string;
  onNavigate: (id: string) => void;
  /** Mobile drawer state (ignored on wide screens). */
  open?: boolean;
}

export function Sidebar({ active, onNavigate, open = false }: Props) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const project = useActiveProject();
  const { refreshProject } = useProject();

  const [openPhases, setOpenPhases] = useState(true);
  const [openDesign, setOpenDesign] = useState(true);

  const allPhasesDone = project ? areAllPhasesCompleted(project) : false;
  const designUnlocked = project ? (project.designStarted || allPhasesDone) : false;

  const handleNewProject = () => {
    onNavigate("setup");
  };

  const [confirmReset, setConfirmReset] = useState(false);
  const handleReset = () => setConfirmReset(true);
  const doReset = () => {
    setConfirmReset(false);
    clearAllProjects();
    refreshProject();
    onNavigate("setup");
  };

  return (
    <aside id="app-sidebar" className={cx("sidebar", open && "open")} aria-label={lang === "bn" ? "প্রধান নেভিগেশন" : "Main navigation"}>
      {/* Brand Header */}
      <div className="sidebar-head">
        <span className="logo-dot" />
        <div className="grow">
          <div className="app-title">{t("appName")}</div>
          <div className="app-tagline faint">{t("tagline")}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {/* + New Project Button */}
        <button type="button" className="nav-new" onClick={handleNewProject}>
          + {t("newProject")}
        </button>
        <button
          type="button"
          className={cx("nav-item", active === "projects" && "active")}
          aria-current={active === "projects" ? "page" : undefined}
          onClick={() => onNavigate("projects")}
        >
          <span className="grow ellipsis">{lang === "bn" ? "আমার প্রকল্পসমূহ" : "My Projects"}</span>
        </button>

        {/* Active Project Card */}
        {project ? (
          <div className="proj-head">
            <span className="proj-badge">
              {project.name.slice(0, 2).toUpperCase() || "BD"}
            </span>
            <div className="grow">
              <div className="proj-name">{project.name}</div>
              <div className="faint small">
                {project.stories} {lang === "bn" ? "তলা" : "Stories"} · {project.plotSize}{" "}
                {project.plotUnit} · {project.unitsPerFloor} {lang === "bn" ? "ইউনিট" : "Units"}
              </div>
            </div>
            <button
              type="button"
              className="button button--ghost small nav-reset"
              onClick={handleReset}
              aria-label={lang === "bn" ? "প্রকল্প মুছুন" : "Delete project"}
              title={lang === "bn" ? "প্রকল্প মুছুন" : "Delete project"}
            >
              {lang === "bn" ? "মুছুন" : "Delete"}
            </button>
          </div>
        ) : (
          <div className="no-project-placeholder">
            <div className="small muted">
              {lang === "bn" ? "কোনো প্রকল্প তৈরি করা হয়নি" : "No active project"}
            </div>
            <button
              type="button"
              className="button button--primary small"
              onClick={handleNewProject}
            >
              {lang === "bn" ? "নতুন প্রকল্প শুরু করুন" : "Start New Project"}
            </button>
          </div>
        )}

        {/* 1. DYNAMIC PHASES SECTION */}
        {project && (
          <div className="nav-group">
            <button
              type="button"
              className="nav-group-head"
              aria-expanded={openPhases}
              onClick={() => setOpenPhases(!openPhases)}
            >
              <span className={cx("chev", openPhases && "open")}>▾</span>
              <span className="grow">
                {lang === "bn" ? "১. পর্যায়ভিত্তিক ইন্টারভিউ" : "1. Phase Interviews"}
              </span>
              <Badge tone={allPhasesDone ? "sage" : "amber"}>
                {project.phases.filter((p) => p.status === "completed").length}/
                {project.phases.length}
              </Badge>
            </button>

            {openPhases && (
              <div className="nav-children">
                {project.phases.map((phase) => {
                  const isActive = active === `phase:${phase.id}`;
                  const isDone = phase.status === "completed";
                  const isInProgress = phase.status === "in_progress";

                  return (
                    <button
                      key={phase.id}
                      type="button"
                      className={cx("nav-item", "child", isActive && "active")}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onNavigate(`phase:${phase.id}`)}
                    >
                      <Dot tone={isDone ? "sage" : isInProgress ? "amber" : "neutral"} />
                      <span className="grow ellipsis">
                        {lang === "bn" ? phase.nameBn : phase.nameEn}
                      </span>
                      {isDone ? (
                        <span className="phase-check">✓</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. DYNAMIC DESIGN SECTION (Gated) */}
        {project && (
          <div className="nav-group">
            <button
              type="button"
              className="nav-group-head"
              aria-expanded={openDesign}
              onClick={() => setOpenDesign(!openDesign)}
            >
              <span className={cx("chev", openDesign && "open")}>▾</span>
              <span className="grow">
                {lang === "bn" ? "২. ৩D ক্যাড ডিজাইন" : "2. 3D CAD Design"}
              </span>
              {!designUnlocked && (
                <span className="faint small" title="Complete phase interviews first">
                  🔒
                </span>
              )}
            </button>

            {openDesign && (
              <div className="nav-children">
                {!designUnlocked ? (
                  <div
                    className="faint small"
                    style={{ padding: "8px 12px", fontStyle: "italic" }}
                  >
                    {lang === "bn"
                      ? "সব পর্যায়ের পরিকল্পনা শেষে ডিজাইন উন্মুক্ত হবে"
                      : "Unlocks after completing phase interviews"}
                  </div>
                ) : (
                  <>
                    {/* Individual Phase Design Views */}
                    {project.phases.map((phase) => {
                      const isActive = active === `design:${phase.id}`;
                      return (
                        <button
                          key={phase.id}
                          type="button"
                          className={cx("nav-item", "child", isActive && "active")}
                      aria-current={isActive ? "page" : undefined}
                          onClick={() => onNavigate(`design:${phase.id}`)}
                        >
                          <span className="dot-spacer" />
                          <span className="grow ellipsis">
                            {lang === "bn" ? phase.nameBn : phase.nameEn} 3D
                          </span>
                        </button>
                      );
                    })}

                    {/* Combined Master Federated 3D Model */}
                    <button
                      type="button"
                      className={cx("nav-item", "child", "nav-master", active === "design:final" && "active")}
          aria-current={active === "design:final" ? "page" : undefined}
                      onClick={() => onNavigate("design:final")}
                    >
                      <Dot tone="primary" />
                      <span className="grow ellipsis">
                        {lang === "bn" ? "সম্পূর্ণ ৩D মডেল (মাস্টার)" : "Combined Master 3D"}
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* 3. BOQ & COSTING TAB (Gated) */}
        <button
          type="button"
          className={cx("nav-item", active === "boq" && "active")}
          aria-current={active === "boq" ? "page" : undefined}
          onClick={() => {
            if (!project) onNavigate("setup");
            else onNavigate("boq");
          }}
        >
          <span className="grow">{t("boq")}</span>
          {!designUnlocked && project && <span className="faint small">🔒</span>}
        </button>

        {/* ARCHITECTURAL ASSET LIBRARY */}
        <button
          type="button"
          className={cx("nav-item", active === "assets" && "active")}
          aria-current={active === "assets" ? "page" : undefined}
          onClick={() => onNavigate("assets")}
        >
          <span className="grow">{lang === "bn" ? "আর্কিটেকচারাল অ্যাসেট লাইব্রেরি" : "Architectural Assets"}</span>
          <span className="faint small">3D</span>
        </button>

        {/* 4. COMPLIANCE & REPORTS */}
        <button
          type="button"
          className={cx("nav-item", active === "compliance" && "active")}
          aria-current={active === "compliance" ? "page" : undefined}
          onClick={() => onNavigate("compliance")}
        >
          <span className="grow">{t("compliance")}</span>
        </button>

        {/* 5. FORMWORK & SCAFFOLD */}
        <button
          type="button"
          className={cx("nav-item", active === "formwork" && "active")}
          aria-current={active === "formwork" ? "page" : undefined}
          onClick={() => onNavigate("formwork")}
        >
          <span className="grow">{t("formwork")}</span>
        </button>

        {/* 6. POUR SEQUENCE */}
        <button
          type="button"
          className={cx("nav-item", active === "pour" && "active")}
          aria-current={active === "pour" ? "page" : undefined}
          onClick={() => onNavigate("pour")}
        >
          <span className="grow">{t("pourSequence")}</span>
        </button>

        {/* 7. REBAR SCHEDULE */}
        <button
          type="button"
          className={cx("nav-item", active === "rebar" && "active")}
          aria-current={active === "rebar" ? "page" : undefined}
          onClick={() => onNavigate("rebar")}
        >
          <span className="grow">{t("rebar")}</span>
        </button>

        {/* 8. CONNECTION DETAILING */}
        <button
          type="button"
          className={cx("nav-item", active === "connections" && "active")}
          aria-current={active === "connections" ? "page" : undefined}
          onClick={() => onNavigate("connections")}
        >
          <span className="grow">{t("connections")}</span>
        </button>

        {/* 9. DAYLIGHT ANALYSIS */}
        <button
          type="button"
          className={cx("nav-item", active === "daylight" && "active")}
          aria-current={active === "daylight" ? "page" : undefined}
          onClick={() => onNavigate("daylight")}
        >
          <span className="grow">{t("daylightNav")}</span>
        </button>

        {/* 10. UNIT MIX OPTIMIZER */}
        <button
          type="button"
          className={cx("nav-item", active === "unit-mix" && "active")}
          aria-current={active === "unit-mix" ? "page" : undefined}
          onClick={() => onNavigate("unit-mix")}
        >
          <span className="grow">{t("unitMixNav")}</span>
        </button>

        {/* 11. COLUMN GRID OPTIMIZER */}
        <button
          type="button"
          className={cx("nav-item", active === "column-grid" && "active")}
          aria-current={active === "column-grid" ? "page" : undefined}
          onClick={() => onNavigate("column-grid")}
        >
          <span className="grow">{t("columnGridNav")}</span>
        </button>
        {/* 12. DOCUMENTS & EXPORTS */}
        <button
          type="button"
          className={cx("nav-item", active === "docs:drawings" && "active")}
          aria-current={active === "docs:drawings" ? "page" : undefined}
          onClick={() => onNavigate("docs:drawings")}
        >
          <span className="grow">{t("documents")}</span>
        </button>

        {/* 13. AI FLEET HUB */}
        <button
          type="button"
          className={cx("nav-item", active === "fleet" && "active")}
          aria-current={active === "fleet" ? "page" : undefined}
          onClick={() => onNavigate("fleet")}
        >
          <span className="grow">{t("fleet")}</span>
        </button>

        {/* 14. WINDOWS INSTALLER (.exe) */}
        <button
          type="button"
          className={cx("nav-item", active === "windows" && "active")}
          aria-current={active === "windows" ? "page" : undefined}
          onClick={() => onNavigate("windows")}
        >
          <span className="grow">{t("windows")}</span>
        </button>

        {/* 15. LAND UNIT CONVERTER */}
        <button
          type="button"
          className={cx("nav-item", active === "units" && "active")}
          aria-current={active === "units" ? "page" : undefined}
          onClick={() => onNavigate("units")}
        >
          <span className="grow">{t("unitsTitle")}</span>
        </button>
            <div className="nav-group" >
        <div className="nav-group-head" role="presentation" style={{ cursor: "default" }}>
          <span className="grow">{lang === "bn" ? "আরও" : "MORE"}</span>
        </div>
        {([
          ["templates", "Templates", "টেমপ্লেট"],
          ["help", "Help", "সহায়তা"],
          ["about", "About & licences", "সম্পর্কে ও লাইসেন্স"],
        ] as const).map(([id, en, bn]) => (
          <button
            key={id}
            type="button"
            className={cx("nav-item", (active === id || (id === "about" && active === "licences")) && "active")}
            aria-current={active === id ? "page" : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="grow ellipsis">{lang === "bn" ? bn : en}</span>
          </button>
        ))}
      </div>
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-foot">
        <div className="lang-toggle">
          <button
            type="button"
            className={cx("lang-pill", lang === "bn" && "active")}
            aria-pressed={lang === "bn"}
            aria-label="বাংলা"
            onClick={() => setLang("bn")}
          >
            বাং
          </button>
          <button
            type="button"
            className={cx("lang-pill", lang === "en" && "active")}
            aria-pressed={lang === "en"}
            aria-label="English"
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggle}
          title={theme === "light" ? "Switch to Dark" : theme === "dark" ? "Switch to High Contrast" : "Switch to Light"}
        >
          {theme === "light" ? "☾" : theme === "dark" ? "⬤" : "☀"}
        </button>
        <span className="faint small">ArchResidenceBD v1.0</span>
      </div>
      <ConfirmDialog
        open={confirmReset}
        title={lang === "bn" ? "প্রকল্প মুছবেন?" : "Delete this project?"}
        message={
          lang === "bn"
            ? `"${project?.name ?? ""}" এই ডিভাইস থেকে মুছে যাবে। এটি ফেরানো যাবে না।`
            : `"${project?.name ?? ""}" will be removed from this device. This cannot be undone.`
        }
        confirmLabel={lang === "bn" ? "মুছুন" : "Delete project"}
        cancelLabel={lang === "bn" ? "বাতিল" : "Cancel"}
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />
    </aside>
  );
}
