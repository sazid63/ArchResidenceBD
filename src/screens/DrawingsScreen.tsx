import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";
import { useActiveProject } from "../context/ProjectContext";
import { generateFloorPlanFromMesh, generateSection, generateElevation, exportDrawingAsSVG } from "../cad/drawingEngine";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import type { MeshDocument } from "../cad/mesh";

interface DrawingOptions {
  scale: number;
  project: string;
  drawingNo: string;
  direction?: string;
}

interface DrawingData {
  [key: string]: {
    type: string;
    title: string;
    svg: string;
  };
}

export function DrawingsScreen() {
  const { t, lang } = useI18n();
  const project = useActiveProject();
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [drawings, setDrawings] = useState<Record<string, { type: string; title: string; svg: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<string>("floor1");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const options: DrawingOptions = {
    scale: 100,
    project: project?.name ?? "Project",
    drawingNo: "A-101",
  };

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 768);
    updateMobile();
    window.addEventListener("resize", updateMobile);
    return () => window.removeEventListener("resize", updateMobile);
  }, []);

  useEffect(() => {
    if (!project) {
      setError(t("documentsNeedsPack"));
      return;
    }
    
    const loadDrawings = async () => {
      setLoading(true);
      setError(null);
      try {
        const meshDoc = generateBuildingMesh(project, "final", project.customization);
        setMesh(meshDoc);
        
        const drawingData: DrawingData = {};
        
        // Floor plans
        for (let i = 0; i < project.stories; i++) {
          const phase = i === 0 ? "ground_floor" : `floor-${i + 1}`;
          try {
            const plan = generateFloorPlanFromMesh(meshDoc, phase, options);
            drawingData[`floor${i + 1}`] = {
              type: "plan",
              title: `${lang === "bn" ? "তলা" : "Floor"} ${i + 1}`,
              svg: exportDrawingAsSVG(plan),
            };
          } catch (e) {
            console.warn(`Could not generate floor plan for ${phase}`);
          }
        }
        
        // Section
        const storyHeights = Array.from({ length: project.stories }, (_, i) => i === 0 ? 4500 : 3000);
        const section = generateSection(storyHeights, project.plotSqm * 0.7, options);
        drawingData["section"] = {
          type: "section",
          title: `${lang === "bn" ? "এককটু" : "Section"}`,
          svg: exportDrawingAsSVG(section),
        };
        
        // Elevations
        const elevOptions = { scale: 100, project: project.name, direction: "front" };
        const elevations = {
          front: generateElevation(project.plotSqm * 0.7, storyHeights, [], elevOptions),
          rear: generateElevation(project.plotSqm * 0.7, storyHeights, [], { ...elevOptions, direction: "rear" }),
          left: generateElevation(project.plotSqm * 0.7, storyHeights, [], { ...elevOptions, direction: "left" }),
          right: generateElevation(project.plotSqm * 0.7, storyHeights, [], { ...elevOptions, direction: "right" }),
        };
        
        for (const [dir, elev] of Object.entries(elevations)) {
          drawingData[`elevation_${dir}`] = {
            type: "elevation",
            title: `${lang === "bn" ? "উচ্চতা" : "Elevation"} ${dir}`,
            svg: exportDrawingAsSVG(elev),
          };
        }
        
        setDrawings(drawingData);
        setActiveView(Object.keys(drawingData)[0] || "floor1");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    
    loadDrawings();
  }, [project, t, lang]);

  if (error) {
    return (
      <div className="screen">
        <PageHeader title={t("documentsTitle")} subtitle={t("documentsSubtitle")} />
        <Callout title={t("documentsFailed")}>
          <span className="small">{error}</span>
        </Callout>
      </div>
    );
  }

  if (loading || !drawings) {
    return (
      <div className="screen">
        <PageHeader title={t("documentsTitle")} subtitle={t("documentsSubtitle")} />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "ড্রয়িং তৈরি হচ্ছে..." : "Generating drawings..."}
        </div>
      </div>
    );
  }

  const views = useMemo(() => 
    Object.entries(drawings).map(([id, data]) => ({
      id,
      title: data.title,
      type: data.type,
    })),
  [drawings]
);

  return (
    <div className="screen">
      <PageHeader title={t("documentsTitle")} subtitle={t("documentsSubtitle")} />
      
      {/* Mobile View Selector */}
      {isMobile && (
        <div className="row" style={{ gap: "8px", marginBottom: "16px", overflowX: "auto" }}>
          {views.map(({ id, title, type }) => (
            <Button
              key={id}
              variant={activeView === id ? "primary" : "soft"}
              onClick={() => setActiveView(id)}
              style={{ padding: "8px 12px", fontSize: "13px" }}
            >
              {title}
            </Button>
          ))}
        </div>
      )}

      {/* Drawing Viewer */}
      <div className="drawing-viewer" style={{ 
        position: "relative", 
        height: isMobile ? "70vh" : "80vh", 
        maxHeight: "800px",
        background: "var(--paper)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        border: "1px solid var(--line)"
      }}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "auto", touchAction: "manipulation" }}>
          <div
            dangerouslySetInnerHTML={{ __html: drawings[activeView].svg }}
            style={{ width: "100%", height: "100%", display: "block", objectFit: "contain" }}
          />
        </div>
      </div>

      /* Controls */
      <div className="row" style={{ gap: "8px", marginTop: "16px", justifyContent: "center" }}>
        <Button variant="soft" onClick={() => {
          const blob = new Blob([drawings[activeView].svg], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${project!.id}_${activeView}.svg`;
          a.click();
          URL.revokeObjectURL(url);
        }}>
          {lang === "bn" ? "SVG ডাউনলোড" : "Download SVG"}
        </Button>
        <Button variant="soft" onClick={() => {
          const blob = new Blob([drawings[activeView].svg], { type: "image/svg+xml" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${project!.id}_${activeView}.dxf`;
          a.click();
          URL.revokeObjectURL(url);
        }}>
          {lang === "bn" ? "DXF ডাউনলোড" : "Download DXF"}
        </Button>
        <Button variant="primary" onClick={() => {
          // Download all drawings individually (browser can't ZIP easily without JSZip)
          Object.entries(drawings).forEach(([id, data]) => {
            const blob = new Blob([data.svg], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project!.id}_${id}.svg`;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
        }}>
          {lang === "bn" ? "সব ড্রয়িং প্যাকেট" : "All Drawings Package"}
        </Button>
      </div>
    </div>
  );
}