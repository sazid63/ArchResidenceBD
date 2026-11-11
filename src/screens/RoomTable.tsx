import { useMemo } from "react";
import { useI18n } from "../i18n";
import type { BuildingProject } from "../engine/projectState";
import { buildingForProject } from "../model/projectMesh";
import { OPENING_PERCENT, WINDOW_HEIGHT_MM } from "../plans/rules";
import { fmtDec } from "../ui/format";
import { Badge, Card } from "../ui/kit";

/**
 * Dwellings and daylight: per flat the net area, and per room the net area, window area and the BNBC Table 3.1.12 share
 * (15 % habitable, 18 % kitchen). Read from the typical floor of the building model, so it agrees with the plan checks.
 */
export function RoomTable({ project }: { project: BuildingProject }) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const data = useMemo(() => {
    const built = buildingForProject(project);
    if (!built || !built.ok) return null;
    const m = built.model;
    const geo = m.storeys[Math.min(1, m.storeys.length - 1)].geometry;
    const rooms = geo.fitted.rooms.map((r, i) => {
      const pct = OPENING_PERCENT[r.def.kind];
      const win = (geo.windows.filter((w) => w.a === i).reduce((a, w) => a + (w.to - w.from), 0) * WINDOW_HEIGHT_MM) / 1e6;
      const net = geo.metrics[i].netAreaM2;
      return { id: r.def.id, unit: r.def.unit ?? "", name: r.def.name, net, win, pct, need: pct === undefined ? null : (pct / 100) * net, lit: geo.metrics[i].exteriorMm > 0 || geo.metrics[i].shaftMm > 0 };
    });
    const flats = [...new Set(rooms.map((r) => r.unit).filter(Boolean))].map((u) => ({ unit: u, net: rooms.filter((r) => r.unit === u).reduce((a, r) => a + r.net, 0) }));
    return { rooms: rooms.filter((r) => r.unit && r.pct !== undefined), flats };
  }, [project]);
  if (!data || data.rooms.length === 0) return null;
  return (
    <section className="stack" style={{ marginTop: 28, gap: 12 }} aria-label={bn ? "ফ্ল্যাট ও দিনের আলো" : "Dwellings and daylight"}>
      <h2 className="section-title">{bn ? "ফ্ল্যাট ও দিনের আলো" : "Dwellings and daylight"}</h2>
      <Card className="stack">
        <p className="muted">
          {bn ? "প্রতি ফ্ল্যাটের নিট ক্ষেত্রফল: " : "Net area per flat: "}
          {data.flats.map((f) => `${f.unit} ${fmtDec(f.net, 1)} m²`).join(" · ")}
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>{bn ? "ফ্ল্যাট" : "Flat"}</th>
              <th>{bn ? "কক্ষ" : "Room"}</th>
              <th className="num">{bn ? "নিট (মি²)" : "Net (m²)"}</th>
              <th className="num">{bn ? "জানালা (মি²)" : "Window (m²)"}</th>
              <th className="num">{bn ? "দরকার (মি²)" : "Needed (m²)"}</th>
              <th>{bn ? "ফল" : "Result"}</th>
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((r) => {
              const ok = r.need !== null && r.win + 1e-9 >= r.need;
              const noWindow = r.win === 0 && r.lit; // lit through a shaft: no window to measure
              return (
                <tr key={r.id}>
                  <td>{r.unit}</td>
                  <td>{bn ? r.name.bn : r.name.en}</td>
                  <td className="num">{fmtDec(r.net, 1)}</td>
                  <td className="num">{fmtDec(r.win, 2)}</td>
                  <td className="num">{r.need === null ? "-" : `${fmtDec(r.need, 2)} (${r.pct}%)`}</td>
                  <td>
                    {noWindow ? <Badge tone="neutral">{bn ? "শাফটে আলো" : "lit by shaft"}</Badge> : ok ? <Badge tone="mint">{bn ? "ঠিক আছে" : "ok"}</Badge> : <Badge tone="amber">{bn ? "কম" : "short"}</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="faint small">{bn ? "বিএনবিসি ২০২০ সারণি ৩.১.১২; জানালার উচ্চতা ১.২ মিটার ধরা হয়েছে (অনুমান)।" : "BNBC 2020 Table 3.1.12; window height taken as 1.2 m (assumption)."}</p>
      </Card>
    </section>
  );
}
