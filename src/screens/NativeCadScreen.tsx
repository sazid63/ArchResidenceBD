import { useEffect, useMemo, useRef, useState } from "react";
import { saveFile } from "../platform/saveFile";
import { sizeMm, volumeM3 } from "../cad/mesh";
import type { MeshDocument, MeshObject } from "../cad/mesh";
import { MeshViewer } from "../cad/viewer";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { useActiveProject } from "../context/ProjectContext";
import { buildingForProject, meshForProject } from "../model/projectMesh";
import { analyzeStructure } from "../structure/analyze";
import { PlotShapeCallout } from "../components/PlotShapeCallout";
import { PlanCard } from "../components/PlanCard";
import { buildIfcStep, buildFreeCadMacro } from "../cad/exporters";
import type { Vec3 } from "../cad/viewer";
import "../cad/workspace.css";

interface Props {
  designPhaseId?: string;
  onNavigate?: (id: string) => void;
}

const EMPTY_MESH: MeshDocument = { schemaVersion: "0.1.0", units: "mm", objects: [] };

export function NativeCadScreen({ designPhaseId = "final", onNavigate }: Props) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<MeshViewer | null>(null);

  const project = useActiveProject();

  // All hooks MUST be called unconditionally — Rules of Hooks
  const [activeTab, setActiveTab] = useState<string>(designPhaseId);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<"iso" | "front" | "side" | "top">("iso");
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number; z: number }[]>([]);
  const [measureDistance, setMeasureDistance] = useState(0);
  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const design = useMemo(() => (built && built.ok ? analyzeStructure(built.model) : null), [built]);
  const designRows = useMemo<Array<[string, string, string]>>(() => {
    if (!design) return [];
    const uniq = (xs: string[]) => [...new Set(xs)].join(", ");
    const cols = design.frame.columns;
    const ground = uniq(cols.map((c) => `${c.storeys[0].section.bx}×${c.storeys[0].section.by}`));
    const top = uniq(cols.map((c) => { const st = c.storeys[c.storeys.length - 1]; return `${st.section.bx}×${st.section.by}`; }));
    const beams = uniq(design.levels.flatMap((l) => l.beamLines.map((b) => `${b.result.section.bMm}×${b.result.section.hMm}`)));
    const slabs = uniq(design.levels.map((l) => String(l.slabThicknessMm)));
    const foot = design.foundation.footings;
    const merged = design.foundation.mergedCount;
    return [
      ["Columns, ground storey (mm)", "কলাম, নিচতলা (মিমি)", ground],
      ["Columns, top storey (mm)", "কলাম, সবচেয়ে উপরের তলা (মিমি)", top],
      ["Beams, width × depth (mm)", "বিম, প্রস্থ × গভীরতা (মিমি)", beams],
      ["Slab thickness (mm)", "স্ল্যাবের পুরুত্ব (মিমি)", slabs],
      ["Footings (mm)", "ফুটিং (মিমি)", `${Math.min(...foot.map((f) => Math.min(f.x1 - f.x0, f.y1 - f.y0)))} to ${Math.max(...foot.map((f) => Math.max(f.x1 - f.x0, f.y1 - f.y0)))}${merged ? ` (${merged} merged)` : ""}`],
    ];
  }, [design]);

  const meshOf = (tab: string): MeshDocument => (project ? meshForProject(project, tab) : null) ?? EMPTY_MESH;
  const [mesh, setMesh] = useState<MeshDocument>(() => meshOf(designPhaseId));

  // 3D model tree state: hooks must stay above the early `if (!project)` return further down.
  const [treeFilter, setTreeFilter] = useState("");
  const [openKinds, setOpenKinds] = useState<Record<string, boolean>>({});
  const [treeShowAll, setTreeShowAll] = useState<Record<string, boolean>>({});
  const treeGroups = useMemo(() => {
    const q = treeFilter.trim().toLowerCase();
    const map = new Map<string, MeshObject[]>();
    for (const o of mesh?.objects ?? []) {
      if (q && !(o.label.toLowerCase().includes(q) || o.kind.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))) continue;
      (map.get(o.kind) ?? map.set(o.kind, []).get(o.kind)!).push(o);
    }
    return [...map.entries()].sort((x, y) => y[1].length - x[1].length);
  }, [mesh, treeFilter]);


  useEffect(() => {
    setActiveTab(designPhaseId);
  }, [designPhaseId]);

  // WebGL Canvas mounting & lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let viewer: MeshViewer | null = null;
    try {
      viewer = new MeshViewer(canvas);
      viewerRef.current = viewer;
      viewer.setMesh(meshOf(activeTab));
      viewer.setCameraPreset("iso");
      viewer.resize();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }

    const ro = new ResizeObserver(() => {
      viewer?.resize();
    });
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }

    const onResize = () => viewer?.resize();
    window.addEventListener("resize", onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      viewer?.dispose();
      viewerRef.current = null;
    };
  }, []);

  // Handle measurement clicks
  useEffect(() => {
    if (!measureMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      viewerRef.current?.handleMeasureClick(x, y);
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [measureMode]);

  // Measurement callback
  const handleMeasure = (points: Vec3[], totalDistance: number) => {
    setMeasurePoints(points.map(p => ({ x: p[0], y: p[1], z: p[2] })));
    setMeasureDistance(totalDistance);
  };

  // Enable/disable measurement mode
  const toggleMeasure = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const next = !measureMode;
    setMeasureMode(next);
    if (next) {
      viewer.enableMeasurements(handleMeasure);
      const canvas = canvasRef.current;
      if (canvas) {
        // Create overlay canvas for measurement lines
        let overlay = canvas.parentElement?.querySelector(".measure-overlay") as HTMLCanvasElement | null;
        if (!overlay) {
          overlay = document.createElement("canvas");
          overlay.className = "measure-overlay";
          overlay.style.position = "absolute";
          overlay.style.top = "0";
          overlay.style.left = "0";
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = "10";
          canvas.parentElement?.appendChild(overlay);
        }
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        viewer.setMeasureOverlay(overlay);
      }
    } else {
      viewer.disableMeasurements();
      viewer.setMeasureOverlay(null);
      setMeasurePoints([]);
      setMeasureDistance(0);
    }
  };

  // Update mesh geometry whenever project, activeTab, or customParams change
  useEffect(() => {
    if (!project) return;
    try {
      const generated = meshOf(activeTab);
      setMesh(generated);

      if (viewerRef.current) {
        viewerRef.current.setMesh(generated);
        viewerRef.current.resize();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, activeTab]);

  // Object visibility toggles
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !mesh) return;

    for (const object of mesh.objects) {
      viewer.setHidden(object.id, Boolean(hidden[object.id]));
    }
  }, [hidden, mesh]);

  const totals = useMemo(() => {
    const objects = mesh?.objects ?? [];
    const triangles = objects.reduce((sum, object) => sum + object.indices.length / 3, 0);
    const volume = objects.reduce((sum, object) => sum + volumeM3(object), 0);
    // Only reinforced-concrete elements count as concrete (walls, tanks and fixtures are not).
    const RCC = new Set(["footing", "column", "pier", "beam", "lintel", "slab", "balcony", "canopy", "stair"]);
    const concrete = objects.filter((o) => RCC.has(o.kind)).reduce((sum, object) => sum + volumeM3(object), 0);
    return { objects: objects.length, triangles, volume, concrete };
  }, [mesh]);

  // Early return — all hooks above are now called unconditionally
  if (!project) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "নেটিভ ক্যাড" : "Native CAD"} subtitle={lang === "bn" ? "কোনো সক্রিয় প্রকল্প পাওয়া যায়নি" : "No active project found"} />
        <Card>{lang === "bn" ? "আগে একটি প্রকল্প তৈরি বা খুলুন।" : "Please create or load a project first."}</Card>
      </div>
    );
  }

  // Handle Camera Presets
  const handleSetCamera = (mode: "iso" | "front" | "side" | "top") => {
    setCameraMode(mode);
    viewerRef.current?.setCameraPreset(mode);
  };

  const handleZoom = (factor: number) => {
    viewerRef.current?.zoomBy(factor);
  };

  const handleResetCamera = () => {
    setCameraMode("iso");
    viewerRef.current?.resetCamera();
  };

  const toggle = (id: string) => setHidden((prev) => ({ ...prev, [id]: !prev[id] }));

  // Export FreeCAD Python Macro
  const downloadText = (text: string, filename: string, mime: string) => {
    void saveFile(filename, text, `${mime};charset=utf-8`);
  };
  const exportBase = () => (project?.name ?? "building").replace(/[^a-zA-Z0-9]/g, "_");
  const exportMeta = () => ({
    projectName: project?.name ?? "Building",
    stories: project?.stories ?? 1,
    plotSize: project?.plotSize ?? 0,
    plotUnit: project?.plotUnit ?? "katha",
  });

  // v2.4.4: export the model on screen. The old button wrote a hard-coded 4 x 3 template macro
  // (fixed grid, 250 mm columns, no beams/walls/stairs) that did not match the project at all.
  const exportFreeCadMacro = () => {
    const doc = mesh;
    downloadText(buildFreeCadMacro(doc, exportMeta()), `${exportBase()}_${project?.stories ?? 1}Story_FreeCAD.py`, "text/x-python");
  };
  const exportIfc = () => {
    downloadText(buildIfcStep(mesh, exportMeta()), `${exportBase()}_${project?.stories ?? 1}Story.ifc`, "application/x-step");
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "নেটিভক্যাড ৩D পূর্ণাঙ্গ ভবন ডিজাইন" : "NativeCAD 3D Full Building Architecture"}
        subtitle={`${project.name} · ${project.stories} ${lang === "bn" ? "তলা পূর্ণাঙ্গ স্ট্রাকচারাল ফ্রেম" : "Storey Full Building Frame"} · ${totals.objects} elements · ${totals.concrete.toFixed(1)} m³ RCC`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={exportFreeCadMacro}>
              {lang === "bn" ? "ফ্রিক্যাড ম্যাক্রো (.py)" : "Export FreeCAD (.py)"}
            </Button>
            <Button variant="soft" onClick={exportIfc}>
              {lang === "bn" ? "আইএফসি (.ifc)" : "Export IFC (.ifc)"}
            </Button>
            <Button
              variant="primary"
              onClick={() => onNavigate?.("boq")}
            >
              {lang === "bn" ? "প্রাক্কলন ও BOQ দেখুন ➔" : "View BOQ & Costing ➔"}
            </Button>
          </div>
        }
      />
      <PlotShapeCallout project={project} />

      <PlanCard project={project} />

      {/* Phase Switcher Tabs at Top of Viewport */}
      <div className="row" style={{ gap: "6px", marginBottom: "12px", overflowX: "auto" }}>
        <Button
          variant={activeTab === "final" ? "primary" : "soft"}
          onClick={() => setActiveTab("final")}
        >
          {lang === "bn" ? "★ সম্পূর্ণ ৩D ভবন (মাস্টার)" : "★ Complete Building (Master 3D)"}
        </Button>
        <Button
          variant={activeTab.includes("foundation") ? "primary" : "soft"}
          onClick={() => setActiveTab("phase-foundation")}
        >
          {lang === "bn" ? "ফাউন্ডেশন ৩D" : "Foundation 3D"}
        </Button>
        <Button
          variant={activeTab.includes("ground") ? "primary" : "soft"}
          onClick={() => setActiveTab("phase-ground-floor")}
        >
          {lang === "bn" ? "নিচতলা ৩D" : "Ground Floor 3D"}
        </Button>
        {Array.from({ length: project.stories - 1 }).map((_, i) => (
          <Button
            key={i}
            variant={activeTab === `phase-floor-${i + 1}` ? "primary" : "soft"}
            onClick={() => setActiveTab(`phase-floor-${i + 1}`)}
          >
            {lang === "bn" ? `${i + 1}ম তলা ৩D` : `Floor ${i + 1} 3D`}
          </Button>
        ))}
        <Button
          variant={activeTab.includes("roof") ? "primary" : "soft"}
          onClick={() => setActiveTab("phase-rooftop")}
        >
          {lang === "bn" ? "ছাদ ও ওয়াটার ট্যাংক ৩D" : "Rooftop & Tank 3D"}
        </Button>
      </div>

      <div className="cad-layout">
        {/* Left Column: 3D Viewport & Metrics */}
        <div className="stack">
          <Card className="cad-viewport-card">
            {/* Viewport Toolbar: Camera View Presets */}
            <div className="row-between" style={{ padding: "4px 8px", background: "var(--surface-2)", borderRadius: "var(--r-md)" }}>
              <div className="row" style={{ gap: "6px" }}>
                <span className="small faint" style={{ marginRight: "4px" }}>
                  {lang === "bn" ? "ক্যামেরা ভিউ:" : "Camera:"}
                </span>
                <Button
                  variant={cameraMode === "iso" ? "primary" : "ghost"}
                  onClick={() => handleSetCamera("iso")}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  3D Iso
                </Button>
                <Button
                  variant={cameraMode === "front" ? "primary" : "ghost"}
                  onClick={() => handleSetCamera("front")}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  {lang === "bn" ? "সামনের ভিউ" : "Front"}
                </Button>
                <Button
                  variant={cameraMode === "side" ? "primary" : "ghost"}
                  onClick={() => handleSetCamera("side")}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  {lang === "bn" ? "পাশের ভিউ" : "Side"}
                </Button>
                <Button
                  variant={cameraMode === "top" ? "primary" : "ghost"}
                  onClick={() => handleSetCamera("top")}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                >
                  {lang === "bn" ? "টপ প্ল্যান" : "Top Plan"}
                </Button>
              </div>

              {/* Quick Component Visibility Filter Presets */}
              <div className="row" style={{ gap: "4px", flexWrap: "wrap" }}>
                <Button
                  variant="soft"
                  onClick={() => setHidden({})}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  title={lang === "bn" ? "ভবনের সব অংশ দেখান" : "Show all building solids"}
                >
                  👁 {lang === "bn" ? "সব দেখান" : "Show All"}
                </Button>
                <Button
                  variant="soft"
                  onClick={() => {
                    const newHidden: Record<string, boolean> = {};
                    mesh?.objects?.forEach((obj) => {
                      if (obj.kind === "slab") newHidden[obj.id] = true;
                    });
                    setHidden(newHidden);
                  }}
                  style={{ padding: "4px 8px", fontSize: "11px", background: "var(--surface-active)" }}
                  title={lang === "bn" ? "ঘরের ভেতর দেখতে মেঝের স্ল্যাব লুকান" : "Hide floor slabs to look inside rooms"}
                >
                  🏠 {lang === "bn" ? "রুমের ভেতর দেখুন (Hide Slabs)" : "Look Inside Rooms"}
                </Button>
                <Button
                  variant="soft"
                  onClick={() => {
                    const newHidden: Record<string, boolean> = {};
                    mesh?.objects?.forEach((obj) => {
                      if (obj.kind !== "column" && obj.kind !== "beam" && obj.kind !== "footing") {
                        newHidden[obj.id] = true;
                      }
                    });
                    setHidden(newHidden);
                  }}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  title={lang === "bn" ? "শুধু আরসিসি কলাম, বিম ও ফুটিং দেখান" : "Show RCC Columns, Beams & Footings only"}
                >
                  🏛 {lang === "bn" ? "শুধুমাত্র আরসিসি ফ্রেম" : "RCC Frame Only"}
                </Button>
              </div>

              <div className="row" style={{ gap: "4px" }}>
                <Button variant="ghost" onClick={() => handleZoom(0.85)} style={{ padding: "4px 8px", fontSize: "11px" }} title={lang === "bn" ? "বড় করুন" : "Zoom In"}>
                  +
                </Button>
                <Button variant="ghost" onClick={() => handleZoom(1.18)} style={{ padding: "4px 8px", fontSize: "11px" }} title={lang === "bn" ? "ছোট করুন" : "Zoom Out"}>
                  −
                </Button>
                <Button variant="ghost" onClick={handleResetCamera} style={{ padding: "4px 8px", fontSize: "11px" }} title={lang === "bn" ? "ক্যামেরা রিসেট" : "Reset Camera"}>
                  ⟲
                </Button>
                <Button
                  variant={measureMode ? "primary" : "ghost"}
                  onClick={toggleMeasure}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  title={lang === "bn" ? (measureMode ? "মাপার মোড বন্ধ করুন" : "মাপার মোড চালু করুন — দূরত্ব মাপতে মডেলে ক্লিক করুন") : (measureMode ? "Exit measurement mode" : "Enter measurement mode — click on model to measure distances")}
                >
                  📏 {measureMode ? (lang === "bn" ? "মাপ বন্ধ" : "Stop") : (lang === "bn" ? "মাপুন" : "Measure")}
                </Button>
              </div>
            </div>

            <div className="cad-viewport" style={{ position: "relative" }}>
              <canvas ref={canvasRef} className="cad-canvas" />
              {!mesh && !error ? <span className="muted small">{t("cadLoading")}</span> : null}
              {error ? (
                <div
                  role="alert"
                  style={{
                    position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: "10px", padding: "24px", textAlign: "center",
                    background: "var(--surface-2)", borderRadius: "var(--r-md)",
                  }}
                >
                  <strong>{lang === "bn" ? "৩ডি ভিউ চালু করা যায়নি" : "The 3D view could not start"}</strong>
                  <span className="small muted" style={{ maxWidth: 420 }}>
                    {/webgl/i.test(error)
                      ? lang === "bn"
                        ? "এই ডিভাইস বা ব্রাউজারে WebGL বন্ধ আছে। ব্রাউজার আপডেট করুন বা হার্ডওয়্যার অ্যাক্সেলারেশন চালু করুন। ড্রয়িং, BOQ ও রিপোর্ট এখনও কাজ করবে।"
                        : "WebGL is turned off or unsupported on this device or browser. Update the browser or enable hardware acceleration. Drawings, the BOQ and reports still work."
                      : error}
                  </span>
                  <div className="row" style={{ gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                    <button type="button" className="button" onClick={() => window.location.reload()}>
                      {lang === "bn" ? "আবার চেষ্টা করুন" : "Try again"}
                    </button>
                    <button type="button" className="button button--primary" onClick={() => onNavigate?.("docs:drawings")}>
                      {lang === "bn" ? "ড্রয়িং দেখুন" : "Open drawings"}
                    </button>
                    <button type="button" className="button" onClick={() => onNavigate?.("boq")}>
                      {lang === "bn" ? "BOQ দেখুন" : "Open BOQ"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {measureMode && measurePoints.length > 0 && (
              <div style={{ marginTop: "8px", padding: "8px 12px", background: "var(--surface-2)", borderRadius: "var(--r-md)", fontSize: "13px", fontFamily: "monospace" }}>
                <div className="row-between" style={{ marginBottom: "4px" }}>
                  <span>{lang === "bn" ? "মাপন" : "Measurement"}</span>
                  <Button variant="ghost" onClick={() => viewerRef.current?.clearMeasurements()} style={{ padding: "2px 8px", fontSize: "11px" }}>
                    {lang === "bn" ? "সাফ করুন" : "Clear"}
                  </Button>
                </div>
                {measurePoints.length > 0 && (
                  <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
                    <span>Points: {measurePoints.length}</span>
                    <span>Distance: {measureDistance.toFixed(0)} mm ({measureDistance / 1000} m)</span>
                  </div>
                )}
              </div>
            )}

            <div className="row-between">
              <span className="faint small">
                {lang === "bn"
                  ? "মাউস ড্র্যাগ করে ঘোরান, স্ক্রল করে জুম করুন"
                  : "Left click + drag to orbit, scroll wheel to zoom"}
              </span>
              <div className="row" style={{ gap: "16px" }}>
                <Stat label={t("cadObjects")} value={String(totals.objects)} />
                <Stat label={t("cadTriangles")} value={String(totals.triangles)} />
                <Stat label={t("cadVolume")} value={`${totals.volume.toFixed(2)} m³`} />
              </div>
            </div>

            {/* Architectural Material Legend */}
            <div
              className="row"
              style={{
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: "1px solid var(--border)",
                gap: "8px",
                flexWrap: "wrap",
                fontSize: "11px",
              }}
            >
              <span style={{ fontWeight: 600, opacity: 0.8 }}>{lang === "bn" ? "ম্যাটেরিয়াল কালার গাইড:" : "Material Legend:"}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#2e73d2", display: "inline-block" }}></span>
                RCC Frame (Col/Beam)
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#c2611f", display: "inline-block" }}></span>
                Brick Partition Wall
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#8c4514", display: "inline-block" }}></span>
                Teak Wood Door
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#33b8f2", display: "inline-block" }}></span>
                Glass Window/Railing
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#d9dce0", display: "inline-block" }}></span>
                Concrete Floor Slab
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#2e3847", display: "inline-block" }}></span>
                Granite Counter / Sunken Bath
              </span>
            </div>
          </Card>

          {/* Model Solid Objects Tree */}
          <Card className="stack">
            <div className="row-between">
              <h3>{t("cadModelTree")}</h3>
              <span className="small faint">{mesh?.objects?.length || 0} elements</span>
            </div>
            <label htmlFor="cad-tree-filter" className="visually-hidden">{lang === "bn" ? "এলিমেন্ট খুঁজুন" : "Filter elements"}</label>
            <input
              id="cad-tree-filter"
              className="input"
              placeholder={lang === "bn" ? "নাম বা ধরন দিয়ে খুঁজুন…" : "Filter by name or type…"}
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
            />
            <div style={{ maxHeight: "340px", overflowY: "auto" }} role="tree" aria-label={t("cadModelTree")}>
              {treeGroups.map(([kind, items]) => {
                const open = treeFilter.trim() ? true : !!openKinds[kind];
                const allHidden = items.every((o) => hidden[o.id]);
                const shown = open ? items.slice(0, treeShowAll[kind] ? items.length : 60) : [];
                return (
                  <div key={kind} role="treeitem" aria-expanded={open}>
                    <div className="cad-tree-row">
                      <button
                        type="button"
                        className="button button--ghost cad-eye"
                        onClick={() => setHidden((prev) => { const next = { ...prev }; items.forEach((o) => { next[o.id] = !allHidden; }); return next; })}
                        aria-label={`${allHidden ? t("cadShow") : t("cadHide")}: ${kind} (${items.length})`}
                      >
                        {allHidden ? "○" : "●"}
                      </button>
                      <button
                        type="button"
                        className="button button--ghost grow"
                        style={{ justifyContent: "flex-start", textAlign: "left" }}
                        aria-label={`${kind}, ${items.length}`}
                        onClick={() => setOpenKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                      >
                        <span aria-hidden="true">{open ? "▾" : "▸"}</span> {kind}
                      </button>
                      <Badge tone="neutral">{items.length}</Badge>
                    </div>
                    {shown.map((object) => {
                      const size = sizeMm(object);
                      return (
                        <div className="cad-tree-row" key={object.id} style={{ paddingInlineStart: "20px" }}>
                          <button
                            type="button"
                            className="button button--ghost cad-eye"
                            onClick={() => toggle(object.id)}
                            aria-label={`${hidden[object.id] ? t("cadShow") : t("cadHide")}: ${object.label}`}
                          >
                            {hidden[object.id] ? "○" : "●"}
                          </button>
                          <span className="grow ellipsis" title={object.id}>{object.label}</span>
                          <span className="mono faint small">
                            {Math.round(size[0])}×{Math.round(size[1])}×{Math.round(size[2])} mm
                          </span>
                        </div>
                      );
                    })}
                    {open && items.length > shown.length ? (
                      <button type="button" className="button button--ghost small" onClick={() => setTreeShowAll((prev) => ({ ...prev, [kind]: true }))}>
                        {lang === "bn" ? `আরও ${items.length - shown.length}টি দেখান` : `Show ${items.length - shown.length} more`}
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {treeGroups.length === 0 ? <p className="small muted">{lang === "bn" ? "কিছু পাওয়া যায়নি।" : "Nothing matches."}</p> : null}
            </div>
          </Card>
        </div>

        {/* Right Column: Parametric tweaks & controls */}
        <div className="stack">
          {/* The members the 3D shows: the structure result, not placeholders */}
          <Card className="stack">
            <h3 style={{ margin: 0 }}>{lang === "bn" ? "ডিজাইন করা সদস্যের মাপ" : "Designed members"}</h3>
            {design ? (
              <div className="stack" style={{ gap: "8px" }}>
                <p className="small muted" style={{ margin: 0 }}>
                  {lang === "bn"
                    ? "৩D মডেলের কলাম, বিম, স্ল্যাব ও ফুটিং স্ট্রাকচার স্ক্রিনের ফলাফল থেকে আসে। মাপ বদলাতে প্ল্যান, তলা সংখ্যা বা মাটির বেয়ারিং বদলান।"
                    : "The columns, beams, slabs and footings in the 3D come from the Structure result. To change a size, change the plan, the storeys or the soil bearing."}
                </p>
                {designRows.map(([en, bnLabel, value]) => (
                  <div className="row-between" key={en}>
                    <span className="small muted">{lang === "bn" ? bnLabel : en}</span>
                    <span className="mono bold">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                {lang === "bn" ? "প্ল্যান বাছাই করলে ডিজাইন করা মাপ এখানে দেখা যাবে।" : "Choose a plan and the designed sizes appear here."}
              </p>
            )}
          </Card>

          <Card className="stack">
            <h3 style={{ margin: 0 }}>{lang === "bn" ? "স্ট্রাকচারাল ফলাফল" : "Structural results"}</h3>
            <p className="small muted" style={{ margin: 0 }}>
              {lang === "bn"
                ? "লোড, মাপ, ভূমিকম্প ও ফুটিং যাচাই বিএনবিসি ২০২০ পার্ট ৬ অনুযায়ী স্ট্রাকচার স্ক্রিনে, অনুমানের তালিকাসহ।"
                : "Loads, member sizes, seismic and footing checks to BNBC 2020 Part 6 are on the Structure screen, with the assumptions listed."}
            </p>
            <Button variant="soft" onClick={() => onNavigate?.("structure")}>
              {lang === "bn" ? "স্ট্রাকচার স্ক্রিন খুলুন" : "Open the Structure screen"}
            </Button>
          </Card>
        </div>
      </div>

    </div>
  );
}
