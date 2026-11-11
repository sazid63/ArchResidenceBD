import { useMemo, useState } from "react";
import { saveFile } from "../platform/saveFile";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildPermitPackage, packageToZip, type PackageFile } from "../drawings/permit";
import { buildingForProject } from "../model/projectMesh";
import { Badge, Button, Callout, Card, EmptyState, PageHeader } from "../ui/kit";

/** Local calendar date (Dhaka is UTC+6, so the UTC date is a day behind in the early morning). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const GROUPS: Array<{ prefix: string; en: string; bn: string }> = [
  { prefix: "drawings/", en: "Drawings (SVG and DXF)", bn: "ড্রয়িং (এসভিজি ও ডিএক্সএফ)" },
  { prefix: "boq/", en: "Bill of quantities", bn: "বিল অব কোয়ান্টিটিজ" },
  { prefix: "structure/", en: "Bar schedule", bn: "রিবার শিডিউল" },
  { prefix: "compliance/", en: "Compliance report", bn: "কমপ্লায়েন্স রিপোর্ট" },
];

function save(name: string, data: BlobPart, type: string) {
  void saveFile(name, typeof data === "string" ? data : data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer), type);
}

/**
 * Documents: the permit package this project would produce, listed file by file, with one zip download.
 * Same package as the Drawings screen. It is a screening package, not a signed submission.
 */
export function DocumentsScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project } = useProject();
  const [files, setFiles] = useState<PackageFile[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const date = today();

  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const title = bn ? "ডকুমেন্ট" : "Documents";
  const subtitle = bn ? "এই প্রকল্পের পারমিট প্যাকেজ" : "The permit package for this project";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে ডকুমেন্ট তৈরি হবে।" : "Enter the plot and pick a plan, then the documents are prepared here."}
        </EmptyState>
      </div>
    );
  }
  if (!built.ok) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={project.name} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>
          {bn ? built.reasons.map((r) => r.message.bn).join(" ") : built.reasons.map((r) => r.message.en).join(" ")}
        </Callout>
      </div>
    );
  }
  const model = built.model;

  const prepare = () => {
    setBusy(true);
    setProblem(null);
    try {
      setFiles(buildPermitPackage(project, model, date, lang));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const slug = project.name.replace(/[^\w-]+/g, "_") || "project";

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />

      <Callout tone="warn" title={bn ? "প্রাথমিক প্যাকেজ, স্বাক্ষরিত জমা নয়" : "A screening package, not a signed submission"}>
        {bn
          ? "রাজউকে জমার আগে ড্রয়িং ও হিসাব লাইসেন্সপ্রাপ্ত স্থপতি ও প্রকৌশলীর যাচাই ও স্বাক্ষর লাগে। বিওকিউর রেট কার্ড এখনো যাচাই হয়নি।"
          : "Drawings and calculations must be checked and signed by licensed architects and engineers before they go to RAJUK. The BOQ rate card is not yet verified."}
      </Callout>

      <Card className="stack" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Button onClick={prepare} disabled={busy}>{bn ? "প্যাকেজ তৈরি করুন" : "Prepare the package"}</Button>
          {files ? (
            <>
              <Button variant="soft" onClick={() => save(`${slug}-permit-package.zip`, new Uint8Array(packageToZip(files, date)), "application/zip")}>
                {bn ? "জিপ ডাউনলোড" : "Download .zip"}
              </Button>
              <Badge tone="lavender">{bn ? `${files.length}টি ফাইল` : `${files.length} files`}</Badge>
            </>
          ) : null}
        </div>
        {problem ? <Callout tone="bad" title={bn ? "প্যাকেজ তৈরি হয়নি" : "The package could not be made"}>{problem}</Callout> : null}
      </Card>

      {files
        ? GROUPS.map((g) => {
            const list = files.filter((f) => f.path.startsWith(g.prefix));
            if (!list.length) return null;
            return (
              <Card key={g.prefix} className="stack" style={{ marginTop: 12 }}>
                <div className="row-between">
                  <h2 className="section-title">{bn ? g.bn : g.en}</h2>
                  <Badge tone="neutral">{list.length}</Badge>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  {list.map((f) => (
                    <Badge key={f.path} tone="neutral">{f.path.slice(g.prefix.length)}</Badge>
                  ))}
                </div>
              </Card>
            );
          })
        : null}
    </div>
  );
}
