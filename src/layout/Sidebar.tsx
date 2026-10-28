import { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { useTheme } from "../theme/theme";
import { cx, Badge } from "../ui/kit";
import {
  BuildingProject,
  getActiveProject,
  areAllPhasesCompleted,
  clearAllProjects,
} from "../engine/projectState";
import "./sidebar.css";

interface Props {
  active: string;
  onNavigate: (id: string) => void;
  projectVersion?: number;
}

export function Sidebar({ active, onNavigate, projectVersion }: Props) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();

  const [project, setProject] = useState<BuildingProject | null>(() => getActiveProject());
  const [openPhases, setOpenPhases] = useState(true);
  const [openDesign, setOpenDesign] = useState(true);

  // Sync project state on version changes or storage updates
  useEffect(() => {
    setProject(getActiveProject());
  }, [projectVersion, active]);

  const allPhasesDone = project ? areAllPhasesCompleted(project) : false;
  const designUnlocked = project ? (project.designStarted || allPhasesDone) : false;

  const handleNewProject = () => {
    onNavigate("setup");
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear the project and start fresh?")) {
      clearAllProjects();
      setProject(null);
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
          <div className="proj-head" style={{ marginBottom: "12px" }}>
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
              className="button button--ghost small"
              onClick={handleReset}
              title="Reset & Delete Project"
              style={{ padding: "2px 6px", fontSize: "11px", opacity: 0.7 }}
            >
              ✕
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: "12px",
              background: "var(--surface-sunken)",
              borderRadius: "8px",
              marginBottom: "12px",
              textAlign: "center",
            }}
          >
            <div className="small muted">
              {lang === "bn" ? "কোনো প্রকল্প তৈরি করা হয়নি" : "No active project"}
            </div>
            <button
              type="button"
              className="button button--primary small"
              onClick={handleNewProject}
              style={{ marginTop: "8px", width: "100%" }}
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
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          marginRight: "6px",
                          background: isDone
                            ? "var(--tone-sage, #10b981)"
                            : isInProgress
                              ? "var(--tone-amber, #f59e0b)"
                              : "var(--border, #cbd5e1)",
                        }}
                      />
                      <span className="grow ellipsis">
                        {lang === "bn" ? phase.nameBn : phase.nameEn}
                      </span>
                      {isDone ? (
                        <span style={{ color: "var(--tone-sage, #10b981)", fontSize: "12px" }}>
                          ✓
                        </span>
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
                      className={cx("nav-item", "child", active === "design:final" && "active")}
                      onClick={() => onNavigate("design:final")}
                      style={{ fontWeight: 600 }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "50%",
                          marginRight: "6px",
                          background: "var(--primary, #3b82f6)",
                        }}
                      />
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

        {/* 5. DOCUMENTS & EXPORTS */}
        <button
          type="button"
          className={cx("nav-item", active === "docs:drawings" && "active")}
          onClick={() => onNavigate("docs:drawings")}
        >
          <span className="grow">{t("documents")}</span>
        </button>

        {/* 6. AI FLEET HUB */}
        <button
          type="button"
          className={cx("nav-item", active === "fleet" && "active")}
          onClick={() => onNavigate("fleet")}
        >
          <span className="grow">{t("fleet")}</span>
        </button>

        {/* 7. WINDOWS INSTALLER (.exe) */}
        <button
          type="button"
          className={cx("nav-item", active === "windows" && "active")}
          onClick={() => onNavigate("windows")}
        >
          <span className="grow">{t("windows")}</span>
        </button>

        {/* 8. LAND UNIT CONVERTER */}
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
          title="Toggle Light/Dark Theme"
        >
          {theme === "light" ? "☾" : "☀"}
        </button>
        <span className="faint small">ArchResidenceBD v1.0</span>
      </div>
    </aside>
  );
}
