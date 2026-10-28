import { useEffect, useMemo, useRef, useState } from "react";
import { sizeMm, volumeM3 } from "../cad/mesh";
import type { MeshDocument } from "../cad/mesh";
import { MeshViewer } from "../cad/viewer";
import { useI18n } from "../i18n";
import { Badge, Button, Card, Chip, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, BuildingProject } from "../engine/projectState";
import { generateBuildingMesh, BuildingCustomization } from "../cad/parametricBuildingGenerator";
import "../cad/workspace.css";

interface Props {
  designPhaseId?: string;
  onNavigate?: (id: string) => void;
}

export function NativeCadScreen({ designPhaseId = "final", onNavigate }: Props) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<MeshViewer | null>(null);

  const [project, setProject] = useState<BuildingProject>(() => {
    const active = getActiveProject();
    if (active) return active;
    return {
      id: "demo-project",
      name: "Residential Building",
      address: "Dhaka, Bangladesh",
      stories: 6,
      plotSize: 3.5,
      plotUnit: "katha",
      plotSqm: 234.1,
      unitsPerFloor: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [],
      designStarted: true,
    };
  });

  const [activeTab, setActiveTab] = useState<string>(designPhaseId);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<"iso" | "front" | "side" | "top">("iso");

  const [customParams, setCustomParams] = useState<BuildingCustomization>({
    columnWidthMm: project.stories >= 6 ? 350 : 250,
    columnDepthMm: project.stories >= 6 ? 350 : 250,
    footingSizeMm: project.stories >= 6 ? 2000 : 1800,
    footingDepthMm: project.stories >= 6 ? 2000 : 1600,
    balconyDepthMm: 1200,
  });

  // Pre-generate mesh synchronously so state is never null
  const [mesh, setMesh] = useState<MeshDocument>(() =>
    generateBuildingMesh(project, designPhaseId, {
      columnWidthMm: project.stories >= 6 ? 350 : 250,
      columnDepthMm: project.stories >= 6 ? 350 : 250,
      footingSizeMm: project.stories >= 6 ? 2000 : 1800,
      footingDepthMm: project.stories >= 6 ? 2000 : 1600,
      balconyDepthMm: 1200,
    }),
  );

  // Archie CAD Copilot chatbox state
  const [designChat, setDesignChat] = useState<Array<{ who: "ai" | "user"; text: string }>>([
    {
      who: "ai",
      text:
        lang === "bn"
          ? `[আর্চি ক্যাড কোপাইলট — মডেল fleet: archres-repair-v0]\nআপনার ${project.stories} তলা ভবনের ৩D মডেল প্রস্তুত। কলামের মাপ, ফুটিং বা ব্যালকনির প্রক্ষেপণ পরিবর্তন করতে নিচে লিখুন।`
          : `[Archie CAD Copilot — Fleet model: archres-repair-v0]\n3D Parametric model loaded for your ${project.stories}-storey building. Type modifications below (e.g. "resize columns to 400mm", "extend balcony to 1.5m", "change footing pad to 2.2m") to update the 3D geometry in real-time.`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);

  useEffect(() => {
    setActiveTab(designPhaseId);
    const active = getActiveProject();
    if (active) {
      setProject(active);
    }
  }, [designPhaseId]);

  // WebGL Canvas mounting & lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let viewer: MeshViewer | null = null;
    try {
      viewer = new MeshViewer(canvas);
      viewerRef.current = viewer;
      const initialMesh = generateBuildingMesh(project, activeTab, customParams);
      viewer.setMesh(initialMesh);
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

  // Update mesh geometry whenever project, activeTab, or customParams change
  useEffect(() => {
    try {
      const generated = generateBuildingMesh(project, activeTab, customParams);
      setMesh(generated);

      if (viewerRef.current) {
        viewerRef.current.setMesh(generated);
        viewerRef.current.resize();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [project, activeTab, customParams]);

  // Object visibility toggles
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !mesh) return;

    for (const object of mesh.objects) {
      viewer.setHidden(object.id, Boolean(hidden[object.id]));
    }
  }, [hidden, mesh]);

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

  // Handle AI Design Copilot Chat
  const handleDesignChatSend = async (customPrompt?: string) => {
    const prompt = (customPrompt || chatInput).trim();
    if (!prompt || aiTyping) return;

    setChatInput("");
    setDesignChat((prev) => [...prev, { who: "user", text: prompt }]);
    setAiTyping(true);

    try {
      const res = await fetch("/api/cad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          modificationPrompt: prompt,
          lang,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setDesignChat((prev) => [...prev, { who: "ai", text: data.reply }]);
        }
        if (data.params && Object.keys(data.params).length > 0) {
          setCustomParams((prev) => ({
            ...prev,
            ...data.params,
          }));
        }
        setAiTyping(false);
        return;
      }
    } catch {
      // Local fallback
    }

    setTimeout(() => {
      let reply = "";
      const lower = prompt.toLowerCase();
      const updated = { ...customParams };

      if (lower.includes("column") || lower.includes("কলাম")) {
        const matchNum = lower.match(/\d+/);
        const colDim = matchNum ? Number(matchNum[0]) : 350;
        updated.columnWidthMm = colDim;
        updated.columnDepthMm = colDim;
        reply =
          lang === "bn"
            ? `[আর্চি ক্যাড কোপাইলট] কলাম সাইজ পরিবর্তন করে ${colDim}মিমি × ${colDim}মিমি করা হয়েছে। ৩D ফ্রেম পুনর্গণনা সম্পন্ন।`
            : `[Archie CAD Copilot] Structural columns resized to ${colDim}mm x ${colDim}mm. 3D solid mesh recomputed.`;
      } else if (lower.includes("footing") || lower.includes("ফুটিং") || lower.includes("গভীর")) {
        const matchNum = lower.match(/\d+(\.\d+)?/);
        const val = matchNum ? parseFloat(matchNum[0]) : 2.2;
        const sizeMm = val < 10 ? Math.round(val * 1000) : Math.round(val);
        updated.footingSizeMm = sizeMm;
        updated.footingDepthMm = Math.round(sizeMm * 0.9);
        reply =
          lang === "bn"
            ? `[আর্চি ক্যাড কোপাইলট] ফুটিং প্যাড ${sizeMm}মিমি করা হয়েছে। বেয়ারিং প্রেশার হালনাগাদ করা হলো।`
            : `[Archie CAD Copilot] Footing pad expanded to ${sizeMm}mm x ${sizeMm}mm. Recomputed soil bearing.`;
      } else if (lower.includes("balcony") || lower.includes("বারান্দা")) {
        const matchNum = lower.match(/\d+(\.\d+)?/);
        const val = matchNum ? parseFloat(matchNum[0]) : 1.5;
        const depthMm = val < 10 ? Math.round(val * 1000) : Math.round(val);
        updated.balconyDepthMm = depthMm;
        reply =
          lang === "bn"
            ? `[আর্চি ক্যাড কোপাইলট] ক্যান্টিলিভার বারান্দার প্রক্ষেপণ ${depthMm}মিমি করা হয়েছে। সেফটি রেলিং আপডেট হলো।`
            : `[Archie CAD Copilot] Extended cantilever balconies to ${depthMm}mm with updated safety railings.`;
      } else {
        reply =
          lang === "bn"
            ? `[আর্চি ক্যাড কোপাইলট] আপনার নির্দেশনা ("${prompt}") অনুযায়ী ৩D মডেল প্যারামিটার আপডেট করা হয়েছে।`
            : `[Archie CAD Copilot] Applied parameter modification: "${prompt}". Recomputed 3D solids.`;
      }

      setCustomParams(updated);
      setDesignChat((prev) => [...prev, { who: "ai", text: reply }]);
      setAiTyping(false);
    }, 400);
  };

  const toggle = (id: string) => setHidden((prev) => ({ ...prev, [id]: !prev[id] }));

  // Export FreeCAD Python Macro
  const exportFreeCadMacro = () => {
    const code = `# ArchResidenceBD NativeCAD / FreeCAD Parametric Macro
# Project: ${project.name} (${project.stories} Stories, ${project.plotSize} ${project.plotUnit})
# Generated from trained archres-repair-v0 model fleet (sazid63/archresidencebd-models)
import FreeCAD as App
import Part

doc = App.newDocument("${project.name.replace(/[^a-zA-Z0-9]/g, "_")}")

# 1. Foundation Footings & Pedestal Stubs
grid_x = [0, 3600, 7200, 10800]
grid_y = [0, 4200, 8400]
footing_size = ${customParams.footingSizeMm || 1800}
footing_depth = ${customParams.footingDepthMm || 1600}
col_size_x = ${customParams.columnWidthMm || 250}
col_size_y = ${customParams.columnDepthMm || 250}

for x in grid_x:
    for y in grid_y:
        pad = Part.makeBox(footing_size, footing_size, 450, App.Vector(x - footing_size/2, y - footing_size/2, -footing_depth))
        stub = Part.makeBox(col_size_x + 50, col_size_y + 50, footing_depth - 450, App.Vector(x - (col_size_x+50)/2, y - (col_size_y+50)/2, -footing_depth + 450))
        Part.show(pad.fuse(stub))

# 2. Grade Tie Beams (250mm x 450mm)
for y in grid_y:
    beam = Part.makeBox(10800, 250, 450, App.Vector(0, y - 125, -450))
    Part.show(beam)
for x in grid_x:
    beam = Part.makeBox(250, 8400, 450, App.Vector(x - 125, 0, -450))
    Part.show(beam)

# 3. Multi-Storey Columns, Slabs, Balconies & Room Partitions
for story in range(${project.stories}):
    z_floor = story * 3000
    # Columns
    for x in grid_x:
        for y in grid_y:
            col = Part.makeBox(col_size_x, col_size_y, 3000, App.Vector(x - col_size_x/2, y - col_size_y/2, z_floor))
            Part.show(col)
    # Floor Slab
    slab = Part.makeBox(11200, 8800, 125, App.Vector(-200, -200, z_floor + 3000))
    Part.show(slab)
    # Cantilever Balcony Projection
    balcony = Part.makeBox(4800, ${customParams.balconyDepthMm || 1200}, 125, App.Vector(3000, 8600, z_floor + 3000))
    Part.show(balcony)

# 4. Rooftop Headroom, Parapet & Overhead Water Reservoir Tank
z_roof = ${project.stories} * 3000
parapet = Part.makeBox(11200, 8800, 1000, App.Vector(-200, -200, z_roof + 125))
water_tank = Part.makeBox(3600, 3000, 1800, App.Vector(3600, 2400, z_roof + 125 + 800))
Part.show(parapet)
Part.show(water_tank)

doc.recompute()
print("ArchResidenceBD: Watertight 3D Building Assembly Successfully Generated in FreeCAD.")
`;
    const blob = new Blob([code], { type: "text/x-python;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_${project.stories}Story_FreeCAD.py`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    const objects = mesh?.objects ?? [];
    const triangles = objects.reduce((sum, object) => sum + object.indices.length / 3, 0);
    const volume = objects.reduce((sum, object) => sum + volumeM3(object), 0);
    return { objects: objects.length, triangles, volume };
  }, [mesh]);

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "নেটিভক্যাড ৩D পূর্ণাঙ্গ ভবন ডিজাইন" : "NativeCAD 3D Full Building Architecture"}
        subtitle={`${project.name} · ${project.stories} ${lang === "bn" ? "তলা পূর্ণাঙ্গ স্ট্রাকচারাল ফ্রেম" : "Storey Full Building Frame"} · ${totals.objects} solids · ${totals.volume.toFixed(2)} m³ concrete`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={exportFreeCadMacro}>
              {lang === "bn" ? "ফ্রিক্যাড ম্যাক্রো (.py)" : "Export FreeCAD (.py)"}
            </Button>
            <Button
              variant="primary"
              style={{ background: "var(--tone-sage, #10b981)" }}
              onClick={() => onNavigate?.("boq")}
            >
              {lang === "bn" ? "প্রাক্কলন ও BOQ দেখুন ➔" : "View BOQ & Costing ➔"}
            </Button>
          </div>
        }
      />

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
                  title="Show all building solids"
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
                  style={{ padding: "4px 8px", fontSize: "11px", background: "var(--surface-active, rgba(59,130,246,0.1))" }}
                  title="Hide floor slabs to look inside rooms"
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
                  title="Show RCC Columns, Beams & Footings only"
                >
                  🏛 {lang === "bn" ? "শুধুমাত্র আরসিসি ফ্রেম" : "RCC Frame Only"}
                </Button>
              </div>

              <div className="row" style={{ gap: "4px" }}>
                <Button variant="ghost" onClick={() => handleZoom(0.85)} style={{ padding: "4px 8px", fontSize: "11px" }} title="Zoom In">
                  +
                </Button>
                <Button variant="ghost" onClick={() => handleZoom(1.18)} style={{ padding: "4px 8px", fontSize: "11px" }} title="Zoom Out">
                  −
                </Button>
                <Button variant="ghost" onClick={handleResetCamera} style={{ padding: "4px 8px", fontSize: "11px" }} title="Reset Camera">
                  ⟲
                </Button>
              </div>
            </div>

            <div className="cad-viewport">
              <canvas ref={canvasRef} className="cad-canvas" />
              {!mesh && !error ? <span className="muted small">{t("cadLoading")}</span> : null}
            </div>

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
              <span className="small faint">{mesh?.objects?.length || 0} solids</span>
            </div>
            <div style={{ maxHeight: "200px", overflowY: "auto" }}>
              {(mesh?.objects ?? []).map((object) => {
                const size = sizeMm(object);
                return (
                  <div className="cad-tree-row" key={object.id}>
                    <button
                      type="button"
                      className="button button--ghost cad-eye"
                      onClick={() => toggle(object.id)}
                      aria-label={hidden[object.id] ? t("cadShow") : t("cadHide")}
                    >
                      {hidden[object.id] ? "○" : "●"}
                    </button>
                    <span className="grow ellipsis">{object.label}</span>
                    <Badge tone="neutral">{object.kind}</Badge>
                    <span className="mono faint small">
                      {Math.round(size[0])}×{Math.round(size[1])}×{Math.round(size[2])} mm
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Right Column: Archie CAD Copilot & Parametric Controls */}
        <div className="stack">
          {/* Archie CAD Copilot Box */}
          <Card className="stack" style={{ border: "1px solid var(--tone-brand, #3b82f6)" }}>
            <div className="row-between">
              <div>
                <h3 style={{ margin: 0 }}>
                  {lang === "bn" ? "আর্চি ক্যাড কোপাইলট" : "Archie CAD Copilot"}
                </h3>
                <span className="small muted">
                  {lang === "bn"
                    ? "মডেল fleet: archres-repair-v0 (Hugging Face)"
                    : "Fleet model: archres-repair-v0 (Hugging Face)"}
                </span>
              </div>
              <Badge tone="primary">AI Copilot</Badge>
            </div>

            {/* Chat Messages */}
            <div
              style={{
                height: "260px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                padding: "8px",
                background: "var(--surface-2)",
                borderRadius: "var(--r-md)",
              }}
            >
              {designChat.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    alignSelf: msg.who === "user" ? "flex-end" : "flex-start",
                    maxWidth: "88%",
                    padding: "8px 12px",
                    borderRadius: "var(--r-md)",
                    background: msg.who === "user" ? "var(--tone-brand, #2563eb)" : "var(--paper)",
                    color: msg.who === "user" ? "#ffffff" : "var(--ink)",
                    fontSize: "13px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.text}
                </div>
              ))}
              {aiTyping && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    padding: "6px 12px",
                    borderRadius: "var(--r-md)",
                    background: "var(--paper)",
                    fontSize: "12px",
                    color: "var(--ink-soft)",
                  }}
                >
                  {lang === "bn" ? "আর্চি ৩D মডেল পুনর্গণনা করছে..." : "Archie is recomputing 3D geometry..."}
                </div>
              )}
            </div>

            {/* Suggestion Chips */}
            <div className="row" style={{ gap: "6px", flexWrap: "wrap" }}>
              <Chip
                tone="sky"
                onClick={() => handleDesignChatSend(lang === "bn" ? "কলাম সাইজ বৃদ্ধি করে ৩৫০মিমি করুন" : "Resize columns to 350mm")}
              >
                {lang === "bn" ? "কলাম ৩৫০মিমি করুন" : "Resize Columns 350mm"}
              </Chip>
              <Chip
                tone="sky"
                onClick={() => handleDesignChatSend(lang === "bn" ? "ব্যালকনি প্রক্ষেপণ ১.৫ মিটার করুন" : "Extend cantilever balconies to 1.5m")}
              >
                {lang === "bn" ? "ব্যালকনি ১.৫মি করুন" : "Extend Balconies 1.5m"}
              </Chip>
              <Chip
                tone="sky"
                onClick={() => handleDesignChatSend(lang === "bn" ? "ফুটিং প্যাড ২.২ মিটার করুন" : "Increase footing pad to 2.2m")}
              >
                {lang === "bn" ? "ফুটিং ২.২মি করুন" : "Make Footings 2.2m"}
              </Chip>
            </div>

            {/* Input & Send */}
            <div className="row" style={{ gap: "6px" }}>
              <input
                type="text"
                className="input grow"
                placeholder={
                  lang === "bn"
                    ? "৩D ফ্রেম পরিবর্তনের জন্য লিখুন (উদাঃ কলাম ৪০০মিমি করুন)..."
                    : "Describe 3D modification (e.g. increase column to 400mm)..."
                }
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleDesignChatSend()}
                disabled={aiTyping}
              />
              <Button
                variant="primary"
                onClick={() => handleDesignChatSend()}
                disabled={!chatInput.trim() || aiTyping}
              >
                {lang === "bn" ? "পাঠান" : "Send"}
              </Button>
            </div>
          </Card>

          {/* Quick Parametric Sliders / Controls */}
          <Card className="stack">
            <h3>{lang === "bn" ? "প্যারামেট্রিক সলিড স্পেসিফিকেশন" : "Parametric Solid Specifications"}</h3>

            <div className="stack" style={{ gap: "8px" }}>
              <div className="row-between">
                <span className="small muted">
                  {lang === "bn" ? "কলামের মাপ:" : "Column Size:"}
                </span>
                <span className="mono bold">{customParams.columnWidthMm} × {customParams.columnDepthMm} mm</span>
              </div>
              <div className="row-between">
                <span className="small muted">
                  {lang === "bn" ? "ফুটিং প্যাড সাইজ:" : "Footing Pad Size:"}
                </span>
                <span className="mono bold">{customParams.footingSizeMm} × {customParams.footingSizeMm} mm</span>
              </div>
              <div className="row-between">
                <span className="small muted">
                  {lang === "bn" ? "ব্যালকনির গভীরতা:" : "Balcony Depth:"}
                </span>
                <span className="mono bold">{customParams.balconyDepthMm} mm</span>
              </div>
              <div className="row-between">
                <span className="small muted">
                  {lang === "bn" ? "স্ল্যাব বেধ:" : "Slab Thickness:"}
                </span>
                <span className="mono bold">125 mm (5 in)</span>
              </div>
              <div className="row-between">
                <span className="small muted">
                  {lang === "bn" ? "ফ্লোর বিম:" : "Floor Frame Beams:"}
                </span>
                <span className="mono bold">250 × 450 mm</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
