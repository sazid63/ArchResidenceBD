import { useState, type ComponentType } from "react";
import {
  Box,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  FolderOpen,
  Grid3x3,
  Info,
  Layers,
  LayoutTemplate,
  Library,
  Link2,
  Lock,
  MessagesSquare,
  Monitor,
  Moon,
  Plus,
  Receipt,
  Ruler,
  Settings,
  ShieldCheck,
  Sun,
  SunMedium,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import { useI18n } from "../i18n";
import { useTheme } from "../theme/theme";
import { cx, Badge } from "../ui/kit";
import { areAllPhasesCompleted, deleteSavedProject } from "../engine/projectState";
import { useActiveProject, useProject } from "../context/ProjectContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { APP_VERSION } from "../version";
import "./sidebar.css";

interface Props {
  active: string;
  onNavigate: (id: string) => void;
  /** Mobile drawer state (ignored on wide screens). */
  open?: boolean;
}

type Icon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

interface Item {
  id: string;
  icon: Icon;
  en: string;
  bn: string;
  /** Needs the phase interviews finished first. */
  gated?: boolean;
}

interface Group {
  en: string;
  bn: string;
  items: Item[];
}

const ICON = { size: 17, strokeWidth: 1.75, "aria-hidden": true } as const;

export function Sidebar({ active, onNavigate, open = false }: Props) {
  const { lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const project = useActiveProject();
  const { refreshProject } = useProject();
  const bn = lang === "bn";
  const L = (en: string, bnText: string) => (bn ? bnText : en);

  const [openInterview, setOpenInterview] = useState(true);
  const [openPhaseViews, setOpenPhaseViews] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const allPhasesDone = project ? areAllPhasesCompleted(project) : false;
  const designUnlocked = project ? project.designStarted || allPhasesDone : false;
  const doneCount = project ? project.phases.filter((p) => p.status === "completed").length : 0;

  const go = (id: string, gated?: boolean) => {
    if (!project && id !== "projects") return onNavigate("setup");
    if (gated && !designUnlocked) return onNavigate(project?.activePhaseId ? `phase:${project.activePhaseId}` : "phase:phase-site");
    onNavigate(id);
  };

  const groups: Group[] = [
    {
      en: "Design",
      bn: "নকশা",
      items: [
        { id: "design:final", icon: Box, en: "3D model", bn: "৩ডি মডেল", gated: true },
        { id: "unit-mix", icon: Users, en: "Unit mix", bn: "ইউনিট মিক্স" },
        { id: "daylight", icon: SunMedium, en: "Daylight", bn: "দিবালোক" },
        { id: "templates", icon: LayoutTemplate, en: "Plan library", bn: "প্ল্যান লাইব্রেরি" },
        { id: "assets", icon: Library, en: "Asset library", bn: "অ্যাসেট লাইব্রেরি" },
      ],
    },
    {
      en: "Engineering",
      bn: "প্রকৌশল",
      items: [
        { id: "compliance", icon: ShieldCheck, en: "Code compliance", bn: "বিধিমালা যাচাই" },
        { id: "structure", icon: Building2, en: "Structure", bn: "কাঠামো" },
        { id: "column-grid", icon: Grid3x3, en: "Column grid", bn: "কলাম গ্রিড" },
        { id: "rebar", icon: Ruler, en: "Rebar schedule", bn: "রিবার শিডিউল" },
        { id: "connections", icon: Link2, en: "Connections", bn: "সংযোগ" },
      ],
    },
    {
      en: "Construction",
      bn: "নির্মাণ",
      items: [
        { id: "boq", icon: Receipt, en: "Bill of quantities", bn: "প্রাক্কলন (BOQ)", gated: true },
        { id: "formwork", icon: Layers, en: "Formwork", bn: "ফর্মওয়ার্ক" },
        { id: "pour", icon: Timer, en: "Pour sequence", bn: "ঢালাইয়ের ক্রম" },
      ],
    },
    {
      en: "Documents",
      bn: "নথিপত্র",
      items: [{ id: "docs:drawings", icon: FileText, en: "Drawings and exports", bn: "ড্রয়িং ও এক্সপোর্ট" }],
    },
  ];

  const footerItems: Item[] = [
    { id: "units", icon: Ruler, en: "Land units", bn: "জমির একক" },
    { id: "help", icon: CircleHelp, en: "Help", bn: "সহায়তা" },
    { id: "settings", icon: Settings, en: "Settings", bn: "সেটিংস" },
    { id: "about", icon: Info, en: "About", bn: "পরিচিতি" },
  ];

  const navButton = (item: Item, opts: { child?: boolean; needsProject?: boolean } = {}) => {
    const isActive = active === item.id || (item.id === "about" && active === "licences");
    const locked = !!item.gated && !!project && !designUnlocked;
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        type="button"
        className={cx("nav-item", opts.child && "child", isActive && "active")}
        aria-current={isActive ? "page" : undefined}
        onClick={() => (opts.needsProject === false ? onNavigate(item.id) : go(item.id, item.gated))}
        title={locked ? L("Finish the phase interviews to unlock", "সব পর্যায় শেষ হলে খুলবে") : undefined}
      >
        <Icon {...ICON} />
        <span className="grow ellipsis">{L(item.en, item.bn)}</span>
        {locked ? <Lock size={13} strokeWidth={1.75} aria-label={L("Locked", "বন্ধ")} className="nav-lock" /> : null}
      </button>
    );
  };

  const themeOptions = [
    { value: "light", icon: Sun, en: "Light", bn: "হালকা" },
    { value: "dark", icon: Moon, en: "Dark", bn: "গাঢ়" },
    { value: "system", icon: Monitor, en: "System", bn: "সিস্টেম" },
  ] as const;

  return (
    <aside id="app-sidebar" className={cx("sidebar", open && "open")} aria-label={L("Main navigation", "প্রধান নেভিগেশন")}>
      <div className="sidebar-head">
        <span className="logo-mark" aria-hidden="true">
          <Building2 size={16} strokeWidth={2} />
        </span>
        <div className="grow">
          <div className="app-title">ArchResidenceBD</div>
          <div className="app-tagline">{L("Residential design for Bangladesh", "বাংলাদেশের আবাসিক নকশা")}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button type="button" className="nav-new" onClick={() => onNavigate("setup")}>
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          {L("New project", "নতুন প্রকল্প")}
        </button>
        {navButton({ id: "projects", icon: FolderOpen, en: "Your projects", bn: "আপনার প্রকল্প" }, { needsProject: false })}

        {project ? (
          <div className="proj-head">
            <span className="proj-badge" aria-hidden="true">
              {project.name.slice(0, 2).toUpperCase() || "BD"}
            </span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="proj-name ellipsis" title={project.name}>{project.name}</div>
              <div className="proj-meta">
                {project.stories} {L("storeys", "তলা")} · {project.plotSize} {project.plotUnit} · {project.unitsPerFloor}{" "}
                {L("units/floor", "ইউনিট/তলা")}
              </div>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setConfirmReset(true)}
              aria-label={L("Delete project", "প্রকল্প মুছুন")}
              title={L("Delete project", "প্রকল্প মুছুন")}
            >
              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="no-project-placeholder">
            <div className="small muted">{L("No project open", "কোনো প্রকল্প খোলা নেই")}</div>
          </div>
        )}

        {project && (
          <div className="nav-group">
            <button
              type="button"
              className="nav-group-head"
              aria-expanded={openInterview}
              onClick={() => setOpenInterview(!openInterview)}
            >
              <MessagesSquare {...ICON} />
              <span className="grow">{L("Phase interviews", "পর্যায়ভিত্তিক সাক্ষাৎকার")}</span>
              <Badge tone={allPhasesDone ? "sage" : "neutral"}>
                {doneCount}/{project.phases.length}
              </Badge>
              <ChevronDown size={15} strokeWidth={1.75} aria-hidden="true" className={cx("chev", openInterview && "open")} />
            </button>
            {openInterview && (
              <div className="nav-children">
                {project.phases.map((phase) => {
                  const isActive = active === `phase:${phase.id}`;
                  const isDone = phase.status === "completed";
                  return (
                    <button
                      key={phase.id}
                      type="button"
                      className={cx("nav-item", "child", isActive && "active")}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onNavigate(`phase:${phase.id}`)}
                    >
                      <span className={cx("phase-dot", isDone && "done", phase.status === "in_progress" && "doing")} aria-hidden="true">
                        {isDone ? <Check size={10} strokeWidth={3} /> : null}
                      </span>
                      <span className="grow ellipsis">{bn ? phase.nameBn : phase.nameEn}</span>
                      <span className="visually-hidden">
                        {isDone ? L("done", "সম্পন্ন") : phase.status === "in_progress" ? L("in progress", "চলছে") : L("not started", "শুরু হয়নি")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {groups.map((group) => (
          <div className="nav-section" key={group.en}>
            <div className="nav-section-label">{L(group.en, group.bn)}</div>
            {group.items.map((item) => (
              <div key={item.id}>
                {navButton(item)}
                {item.id === "design:final" && project && designUnlocked && (
                  <>
                    <button
                      type="button"
                      className="nav-subtoggle"
                      aria-expanded={openPhaseViews}
                      onClick={() => setOpenPhaseViews(!openPhaseViews)}
                    >
                      <ChevronDown size={13} strokeWidth={1.75} aria-hidden="true" className={cx("chev", openPhaseViews && "open")} />
                      {L("Views by phase", "পর্যায় অনুযায়ী দেখুন")}
                    </button>
                    {openPhaseViews &&
                      project.phases.map((phase) => {
                        const id = `design:${phase.id}`;
                        const isActive = active === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            className={cx("nav-item", "child", "subchild", isActive && "active")}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => onNavigate(id)}
                          >
                            <span className="grow ellipsis">{bn ? phase.nameBn : phase.nameEn}</span>
                          </button>
                        );
                      })}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}

        <div className="nav-section nav-section--quiet">
          {footerItems.map((item) => navButton(item, { needsProject: false }))}
        </div>
      </nav>

      <div className="sidebar-foot">
        <div className="seg-mini" role="group" aria-label={L("Language", "ভাষা")}>
          <button type="button" className={cx(lang === "bn" && "on")} aria-pressed={lang === "bn"} lang="bn" onClick={() => setLang("bn")}>
            বাংলা
          </button>
          <button type="button" className={cx(lang === "en" && "on")} aria-pressed={lang === "en"} lang="en" onClick={() => setLang("en")}>
            EN
          </button>
        </div>
        <div className="seg-mini" role="group" aria-label={L("Theme", "থিম")}>
          {themeOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              className={cx(theme === o.value && "on")}
              aria-pressed={theme === o.value}
              aria-label={L(o.en, o.bn)}
              title={L(o.en, o.bn)}
              onClick={() => setTheme(o.value)}
            >
              <o.icon size={14} strokeWidth={1.75} aria-hidden={true} />
            </button>
          ))}
        </div>
        <span className="foot-version">v{APP_VERSION}</span>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title={L("Delete this project?", "প্রকল্প মুছবেন?")}
        message={
          bn
            ? `"${project?.name ?? ""}" এই ডিভাইস থেকে মুছে যাবে। এটি ফেরানো যাবে না।`
            : `"${project?.name ?? ""}" will be removed from this device. This can't be undone.`
        }
        confirmLabel={L("Delete project", "মুছুন")}
        cancelLabel={L("Cancel", "বাতিল")}
        onConfirm={() => {
          setConfirmReset(false);
          // Delete only this project (v2 cleared every saved project here).
          if (project) deleteSavedProject(project.id);
          refreshProject();
          onNavigate("setup");
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </aside>
  );
}
