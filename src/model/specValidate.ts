import type { ProjectSpec } from "./projectSpec";

/**
 * Value checks for a project that arrives from outside (a file, an old save, another tab): every number finite and in a sane range,
 * every id and name a bounded string. Returns the problems found (empty when fine). It never throws and never changes the spec.
 * The ranges are wide on purpose: they stop NaN, Infinity, negatives and absurd sizes, not unusual but real plots.
 */
const num = (v: unknown, min: number, max: number): boolean => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const optNum = (v: unknown, min: number, max: number): boolean => v === undefined || num(v, min, max);

export function specProblems(spec: ProjectSpec): string[] {
  const out: string[] = [];
  const need = (ok: boolean, what: string) => {
    if (!ok) out.push(what);
  };
  const p = spec.project;
  need(typeof p?.id === "string" && p.id.length > 0 && p.id.length <= 200, "project.id");
  need(typeof p?.name === "string" && p.name.length <= 500, "project.name");
  const plot = spec.site?.plot;
  need(num(plot?.areaSqm, 0, 1_000_000), "site.plot.areaSqm");
  need(optNum(plot?.frontageM, 0, 2000), "site.plot.frontageM");
  need(optNum(plot?.depthM, 0, 2000), "site.plot.depthM");
  need(optNum(plot?.roadWidthM, 0, 200), "site.plot.roadWidthM");
  need(optNum(spec.site?.soil?.sbcKpa, 0, 5000), "site.soil.sbcKpa");
  need(optNum(spec.site?.soil?.groundwaterDepthM, 0, 200), "site.soil.groundwaterDepthM");
  const st = spec.building?.storeys;
  need(num(st?.count, 0, 200) && Number.isInteger(st?.count), "building.storeys.count");
  need(optNum(st?.groundFloorHeightM, 0, 20), "building.storeys.groundFloorHeightM");
  need(optNum(st?.typicalFloorHeightM, 0, 20), "building.storeys.typicalFloorHeightM");
  need(optNum(spec.building?.unitsPerFloor, 0, 100), "building.unitsPerFloor");
  need(optNum(spec.building?.typicalUnitAreaSqm, 0, 100_000), "building.typicalUnitAreaSqm");
  need(Number.isInteger(spec.revision) && spec.revision >= 0, "revision");
  need(Array.isArray(spec.phases) && spec.phases.every((ph) => ph && typeof ph === "object" && typeof ph.id === "string"), "phases");
  return out;
}
