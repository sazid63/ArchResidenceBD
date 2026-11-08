import { useI18n } from "../i18n";
import { useTheme, type ThemeChoice } from "../theme/theme";
import { Card, PageHeader, SegmentedControl } from "../ui/kit";
import { APP_VERSION } from "../version";

/** App preferences that apply on this device: theme and language. */
export function SettingsScreen() {
  const { lang, setLang } = useI18n();
  const { theme, setTheme, highContrast } = useTheme();
  const bn = lang === "bn";
  const L = (en: string, bnText: string) => (bn ? bnText : en);
  const mode: Exclude<ThemeChoice, "high-contrast"> = theme === "high-contrast" ? "dark" : theme;

  return (
    <div className="screen" style={{ maxWidth: 760 }}>
      <PageHeader title={L("Settings", "সেটিংস")} subtitle={L("Saved on this device.", "এই ডিভাইসে সংরক্ষিত।")} />

      <Card>
        <div className="stack">
          <h2 style={{ fontSize: "var(--fs-lg)" }}>{L("Appearance", "চেহারা")}</h2>

          <div className="settings-row">
            <div className="grow">
              <div className="settings-label">{L("Theme", "থিম")}</div>
              <div className="settings-hint">{L("System follows your computer's light or dark setting.", "সিস্টেম আপনার কম্পিউটারের হালকা বা গাঢ় সেটিং অনুসরণ করে।")}</div>
            </div>
            <SegmentedControl
              aria-label={L("Theme", "থিম")}
              value={mode}
              onChange={(v) => setTheme(v)}
              options={[
                { value: "light", label: L("Light", "হালকা") },
                { value: "dark", label: L("Dark", "গাঢ়") },
                { value: "system", label: L("System", "সিস্টেম") },
              ]}
            />
          </div>

          <label className="settings-row" style={{ cursor: "pointer" }}>
            <div className="grow">
              <div className="settings-label">{L("High contrast", "উচ্চ কনট্রাস্ট")}</div>
              <div className="settings-hint">{L("Black and white with strong outlines, for low vision or bright sunlight.", "কম দৃষ্টিশক্তি বা কড়া রোদের জন্য সাদা-কালো ও মোটা রেখা।")}</div>
            </div>
            <input
              type="checkbox"
              checked={highContrast}
              onChange={(e) => setTheme(e.target.checked ? "high-contrast" : "light")}
              style={{ width: 18, height: 18 }}
            />
          </label>
        </div>
      </Card>

      <Card>
        <div className="stack">
          <h2 style={{ fontSize: "var(--fs-lg)" }}>{L("Language", "ভাষা")}</h2>
          <div className="settings-row">
            <div className="grow">
              <div className="settings-label">{L("App language", "অ্যাপের ভাষা")}</div>
              <div className="settings-hint">{L("Numbers follow the language too (৪ or 4).", "সংখ্যাও ভাষা অনুযায়ী দেখাবে (৪ অথবা 4)।")}</div>
            </div>
            <SegmentedControl
              aria-label={L("App language", "অ্যাপের ভাষা")}
              value={lang}
              onChange={(v) => setLang(v)}
              options={[
                { value: "bn", label: <span lang="bn">বাংলা</span> },
                { value: "en", label: <span lang="en">English</span> },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="stack">
          <h2 style={{ fontSize: "var(--fs-lg)" }}>{L("Your data", "আপনার তথ্য")}</h2>
          <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
            {L(
              "Projects are stored only on this device, in this browser or app. Nothing is sent to a server.",
              "প্রকল্পগুলো শুধু এই ডিভাইসে, এই ব্রাউজার বা অ্যাপে সংরক্ষিত থাকে। কোনো সার্ভারে পাঠানো হয় না।",
            )}
          </p>
          <p className="faint small">ArchResidenceBD v{APP_VERSION}</p>
        </div>
      </Card>
    </div>
  );
}
