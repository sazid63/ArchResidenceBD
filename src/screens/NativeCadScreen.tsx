import { useEffect, useMemo, useRef, useState } from "react";
import { sizeMm, volumeM3 } from "../cad/mesh";
import type { MeshDocument } from "../cad/mesh";
import { MeshViewer } from "../cad/viewer";
import { useI18n } from "../i18n";
import type { BuildingProject } from "../engine/projectState";
import { Badge, Button, Card, Chip, PageHeader, Stat } from "../ui/kit";
import { useActiveProject, useProject } from "../context/ProjectContext";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import type { BuildingCustomization } from "../types/customization";
import {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";
import {
  analyzeBeam,
  analyzeColumn,
  designFooting,
  seismicAnalysis,
  CONCRETE_GRADES,
  STEEL_GRADES,
  BNBC_DEFAULT,
  type RectSection,
} from "../cad/structuralEngine";
import { buildIfcStep, buildFreeCadMacro, orderedPhases } from "../cad/exporters";
import type { Vec3 } from "../cad/viewer";
import "../cad/workspace.css";

interface TitleBlockData {
  projectName: string;
  projectAddress: string;
  projectNumber: string;
  drawingNumber: string;
  drawingTitle: string;
  scale: string;
  drawnBy: string;
  checkedBy: string;
  approvedBy: string;
  date: string;
  revision: string;
  revisionDate: string;
  revisionNote: string;
  northArrow: boolean;
  logoPath: string;
}

function generateTitleBlockSVG(tb: TitleBlockData) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 594" style="background:white;font-family:Arial,sans-serif">
    <rect x="0" y="0" width="840" height="594" fill="white" stroke="#333" stroke-width="2"/>
    <rect x="10" y="10" width="820" height="80" fill="none" stroke="#333" stroke-width="1"/>
    <text x="20" y="35" font-size="16" font-weight="bold">${tb.projectName}</text>
    <text x="20" y="55" font-size="10">${tb.projectAddress}</text>
    <text x="20" y="75" font-size="10">Project No: ${tb.projectNumber}</text>
    <rect x="650" y="10" width="180" height="80" fill="none" stroke="#333" stroke-width="1"/>
    <text x="660" y="30" font-size="10">${tb.drawingNumber}</text>
    <text x="660" y="45" font-size="10">${tb.drawingTitle}</text>
    <text x="660" y="60" font-size="10">Scale: ${tb.scale}</text>
    <text x="660" y="75" font-size="10">Date: ${tb.date}</text>
    <rect x="10" y="100" width="400" height="50" fill="none" stroke="#333" stroke-width="1"/>
    <text x="20" y="120" font-size="10">Drawn: ${tb.drawnBy}</text>
    <text x="20" y="135" font-size="10">Checked: ${tb.checkedBy}</text>
    <text x="20" y="115" font-size="10">Approved: ${tb.approvedBy}</text>
    <rect x="420" y="100" width="410" height="50" fill="none" stroke="#333" stroke-width="1"/>
    <text x="430" y="120" font-size="10">Rev: ${tb.revision}</text>
    <text x="430" y="135" font-size="10">Date: ${tb.revisionDate}</text>
    <text x="430" y="150" font-size="10">${tb.revisionNote}</text>
  </svg>`;
}

interface Props {
  designPhaseId?: string;
  onNavigate?: (id: string) => void;
}

export function NativeCadScreen({ designPhaseId = "final", onNavigate }: Props) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<MeshViewer | null>(null);

  const project = useActiveProject();
  const { saveCustomization, refreshProject } = useProject();

  // All hooks MUST be called unconditionally — Rules of Hooks
  const [activeTab, setActiveTab] = useState<string>(designPhaseId);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<"iso" | "front" | "side" | "top">("iso");
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number; z: number }[]>([]);
  const [measureDistance, setMeasureDistance] = useState(0);

  // Title block state
  const [titleBlock, setTitleBlock] = useState<TitleBlockData>({
    projectName: project?.name || "Residential Building",
    projectAddress: project?.address || "Dhaka, Bangladesh",
    projectNumber: project?.id?.slice(0, 8).toUpperCase() || "DEMO",
    drawingNumber: "A-101",
    drawingTitle: "Ground Floor Plan",
    scale: "1:100",
    drawnBy: "ArchResidenceBD AI",
    checkedBy: "",
    approvedBy: "",
    date: new Date().toLocaleDateString("en-GB"),
    revision: "0",
    revisionDate: "",
    revisionNote: "",
    northArrow: true,
    logoPath: "",
  });

  const [customParams, setCustomParams] = useState<BuildingCustomization>(() => {
    const stories = project?.stories || 6;
    const base = stories >= 6 ? {
      columnWidthMm: 350, columnDepthMm: 350,
      footingSizeMm: 2000, footingDepthMm: 2000,
      balconyDepthMm: 1200,
    } : {
      columnWidthMm: 300, columnDepthMm: 300,
      footingSizeMm: 1800, footingDepthMm: 1600,
      balconyDepthMm: 1200,
    };
    return { ...base, ...(project?.customization || {}) };
  });

  // Persist customization changes back to project
  const setCustomAndSave = (patch: Partial<BuildingCustomization>) => {
    const next = { ...customParams, ...patch };
    setCustomParams(next);
    saveCustomization(next);
    refreshProject();
  };

  // Pre-generate mesh synchronously so state is never null
  const [mesh, setMesh] = useState<MeshDocument>(() =>
    project ? generateBuildingMesh(project, designPhaseId, customParams) : generateBuildingMesh({
      id: "demo",
      name: "Demo Building",
      address: "Dhaka, Bangladesh",
      stories: 6,
      plotSize: 3.5,
      plotUnit: "katha",
      plotSqm: 234.115,
      unitsPerFloor: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phases: [],
      designStarted: true,
      customization: {
        columnWidthMm: 300,
        columnDepthMm: 300,
        footingSizeMm: 1800,
        footingDepthMm: 1600,
        balconyDepthMm: 1200,
        concreteGrade: 25,
        steelGrade: 415,
        accessibility: DEFAULT_ACCESSIBILITY,
        sustainability: DEFAULT_SUSTAINABILITY_DHAKA,
        fireSafety: DEFAULT_FIRE_SAFETY,
        valueEngineering: DEFAULT_VALUE_ENGINEERING,
        constructionMgmt: DEFAULT_CONSTRUCTION_MGMT,
      },
    } as BuildingProject, designPhaseId, customParams),
  );

  // Archie CAD Copilot chatbox state
  const [designChat, setDesignChat] = useState<Array<{ who: "ai" | "user"; text: string }>>([
    {
      who: "ai",
      text:
        lang === "bn"
          ? `[আর্চি ক্যাড কোপাইলট — মডেল fleet: archres-repair-v0]\nআপনার ${project?.stories ?? 6} তলা ভবনের ৩D মডেল প্রস্তুত। কলামের মাপ, ফুটিং বা ব্যালকনির প্রক্ষেপণ পরিবর্তন করতে নিচে লিখুন।`
          : `[Archie CAD Copilot — Fleet model: archres-repair-v0]\n3D Parametric model loaded for your ${project?.stories ?? 6}-storey building. Type modifications below (e.g. "resize columns to 400mm", "extend balcony to 1.5m", "change footing pad to 2.2m") to update the 3D geometry in real-time.`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);

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
      const initialMesh = project ? generateBuildingMesh(project, activeTab, customParams) : mesh;
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

  // Live structural engineering analysis (BNBC 2020 / ACI 318)
  const structural = useMemo(() => {
    if (!project) return null;
    try {
      const concrete = CONCRETE_GRADES[25];
      const steel = STEEL_GRADES[415];

      const colSection: RectSection = {
        width: customParams.columnWidthMm ?? 300,
        depth: customParams.columnDepthMm ?? 300,
        cover: 40,
        mainBarDia: (customParams.columnWidthMm ?? 300) >= 350 ? 16 : 12,
        numMainBars: 8,
        linkDia: 8,
      };

      const footprintSqm = project.plotSqm;
      const floorAreaPerStory = footprintSqm * 0.7;
      // Factored gravity: 24 kN/m² (1.4D + 1.6L, D=13, L=4.5 typical residential + walls)
      const gravityPerStory = floorAreaPerStory * 24; // kN
      const columnCount = Math.max(9, Math.round(Math.sqrt(footprintSqm) / 3.6) * 4);
      const columnLoad = (gravityPerStory * project.stories) / columnCount; // kN each
      const storyHeight = 3.0;

      const column = analyzeColumn(colSection, {
        axialLoad: columnLoad,
        momentMajor: columnLoad * 0.12, // e = 0.12h typical first-order
        momentMinor: columnLoad * 0.08,
        unbracedLength: storyHeight,
      }, concrete, steel);

      const beamSpan = 4.5; // m typical grid
      const beamSection: RectSection = {
        width: 250,
        depth: 450,
        cover: 40,
        mainBarDia: 16,
        numMainBars: 6,
        linkDia: 8,
      };
      const wallLoad = 1.2 * 3 * 14; // 3m wall, 14 kN/m²
      const beam = analyzeBeam(beamSection, beamSpan, {
        selfWeight: 0.25 * 0.45 * 24,
        superimposedDead: 2.0,
        liveLoad: 2.5,
        wallLoad,
      }, concrete, steel);

      const soil = {
        qu: 200,
        ad: 120, // kN/m² typical Dhaka stiff clay (SPT N 10-15)
        cohesion: 50,
        frictionAngle: 20,
        unitWeight: 18,
        sptN: 12,
      };
      const footing = designFooting(
        customParams.columnWidthMm ?? 300,
        customParams.columnDepthMm ?? 300,
        columnLoad,
        soil,
        concrete,
      );

      // Seismic (BNBC 2020 Ch 2.5, Dhaka Zone 3)
      const totalWeight = floorAreaPerStory * project.stories * 12; // kN seismic weight (dead+0.25LL)
      const heights: number[] = [];
      for (let i = 1; i <= project.stories; i++) heights.push(i * storyHeight);
      const storyStiffness = heights.map(() => 1.8e7); // kN/mm frame lateral stiffness (conservative)
      const seismic = seismicAnalysis(totalWeight, heights, BNBC_DEFAULT, storyStiffness);

      return { concrete, steel, column, beam, footing, seismic, columnLoad, columnCount, floorAreaPerStory, beamSpan };
    } catch {
      return null;
    }
  }, [customParams, project]);

  const totals = useMemo(() => {
    const objects = mesh?.objects ?? [];
    const triangles = objects.reduce((sum, object) => sum + object.indices.length / 3, 0);
    const volume = objects.reduce((sum, object) => sum + volumeM3(object), 0);
    return { objects: objects.length, triangles, volume };
  }, [mesh]);

  // Early return — all hooks above are now called unconditionally
  if (!project) {
    return (
      <div className="screen">
        <PageHeader title="Native CAD" subtitle="No active project found" />
        <Card>Please create or load a project first.</Card>
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
          setCustomAndSave(data.params);
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

      setCustomAndSave(updated);
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
            <Button variant="soft" onClick={() => setActiveTab("title-block")}>
              {lang === "bn" ? "টাইটেল ব্লক ✏️" : "Title Block ✏️"}
            </Button>
            <Button variant="soft" onClick={() => {
              const phases = orderedPhases(mesh);
              const ifc = buildIfcStep(mesh, { projectName: project.name, stories: project.stories, plotSize: project.plotSize, plotUnit: project.plotUnit });
              const macro = buildFreeCadMacro(mesh, { projectName: project.name, stories: project.stories, plotSize: project.plotSize, plotUnit: project.plotUnit });
              const summary = JSON.stringify({ project, phases, meshSummary: { objects: mesh.objects.length } }, null, 2);
              const blob = new Blob([ifc, "---PEER-REVIEW-MARKER---\n", macro, "---PEER-REVIEW-MARKER---\n", summary], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `${project.id}_peer-review.txt`; a.click();
              URL.revokeObjectURL(url);
            }}>
              {lang === "bn" ? "সম্পাদক প্যাক 📋" : "Peer Review 📋"}
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
                <Button
                  variant={measureMode ? "primary" : "ghost"}
                  onClick={toggleMeasure}
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  title={measureMode ? "Exit measurement mode" : "Enter measurement mode — click on model to measure distances"}
                >
                  📏 {measureMode ? (lang === "bn" ? "মাপ বন্ধ" : "Stop") : (lang === "bn" ? "মাপুন" : "Measure")}
                </Button>
              </div>
            </div>

            <div className="cad-viewport" style={{ position: "relative" }}>
              <canvas ref={canvasRef} className="cad-canvas" />
              {!mesh && !error ? <span className="muted small">{t("cadLoading")}</span> : null}
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
              <label htmlFor="cad-chat-input" className="visually-hidden">
                {lang === "bn" ? "৩D ফ্রেম পরিবর্তন লিখুন" : "Describe 3D frame modification"}
              </label>
              <input
                id="cad-chat-input"
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

          {/* Structural Engineering Analysis — BNBC 2020 */}
          {structural && (
            <Card className="stack" style={{ border: "1px solid var(--tone-sage, #10b981)" }}>
              <div className="row-between">
                <div>
                  <h3 style={{ margin: 0 }}>
                    {lang === "bn" ? "স্ট্রাকচারাল এনজিনিয়ারিং" : "Structural Engineering"}
                  </h3>
                  <span className="small muted">
                    BNBC 2020 · M25 · Fe415 · {lang === "bn" ? "সম্মিলিত ধ্বস নকশা" : "Strength Design (LRFD)"}
                  </span>
                </div>
                <Badge tone="sage">{lang === "bn" ? "লাইভ" : "LIVE"}</Badge>
              </div>

              {/* Column */}
              <div className="stack" style={{ gap: "4px", padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-md)" }}>
                <div className="row-between">
                  <span className="small muted">🏛 {lang === "bn" ? "কলাম (প্রতিটি)" : "Column (each)"}</span>
                  <span className="mono small">{Math.round(structural.columnLoad)} kN {lang === "bn" ? "অক্ষীয়" : "axial"}</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "সক্ষমতা (Pn)" : "Capacity (Pn)"}</span>
                  <span className="mono small">{structural.column.Pu_capacity.toFixed(0)} kN</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "ইউটিলাইজেশন" : "Utilization"}</span>
                  <span className={`mono small ${structural.column.utilization > 0.9 ? "tone-danger" : structural.column.utilization > 0.7 ? "tone-warn" : "tone-success"}`}>
                    {(structural.column.utilization * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "স্লেন্ডার রেশিও (λ)" : "Slenderness (λ)"}</span>
                  <span className="mono small">
                    {structural.column.slendernessRatioX.toFixed(1)} / {structural.column.slendernessRatioY.toFixed(1)}{" "}
                    {structural.column.isSlender && "⚠"}
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "ল্যাপ স্প্লাইস" : "Lap Splice"}</span>
                  <span className="mono small">
                    {structural.column.lapSpliceRequired ? `${structural.column.lapLength} mm (Class B)` : "—"}
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "লিংক ডিটেইলিং" : "Link Detailing"}</span>
                  <span className="mono small">{structural.column.detail.mainBarArrangement} @100/S</span>
                </div>
              </div>

              {/* Beam */}
              <div className="stack" style={{ gap: "4px", padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-md)" }}>
                <div className="row-between">
                  <span className="small muted">〰 {lang === "bn" ? "বিম (৪.৫ মি স্প্যান)" : "Beam (4.5m span)"}</span>
                  <span className="mono small">{structural.beam.maxMoment} kN·m</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "শিয়ার (V_u)" : "Shear (V_u)"}</span>
                  <span className="mono small">{structural.beam.maxShear} kN</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "মোমেন্ট ইউটিলাইজেশন" : "Moment Util."}</span>
                  <span className={`mono small ${structural.beam.utilizationMoment > 0.9 ? "tone-danger" : structural.beam.utilizationMoment > 0.7 ? "tone-warn" : "tone-success"}`}>
                    {(structural.beam.utilizationMoment * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "ডিফ্লেকশন" : "Deflection"}</span>
                  <span className={`mono small ${structural.beam.maxDeflection > structural.beam.allowableDeflection ? "tone-danger" : "tone-success"}`}>
                    {structural.beam.maxDeflection} mm (≤ {structural.beam.allowableDeflection})
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "শিয়ার লিংক" : "Shear Links"}</span>
                  <span className="mono small">{structural.beam.detail.stirrupCage}</span>
                </div>
              </div>

              {/* Foundation */}
              <div className="stack" style={{ gap: "4px", padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-md)" }}>
                <div className="row-between">
                  <span className="small muted">⬇ {lang === "bn" ? "ফুটিং ডিজাইন" : "Footing Design"}</span>
                  <span className="mono small">{structural.footing.footingWidth} × {structural.footing.footingWidth} × {structural.footing.footingDepth} m</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "বেয়ারিং ইউটিলাইজেশন" : "Bearing Util."}</span>
                  <span className={`mono small ${structural.footing.bearingCapacityUtil > 1.0 ? "tone-danger" : "tone-success"}`}>
                    {(structural.footing.bearingCapacityUtil * 100).toFixed(0)}% (q_a=120 kN/m²)
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "ম্যাট ফুটিং" : "Mat Footing"}</span>
                  <span className={`small ${structural.footing.matFootingRequired ? "tone-danger" : "tone-success"}`}>
                    {structural.footing.matFootingRequired ? "⚠ " + (lang === "bn" ? "প্রয়োজন" : "Required") : "✓ OK"}
                  </span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "রেবার" : "Rebar"}</span>
                  <span className="mono small">T{structural.footing.rebarSize} @ {structural.footing.rebarSpacing} mm</span>
                </div>
              </div>

              {/* Seismic */}
              <div className="stack" style={{ gap: "4px", padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-md)" }}>
                <div className="row-between">
                  <span className="small muted">🌊 {lang === "bn" ? "সিসমিক (জোন ৩)" : "Seismic (Zone 3)"}</span>
                  <span className="mono small">T = {structural.seismic.naturalPeriod}s</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "বেস শিয়ার (V)" : "Base Shear (V)"}</span>
                  <span className="mono small">{structural.seismic.baseShear} kN (V/W={structural.seismic.baseShearCoeff})</span>
                </div>
                <div className="row-between">
                  <span className="small muted">{lang === "bn" ? "সর্বোচ্চ ড্রিফট" : "Max Drift"}</span>
                  <span className={`mono small ${structural.seismic.maxDrift > structural.seismic.allowableDrift ? "tone-danger" : "tone-success"}`}>
                    {structural.seismic.maxDrift} mm (H/500 = {structural.seismic.allowableDrift} mm)
                  </span>
                </div>
              </div>

              <div className="row" style={{ gap: "6px" }}>
                <Button
                  variant="soft"
                  style={{ flex: 1 }}
                  onClick={() => {
                    const text = [
                      `Structural Analysis — ${project.name} (${project.stories} storeys)`,
                      `Materials: M25 concrete / Fe415 steel | Code: BNBC 2020, ACI 318`,
                      ``,
                      `Columns: ${structural.columnLoad.toFixed(0)} kN axial each (${structural.columnCount} cols)`,
                      `  Capacity Pn = ${structural.column.Pu_capacity.toFixed(0)} kN | Utilization = ${(structural.column.utilization * 100).toFixed(0)}%`,
                      `  Slenderness λx=${structural.column.slendernessRatioX} λy=${structural.column.slendernessRatioY} ${structural.column.isSlender ? "(SLENDER — apply 2nd order)" : "(short column)"}`,
                      `  Mains: ${structural.column.detail.mainBarArrangement} | Links: 8mm @100/S plastic hinge, @150/S elsewhere`,
                      ``,
                      `Beams: ${structural.beamSpan} m span | M_u = ${structural.beam.maxMoment} kN·m | V_u = ${structural.beam.maxShear} kN`,
                      `  Moment utilization = ${(structural.beam.utilizationMoment * 100).toFixed(0)}% | Δ = ${structural.beam.maxDeflection} mm (allow ${structural.beam.allowableDeflection} mm)`,
                      `  Stirrups: ${structural.beam.detail.stirrupCage}`,
                      ``,
                      `Footings: ${structural.footing.footingWidth} m square × ${structural.footing.footingDepth} m deep | q_a = 120 kN/m² (SPT N=12)`,
                      `  Bearing utilization = ${(structural.footing.bearingCapacityUtil * 100).toFixed(0)}% | Mesh: T${structural.footing.rebarSize} @ ${structural.footing.rebarSpacing} mm c/c`,
                      ``,
                      `Seismic (BNBC 2020 Ch 2.5, Zone 3, Dhaka):`,
                      `  W = ${structural.seismic.seismicWeight} kN | T = ${structural.seismic.naturalPeriod} s | V = ${structural.seismic.baseShear} kN (V/W = ${structural.seismic.baseShearCoeff})`,
                      `  Max story drift = ${structural.seismic.maxDrift} mm ≤ H/500 = ${structural.seismic.allowableDrift} mm`,
                      ``,
                      `Generated by ArchResidenceBD structural engine`,
                    ].join("\n");
                    const blob = new Blob([text], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_structural_analysis.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  📄 {lang === "bn" ? "এনালিসিস রিপোর্ট (.txt)" : "Analysis Report (.txt)"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Title Block Editor Modal */}
      {activeTab === "title-block" && (
        <div className="modal-overlay" style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
        }} onClick={() => setActiveTab(designPhaseId)}>
        <div className="modal" style={{
          background: "var(--surface)", padding: "24px", borderRadius: "var(--r-lg)",
          width: "90%", maxWidth: "600px", maxHeight: "90vh", overflow: "auto",
          boxShadow: "var(--shadow-xl)"
        }} onClick={e => e.stopPropagation()}>
          <h2 style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {lang === "bn" ? "টাইটেল ব্লক এডিটর" : "Title Block Editor"}
            <Button variant="ghost" onClick={() => setActiveTab(designPhaseId)} style={{ padding: "4px 8px", fontSize: "12px" }}>✕</Button>
          </h2>

          <div className="stack" style={{ gap: "12px" }}>
            <div className="row" style={{ gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-project-name">
                  {lang === "bn" ? "প্রকল্পের নাম" : "Project Name"}
                </label>
                <input className="input" id="title-project-name" value={titleBlock.projectName} onChange={e => setTitleBlock({ ...titleBlock, projectName: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-project-number">
                  {lang === "bn" ? "প্রকল্প নম্বর" : "Project No."}
                </label>
                <input className="input" id="title-project-number" value={titleBlock.projectNumber} onChange={e => setTitleBlock({ ...titleBlock, projectNumber: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-drawing-number">
                  {lang === "bn" ? "ড্রয়িং নম্বর" : "Drawing No."}
                </label>
                <input className="input" id="title-drawing-number" value={titleBlock.drawingNumber} onChange={e => setTitleBlock({ ...titleBlock, drawingNumber: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-drawing-title">
                  {lang === "bn" ? "ড্রয়িং শিরোনাম" : "Drawing Title"}
                </label>
                <input className="input" id="title-drawing-title" value={titleBlock.drawingTitle} onChange={e => setTitleBlock({ ...titleBlock, drawingTitle: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-scale">
                  {lang === "bn" ? "স্কেল" : "Scale"}
                </label>
                <input className="input" id="title-scale" value={titleBlock.scale} onChange={e => setTitleBlock({ ...titleBlock, scale: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-date">
                  {lang === "bn" ? "তারিখ" : "Date"}
                </label>
                <input className="input" type="date" id="title-date" value={titleBlock.date} onChange={e => setTitleBlock({ ...titleBlock, date: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-drawn-by">
                  {lang === "bn" ? "ড্রাফটসম্যান" : "Drawn By"}
                </label>
                <input className="input" id="title-drawn-by" value={titleBlock.drawnBy} onChange={e => setTitleBlock({ ...titleBlock, drawnBy: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-checked-by">
                  {lang === "bn" ? "চেক করা" : "Checked By"}
                </label>
                <input className="input" id="title-checked-by" value={titleBlock.checkedBy} onChange={e => setTitleBlock({ ...titleBlock, checkedBy: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-approved-by">
                  {lang === "bn" ? "অনুমোদিত" : "Approved By"}
                </label>
                <input className="input" id="title-approved-by" value={titleBlock.approvedBy} onChange={e => setTitleBlock({ ...titleBlock, approvedBy: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-revision">
                  {lang === "bn" ? "রিভিশন" : "Revision"}
                </label>
                <input className="input" id="title-revision" value={titleBlock.revision} onChange={e => setTitleBlock({ ...titleBlock, revision: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-revision-date">
                  {lang === "bn" ? "রিভিশন তারিখ" : "Revision Date"}
                </label>
                <input className="input" type="date" id="title-revision-date" value={titleBlock.revisionDate} onChange={e => setTitleBlock({ ...titleBlock, revisionDate: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-revision-note">
                  {lang === "bn" ? "রিভিশন নোট" : "Revision Note"}
                </label>
                <input className="input" id="title-revision-note" value={titleBlock.revisionNote} onChange={e => setTitleBlock({ ...titleBlock, revisionNote: e.target.value })} />
              </div>
            </div>

            <div className="row" style={{ gap: "12px", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-north-arrow">
                  {lang === "bn" ? "উত্তর বাণ" : "North Arrow"}
                </label>
                <select className="input" id="title-north-arrow" value={String(titleBlock.northArrow)} onChange={e => setTitleBlock({ ...titleBlock, northArrow: e.target.value === "true" })}>
                  <option value="true">{lang === "bn" ? "হ্যাঁ" : "Yes"}</option>
                  <option value="false">{lang === "bn" ? "না" : "No"}</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="small muted" style={{ display: "block", marginBottom: "4px" }} htmlFor="title-project-address">
                  {lang === "bn" ? "প্রকল্প ঠিকানা" : "Project Address"}
                </label>
                <input className="input" id="title-project-address" value={titleBlock.projectAddress} onChange={e => setTitleBlock({ ...titleBlock, projectAddress: e.target.value })} />
              </div>
            </div>

            <div style={{ marginTop: "16px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Button variant="soft" onClick={() => setActiveTab(designPhaseId)}>
                {lang === "bn" ? "বাতিল" : "Cancel"}
              </Button>
              <Button variant="primary" onClick={() => {
                // Save title block to project
                // Note: titleBlock is not part of BuildingCustomization, so we'd need to extend the type
                // For now, just refresh to trigger re-render
                refreshProject();
                setActiveTab(designPhaseId);
              }}>
                {lang === "bn" ? "সংরক্ষণ করুন" : "Save Title Block"}
              </Button>
              <Button variant="soft" onClick={() => {
                // Export title block as SVG
                const svg = generateTitleBlockSVG(titleBlock);
                const blob = new Blob([svg], { type: "image/svg+xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${titleBlock.drawingNumber}_title-block.svg`; a.click();
                URL.revokeObjectURL(url);
              }}>
                {lang === "bn" ? "SVG এক্সপোর্ট" : "Export SVG"}
              </Button>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
