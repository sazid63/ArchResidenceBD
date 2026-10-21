import { useEffect, useMemo, useRef, useState } from "react";

import {
  FOUNDATION_DESIGN_URL,
  FLOOR_DESIGN_URL,
  MESH_URL,
  loadDesign,
  loadMesh,
  sizeMm,
  volumeM3,
} from "../cad/mesh";
import type { DesignDocument, MeshDocument, MeshObject } from "../cad/mesh";
import { MeshViewer } from "../cad/viewer";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader, Stat } from "../ui/kit";
import "../cad/workspace.css";

/** The phases the mesh carries, in the order the plan builds them. */
const PHASE_ORDER = ["foundation", "floor", "other"];

/** The phase id -> the label the workspace shows. */
const PHASE_LABEL: Record<string, "cadFoundation" | "cadFloor" | "cadOther"> = {
  foundation: "cadFoundation",
  floor: "cadFloor",
  other: "cadOther",
};

function kindLabel(kind: string): string {
  return kind
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function NativeCadScreen() {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<MeshViewer | null>(null);
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [foundation, setFoundation] = useState<DesignDocument | null>(null);
  const [floor, setFloor] = useState<DesignDocument | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMesh(MESH_URL), loadDesign(FOUNDATION_DESIGN_URL), loadDesign(FLOOR_DESIGN_URL)])
      .then(([meshDocument, foundationDocument, floorDocument]) => {
        if (cancelled) {
          return;
        }
        setMesh(meshDocument);
        setFoundation(foundationDocument);
        setFloor(floorDocument);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh) {
      return;
    }
    let viewer: MeshViewer | null = null;
    try {
      viewer = new MeshViewer(canvas);
      viewerRef.current = viewer;
      viewer.setMesh(mesh);
      viewer.resize();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    const onResize = () => viewer?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      viewer?.dispose();
      viewerRef.current = null;
    };
  }, [mesh]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !mesh) {
      return;
    }
    for (const object of mesh.objects) {
      viewer.setHidden(object.id, Boolean(hidden[object.id]));
    }
  }, [hidden, mesh]);

  const grouped = useMemo(() => {
    const groups = new Map<string, MeshObject[]>();
    for (const object of mesh?.objects ?? []) {
      const key = PHASE_ORDER.includes(object.phase) ? object.phase : "other";
      const list = groups.get(key) ?? [];
      list.push(object);
      groups.set(key, list);
    }
    return PHASE_ORDER.filter((phase) => groups.has(phase)).map((phase) => ({
      phase,
      objects: groups.get(phase) ?? [],
    }));
  }, [mesh]);

  const totals = useMemo(() => {
    const objects = mesh?.objects ?? [];
    const triangles = objects.reduce((sum, object) => sum + object.indices.length / 3, 0);
    const volume = objects.reduce((sum, object) => sum + volumeM3(object), 0);
    return { objects: objects.length, triangles, volume };
  }, [mesh]);

  const parameters = useMemo(() => {
    const rows: { name: string; value: number; unit: string; provenance: string; reason: string }[] = [];
    for (const document of [foundation, floor]) {
      for (const [name, value] of Object.entries(document?.values ?? {})) {
        rows.push({
          name,
          value: value.value,
          unit: value.unit,
          provenance: value.provenance,
          reason: value.reason,
        });
      }
    }
    return rows;
  }, [foundation, floor]);

  const assumptions = useMemo(() => {
    const rows: { pointer: string; value: number; unit: string; reason: string }[] = [];
    for (const document of [foundation, floor]) {
      for (const assumption of document?.assumptions ?? []) {
        rows.push(assumption);
      }
    }
    return rows;
  }, [foundation, floor]);

  const declaredAbsent = useMemo(
    () => [...(foundation?.declaredAbsent ?? []), ...(floor?.declaredAbsent ?? [])],
    [foundation, floor],
  );

  const toggle = (id: string) => setHidden((previous) => ({ ...previous, [id]: !previous[id] }));

  return (
    <div className="screen">
      <PageHeader
        title={t("cadTitle")}
        subtitle={t("cadSubtitle")}
        actions={<Button variant="primary">{t("rebuildAll")}</Button>}
      />

      {error ? (
        <Callout title={t("cadFailed")}>
          <span className="small">{error}</span>
        </Callout>
      ) : null}

      <div className="cad-layout">
        <Card className="cad-viewport-card">
          <div className="cad-viewport">
            <canvas ref={canvasRef} className="cad-canvas" />
            {!mesh && !error ? <span className="muted small">{t("cadLoading")}</span> : null}
          </div>
          <div className="row-between">
            <span className="faint small">{t("cadViewportHint")}</span>
            <div className="row">
              <Stat label={t("cadObjects")} value={String(totals.objects)} />
              <Stat label={t("cadTriangles")} value={String(totals.triangles)} />
              <Stat label={t("cadVolume")} value={`${totals.volume.toFixed(4)} m³`} />
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card className="stack">
            <h3>{t("cadModelTree")}</h3>
            {grouped.map((group) => (
              <div className="stack" key={group.phase}>
                <span className="muted small">{t(PHASE_LABEL[group.phase] ?? "cadOther")}</span>
                {group.objects.map((object) => {
                  const size = sizeMm(object);
                  return (
                    <div className="cad-tree-row" key={object.id}>
                      <button
                        type="button"
                        className="button button--ghost cad-eye"
                        onClick={() => toggle(object.id)}
                        aria-label={hidden[object.id] ? t("cadShow") : t("cadHide")}
                        title={hidden[object.id] ? t("cadShow") : t("cadHide")}
                      >
                        {hidden[object.id] ? "○" : "●"}
                      </button>
                      <span className="grow ellipsis">{object.label}</span>
                      <Badge tone="neutral">{kindLabel(object.kind)}</Badge>
                      <span className="num small">
                        {size.map((value) => Math.round(value)).join(" × ")} mm
                      </span>
                      <span className="num small">{volumeM3(object).toFixed(3)} m³</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>

          <Card className="stack">
            <h3>{t("cadParameters")}</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>{t("item")}</th>
                  <th>{t("qty")}</th>
                  <th>{t("provenance")}</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map((row) => (
                  <tr key={row.name}>
                    <td title={row.reason}>{row.name}</td>
                    <td className="num">
                      {row.value} {row.unit}
                    </td>
                    <td>
                      <Badge tone={row.provenance === "assumed" ? "amber" : "neutral"}>
                        {row.provenance}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {assumptions.length > 0 ? (
              <>
                <h4 className="muted small">{t("cadAssumptions")}</h4>
                {assumptions.map((assumption) => (
                  <span className="faint small" key={assumption.pointer}>
                    {assumption.pointer}: {assumption.value} {assumption.unit} — {assumption.reason}
                  </span>
                ))}
              </>
            ) : null}
            {declaredAbsent.length > 0 ? (
              <>
                <h4 className="muted small">{t("cadDeclaredAbsent")}</h4>
                {declaredAbsent.map((item) => (
                  <span className="faint small" key={item}>
                    {item}
                  </span>
                ))}
              </>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
