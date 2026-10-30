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
import "./sidebar.css";

interface Props {
  active: string;
  onNavigate: (id: string) => void;
}

export function Sidebar({ active, onNavigate }: Props) {
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

  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear the project and start fresh?")) {
      clearAllProjects();
      refreshProject();
      onNavigate("setup");
    }
  };

  return (
    <aside className="sidebar">
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
              title="Reset & Delete Project"
            >
              ✕
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
          onClick={() => onNavigate("assets")}
        >
          <span className="grow">{lang === "bn" ? "আর্কিটেকচারাল অ্যাসেট লাইব্রেরি" : "Architectural Assets"}</span>
          <span className="faint small">3D</span>
        </button>

        {/* 4. COMPLIANCE & REPORTS */}
        <button
          type="button"
          className={cx("nav-item", active === "compliance" && "active")}
          onClick={() => onNavigate("compliance")}
        >
          <span className="grow">{t("compliance")}</span>
        </button>

        {/* 5. FORMWORK & SCAFFOLD */}
        <button
          type="button"
          className={cx("nav-item", active === "formwork" && "active")}
          onClick={() => onNavigate("formwork")}
        >
          <span className="grow">{t("formwork")}</span>
        </button>

        {/* 6. POUR SEQUENCE */}
        <button
          type="button"
          className={cx("nav-item", active === "pour" && "active")}
          onClick={() => onNavigate("pour")}
        >
          <span className="grow">{t("pourSequence")}</span>
        </button>

        {/* 7. REBAR SCHEDULE */}
        <button
          type="button"
          className={cx("nav-item", active === "rebar" && "active")}
          onClick={() => onNavigate("rebar")}
        >
          <span className="grow">{t("rebar")}</span>
        </button>

        {/* 8. CONNECTION DETAILING */}
        <button
          type="button"
          className={cx("nav-item", active === "connections" && "active")}
          onClick={() => onNavigate("connections")}
        >
          <span className="grow">{t("connections")}</span>
        </button>

        {/* 9. DAYLIGHT ANALYSIS */}
        <button
          type="button"
          className={cx("nav-item", active === "daylight" && "active")}
          onClick={() => onNavigate("daylight")}
        >
          <span className="grow">{t("daylightNav")}</span>
        </button>

        {/* 10. UNIT MIX OPTIMIZER */}
        <button
          type="button"
          className={cx("nav-item", active === "unit-mix" && "active")}
          onClick={() => onNavigate("unit-mix")}
        >
          <span className="grow">{t("unitMixNav")}</span>
        </button>

        {/* 11. COLUMN GRID OPTIMIZER */}
        <button
          type="button"
          className={cx("nav-item", active === "column-grid" && "active")}
          onClick={() => onNavigate("column-grid")}
        >
          <span className="grow">{t("columnGridNav")}</span>
        </button>
        {/* 12. DOCUMENTS & EXPORTS */}
        <button
          type="button"
          className={cx("nav-item", active === "docs:drawings" && "active")}
          onClick={() => onNavigate("docs:drawings")}
        >
          <span className="grow">{t("documents")}</span>
        </button>

        {/* 13. AI FLEET HUB */}
        <button
          type="button"
          className={cx("nav-item", active === "fleet" && "active")}
          onClick={() => onNavigate("fleet")}
        >
          <span className="grow">{t("fleet")}</span>
        </button>

        {/* 14. WINDOWS INSTALLER (.exe) */}
        <button
          type="button"
          className={cx("nav-item", active === "windows" && "active")}
          onClick={() => onNavigate("windows")}
        >
          <span className="grow">{t("windows")}</span>
        </button>

        {/* 15. LAND UNIT CONVERTER */}
        <button
          type="button"
          className={cx("nav-item", active === "units" && "active")}
          onClick={() => onNavigate("units")}
        >
          <span className="grow">{t("unitsTitle")}</span>
        </button>
      </nav>

      {/* Sidebar Footer */}
      <div className="sidebar-foot">
        <div className="lang-toggle">
          <button
            type="button"
            className={cx("lang-pill", lang === "bn" && "active")}
            onClick={() => setLang("bn")}
          >
            বাং
          </button>
          <button
            type="button"
            className={cx("lang-pill", lang === "en" && "active")}
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
    </aside>
  );
}
