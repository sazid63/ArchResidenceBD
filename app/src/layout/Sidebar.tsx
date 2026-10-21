import { useState } from "react";

import { phases, project } from "../data/mock";
import type { PhaseStatus } from "../data/mock";
import { useI18n } from "../i18n";
import { phaseName } from "../labels";
import { phaseTone } from "../theme/tokens";
import type { Tone } from "../theme/tokens";
import { useTheme } from "../theme/theme";
import { cx, Dot, StatusDot } from "../ui/kit";
import "./sidebar.css";

interface ItemDef {
  id: string;
  label: string;
  tone?: Tone;
  status?: PhaseStatus;
}

interface Props {
  active: string;
  onNavigate: (id: string) => void;
}

function Item({
  item,
  active,
  onNavigate,
}: {
  item: ItemDef;
  active: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={cx("nav-item", "child", active === item.id && "active")}
      onClick={() => onNavigate(item.id)}
    >
      {item.tone ? <Dot tone={item.tone} /> : <span className="dot-spacer" />}
      <span className="grow ellipsis">{item.label}</span>
      {item.status ? <StatusDot status={item.status} /> : null}
    </button>
  );
}

export function Sidebar({ active, onNavigate }: Props) {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({
    phase: true,
    design: true,
    docs: false,
  });

  const phaseItems: ItemDef[] = phases.map((p) => ({
    id: `phase:${p.id}`,
    label: phaseName(p, lang, t),
    tone: phaseTone[p.kind],
    status: p.status,
  }));
  const designItems: ItemDef[] = [
    ...phases.map((p) => ({
      id: `design:${p.id}`,
      label: phaseName(p, lang, t),
      tone: phaseTone[p.kind],
      status: p.status,
    })),
    { id: "design:final", label: t("designFinal"), tone: "primary" },
  ];
  const docItems: ItemDef[] = [
    { id: "docs:drawings", label: t("drawings") },
    { id: "docs:bbs", label: t("bbs") },
    { id: "docs:reports", label: t("reports") },
    { id: "docs:engineer", label: t("engineerPack") },
  ];

  const group = (key: string, title: string, items: ItemDef[]) => (
    <div className="nav-group" key={key}>
      <button
        type="button"
        className="nav-group-head"
        onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
      >
        <span className={cx("chev", open[key] && "open")}>▾</span>
        <span className="grow">{title}</span>
      </button>
      {open[key] ? (
        <div className="nav-children">
          {items.map((it) => (
            <Item key={it.id} item={it} active={active} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="logo-dot" />
        <div className="grow">
          <div className="app-title">{t("appName")}</div>
          <div className="app-tagline faint">{t("tagline")}</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        <button
          type="button"
          className={cx("nav-item", active === "projects" && "active")}
          onClick={() => onNavigate("projects")}
        >
          <span className="grow">{t("projects")}</span>
        </button>
        <button type="button" className="nav-new" onClick={() => onNavigate("setup")}>
          + {t("newProject")}
        </button>
        <div className="proj-head">
          <span className="proj-badge">MD</span>
          <div className="grow">
            <div className="proj-name">{project.name}</div>
            <div className="faint small">{project.address}</div>
          </div>
        </div>
        <button
          type="button"
          className={cx("nav-item", "child", active === "setup" && "active")}
          onClick={() => onNavigate("setup")}
        >
          <span className="dot-spacer" />
          <span className="grow">{t("projectSetup")}</span>
        </button>
        {group("phase", t("phase"), phaseItems)}
        {group("design", t("design"), designItems)}
        <button
          type="button"
          className={cx("nav-item", active === "boq" && "active")}
          onClick={() => onNavigate("boq")}
        >
          <span className="grow">{t("boq")}</span>
        </button>
        <button
          type="button"
          className={cx("nav-item", active === "import-review" && "active")}
          onClick={() => onNavigate("import-review")}
        >
          <span className="grow">{t("importReview")}</span>
        </button>
        {group("docs", t("documents"), docItems)}
        <button
          type="button"
          className={cx("nav-item", active === "units" && "active")}
          onClick={() => onNavigate("units")}
        >
          <span className="grow">{t("unitsTitle")}</span>
        </button>
        <button
          type="button"
          className={cx("nav-item", active === "templates" && "active")}
          onClick={() => onNavigate("templates")}
        >
          <span className="grow">{t("templatesTitle")}</span>
        </button>
        <button
          type="button"
          className={cx("nav-item", active === "help" && "active")}
          onClick={() => onNavigate("help")}
        >
          <span className="grow">{t("helpTitle")}</span>
        </button>
        <button
          type="button"
          className={cx("nav-item", active === "about" && "active")}
          onClick={() => onNavigate("about")}
        >
          <span className="grow">{t("aboutTitle")}</span>
        </button>
      </nav>
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
        <button type="button" className="theme-toggle" onClick={toggle}>
          {theme === "light" ? "☾" : "☀"}
        </button>
        <span className="faint small">v0 · W0.2</span>
      </div>
    </aside>
  );
}
