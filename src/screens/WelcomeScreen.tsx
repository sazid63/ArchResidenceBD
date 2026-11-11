import { useState } from "react";
import { pickAndImportProjects } from "../engine/projectImport";
import { useI18n } from "../i18n";
import { APP_VERSION } from "../version";
import { Button, Callout, Card } from "../ui/kit";

/**
 * First run: an empty install asks what to do instead of opening a ready-made building.
 * Start a project (the plot comes first), open the sample building, or open a project file.
 */
export function WelcomeScreen({ onNewProject, onSample, onImported }: { onNewProject: () => void; onSample: () => void; onImported: () => void }) {
  const { lang, setLang } = useI18n();
  const bn = lang === "bn";
  const [error, setError] = useState<string | null>(null);

  const importFile = async () => {
    const notice = await pickAndImportProjects();
    if (!notice) return;
    if (notice.tone === "bad" || notice.added === 0) setError(bn ? notice.bn : notice.en);
    else onImported();
  };

  return (
    <main className="screen" style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px" }} id="main-content">
      <div className="row-between" style={{ marginBottom: 24 }}>
        <span className="faint small">ArchResidenceBD {APP_VERSION}</span>
        <Button variant="ghost" size="small" onClick={() => setLang(bn ? "en" : "bn")}>{bn ? "English" : "বাংলা"}</Button>
      </div>
      <h1 style={{ marginBottom: 8 }}>{bn ? "ঢাকার আবাসিক ভবনের প্রাথমিক নকশা" : "Screening design for Dhaka residential buildings"}</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {bn
          ? "জমির মাপ দিন, একটি প্ল্যান বাছুন: অ্যাপ রাজউক ও বিএনবিসি যাচাই, কাঠামো, রড, বিওকিউ ও নকশা তৈরি করবে। কোনো সার্ভার বা অ্যাকাউন্ট লাগে না; সবকিছু এই কম্পিউটারে থাকে।"
          : "Enter your plot and pick a plan: the app works out the RAJUK and BNBC checks, the structure, the rebar, the BOQ and the drawings. No server and no account; everything stays on this computer."}
      </p>
      {error && <Callout tone="bad" title={bn ? "ফাইল খোলা যায়নি" : "Could not open the file"}>{error}</Callout>}
      <div className="stack" style={{ gap: 12 }}>
        <Card className="row-between">
          <div>
            <h2 style={{ margin: 0 }}>{bn ? "আপনার জমি দিয়ে শুরু করুন" : "Start with your plot"}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>{bn ? "সামনের প্রস্থ, গভীরতা, রাস্তার মাপ ও তলা সংখ্যা।" : "Frontage, depth, road width and storeys."}</p>
          </div>
          <Button variant="primary" onClick={onNewProject}>{bn ? "নতুন প্রজেক্ট" : "New project"}</Button>
        </Card>
        <Card className="row-between">
          <div>
            <h2 style={{ margin: 0 }}>{bn ? "নমুনা ভবন খুলুন" : "Open the sample building"}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>{bn ? "একটি ৪ তলা ভবন, সব স্ক্রিন দেখার জন্য।" : "A 4-storey building to look through every screen."}</p>
          </div>
          <Button variant="soft" onClick={onSample}>{bn ? "নমুনা খুলুন" : "Open sample"}</Button>
        </Card>
        <Card className="row-between">
          <div>
            <h2 style={{ margin: 0 }}>{bn ? "প্রজেক্ট ফাইল খুলুন" : "Open a project file"}</h2>
            <p className="muted" style={{ margin: "4px 0 0" }}>{bn ? "অন্য কম্পিউটার থেকে নেওয়া .archres ফাইল।" : "A .archres file from another computer or a backup."}</p>
          </div>
          <Button variant="soft" onClick={importFile}>{bn ? "ফাইল খুলুন" : "Open file"}</Button>
        </Card>
      </div>
      <p className="faint small" style={{ marginTop: 24 }}>
        {bn ? "এটি প্রাথমিক যাচাইয়ের সরঞ্জাম। চূড়ান্ত নকশা ও জমার নকশা লাইসেন্সপ্রাপ্ত স্থপতি ও প্রকৌশলীকে যাচাই ও স্বাক্ষর করতে হবে।" : "This is a screening tool. Final and submission drawings must be checked and signed by licensed architects and engineers."}
      </p>
    </main>
  );
}
