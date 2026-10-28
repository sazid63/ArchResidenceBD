/**
 * CAD exporters (W3): real, valid exports of the measured mesh.
 *
 * Two exporters, both dependency-free:
 *
 * 1. `buildFreeCadMacro` - a FreeCAD Python macro that rebuilds the actual Part geometry
 *    (one `Part.makeBox` per mesh object using its measured bounding box), groups the
 *    solids per phase in `App::Part` groups and colours them with the exact palette the
 *    WebGL viewer uses (`getColorForObject`). It also carries a guarded optional IFC
 *    export via `ifcopenshell.api` that is skipped cleanly in vanilla FreeCAD.
 *
 * 2. `buildIfcStep` - a hand-written ISO 10303-21 (SPF) file carrying IFC4 ADD2
 *    entities: project -> site -> building -> storey (one per phase) -> one extruded
 *    box per mesh object, with deterministic 22-character IFC GUIDs.
 *
 * The STEP writer is strict about the things that break hand-written files: every
 * referenced #N is defined, line numbers are sequential, parentheses balance, and every
 * GlobalId is a valid 22-character IFC base-64 GUID. `validateIfcStep` checks all of
 * that and is used by the smoke test in `scripts/test-exporters.ts`.
 */

import type { MeshDocument, MeshObject } from "./mesh";
import { getColorForObject } from "./viewer";

/** What the export needs to know about the project (W2.2). */
export interface ExportMeta {
  projectName: string;
  stories: number;
  plotSize: number;
  plotUnit: string;
  generatedAt?: string;
}

// ---------------------------------------------------------------------------
// IFC GUIDs (the buildingSMART base-64 compression, ported from ifcopenshell)
// ---------------------------------------------------------------------------

/** IFC base-64 alphabet (digit-first, unlike RFC 4648). */
const IFC_B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
const STD_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** FNV-1a over UTF-8 bytes, 128-bit (BigInt). Deterministic across platforms. */
function fnv1a128(text: string): bigint {
  const prime = 0x0000000001000000000000000000013bn;
  const mask = (1n << 128n) - 1n;
  let hash = 0x6c62272e07bb014262b821756295c58dn;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash;
}

/**
 * Compress 16 bytes into the 22-character IFC GUID form.
 *
 * This is an exact port of ifcopenshell's `guid.compress`: prepend two zero bytes
 * (the "0000" hex pad), standard base-64 encode (18 bytes -> 24 characters), drop the
 * first two characters (12 leading padding bits; the four remaining padding bits mean
 * the first GUID character only carries two data bits, so it is always '0'..'3'),
 * then translate the standard alphabet to the IFC alphabet.
 */
export function guidFromBytes(bytes: Uint8Array): string {
  const padded = new Uint8Array(18);
  padded.set(bytes, 2);
  let binary = "";
  for (let i = 0; i < padded.length; i += 1) {
    binary += String.fromCharCode(padded[i]);
  }
  const standard = btoa(binary).slice(2);
  let guid = "";
  for (const character of standard) {
    guid += IFC_B64[STD_B64.indexOf(character)];
  }
  return guid;
}

/** Deterministic 22-character IFC GUID for a stable key (FNV-1a 128 over UTF-8). */
export function ifcGuid(stableKey: string): string {
  const hash = fnv1a128(stableKey);
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Number((hash >> BigInt(8 * (15 - i))) & 0xffn);
  }
  return guidFromBytes(bytes);
}

// ---------------------------------------------------------------------------
// STEP serialisation helpers
// ---------------------------------------------------------------------------

/** A STEP string literal: quoted, '' for apostrophes, \X2\....\X0\ for non-ASCII. */
function stepString(value: string): string {
  let out = "'";
  for (const character of value) {
    const code = character.codePointAt(0) as number;
    if (character === "'") {
      out += "''";
    } else if (character === "\\") {
      out += "\\X2\\5C\\X0\\";
    } else if (code < 0x20 || code > 0x7e) {
      out += `\\X2\\${code.toString(16).toUpperCase().padStart(4, "0")}\\X0\\`;
    } else {
      out += character;
    }
  }
  return out + "'";
}

/** A STEP real literal (ISO 10303-21 requires the decimal point). */
function stepReal(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.";
  }
  let text = value
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  if (!/[.eE]/.test(text)) {
    text += ".";
  }
  return text;
}

// ---------------------------------------------------------------------------
// Phases and kind mapping (shared by both exporters)
// ---------------------------------------------------------------------------

function phaseSortKey(phase: string): [number, number, string] {
  if (phase === "foundation") return [0, 0, phase];
  if (phase === "ground_floor") return [1, 0, phase];
  const floorMatch = /^floor_(\d+)$/.exec(phase);
  if (floorMatch) return [2, Number(floorMatch[1]), phase];
  if (phase === "roof") return [3, 0, phase];
  return [4, 0, phase];
}

/** The phases present in the document, in build order (foundation -> floors -> roof). */
export function orderedPhases(doc: MeshDocument): string[] {
  const seen = new Set<string>();
  for (const object of doc.objects) {
    seen.add(object.phase || "other");
  }
  return Array.from(seen).sort((a, b) => {
    const keyA = phaseSortKey(a);
    const keyB = phaseSortKey(b);
    if (keyA[0] !== keyB[0]) return keyA[0] - keyB[0];
    if (keyA[1] !== keyB[1]) return keyA[1] - keyB[1];
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/** The human storey name for a phase ("floor_2" -> "Floor 2"). */
export function phaseStoreyName(phase: string): string {
  if (phase === "foundation") return "Foundation";
  if (phase === "ground_floor") return "Ground Floor";
  const floorMatch = /^floor_(\d+)$/.exec(phase);
  if (floorMatch) return `Floor ${floorMatch[1]}`;
  if (phase === "roof") return "Roof";
  return phase.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * The IFC4 entity class for a mesh kind.
 *
 * column -> IfcColumn; beam / lintel / grade-beam -> IfcBeam; footing -> IfcFooting;
 * slab -> IfcSlab; wall / partition / parapet / spandrel -> IfcWall; door -> IfcDoor;
 * window -> IfcWindow; stair -> IfcStair; railing -> IfcRailing; everything else
 * (tank, canopy, kitchen, bath, balcony, excavation, guard, glass, door_frame, ...)
 * -> IfcBuildingElementProxy.
 */
export function ifcClassForKind(kind: string): string {
  const k = (kind || "").toLowerCase();
  if (k === "column") return "IfcColumn";
  if (k === "beam" || k === "lintel" || k === "grade-beam" || k === "grade_beam") return "IfcBeam";
  if (k === "footing") return "IfcFooting";
  if (k === "slab") return "IfcSlab";
  if (k === "wall" || k === "partition" || k === "parapet" || k === "spandrel") return "IfcWall";
  if (k === "door") return "IfcDoor";
  if (k === "window") return "IfcWindow";
  if (k === "stair" || k === "stairs") return "IfcStair";
  if (k === "railing") return "IfcRailing";
  return "IfcBuildingElementProxy";
}

const PROXY_OBJECT_TYPES: Record<string, string> = {
  bath: "Bath",
  balcony: "Balcony",
  canopy: "Canopy",
  door_frame: "DoorFrame",
  excavation: "Excavation",
  glass: "GlassPanel",
  guard: "Guard",
  kitchen: "KitchenCounter",
  tank: "Tank",
};

/** A sensible ObjectType for kinds that become IfcBuildingElementProxy. */
export function proxyObjectType(kind: string): string {
  const k = (kind || "").toLowerCase();
  if (PROXY_OBJECT_TYPES[k]) return PROXY_OBJECT_TYPES[k];
  return k
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/ /g, "");
}

// ---------------------------------------------------------------------------
// IFC4 ADD2 STEP writer
// ---------------------------------------------------------------------------

export function buildIfcStep(doc: MeshDocument, meta: ExportMeta): string {
  const projectName = meta.projectName?.trim() || "ArchResidenceBD";
  const generatedAt = meta.generatedAt ? new Date(meta.generatedAt) : new Date();
  const stamp = Number.isNaN(generatedAt.getTime()) ? new Date() : generatedAt;
  const epoch = Math.floor(stamp.getTime() / 1000);

  const guidFor = (key: string): string => ifcGuid(`${projectName}:${key}`);
  const phases = orderedPhases(doc);

  const objectsByPhase = new Map<string, MeshObject[]>();
  for (const phase of phases) objectsByPhase.set(phase, []);
  for (const object of doc.objects) {
    const phase = object.phase || "other";
    const bucket = objectsByPhase.get(phase);
    if (bucket) bucket.push(object);
  }

  const lines: string[] = [];
  let next = 1;
  const define = (entity: string): number => {
    const id = next;
    next += 1;
    lines.push(`#${id}=${entity};`);
    return id;
  };
  const ref = (id: number): string => `#${id}`;

  // -- people, organisation, ownership, units, contexts --
  define(`IFCPERSON($,'Exporter','ArchResidence',$,$,$,$,$)`);
  const organizationId = define(`IFCORGANIZATION($,${stepString(projectName)},$,$,$)`);
  const personAndOrganizationId = define(`IFCPERSONANDORGANIZATION(#1,${ref(organizationId)},$)`);
  const applicationId = define(
    `IFCAPPLICATION(${ref(organizationId)},'1.0',${stepString(`${projectName} mesh exporter`)},'ARBD-EXPORT')`,
  );
  const ownerHistoryId = define(
    `IFCOWNERHISTORY(${ref(personAndOrganizationId)},${ref(applicationId)},$,.ADDED.,$,$,$,${epoch})`,
  );
  const lengthUnitId = define(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  const angleUnitId = define(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const unitAssignmentId = define(`IFCUNITASSIGNMENT((${ref(lengthUnitId)},${ref(angleUnitId)}))`);
  const zAxisId = define(`IFCDIRECTION((0.,0.,1.))`);
  const xAxisId = define(`IFCDIRECTION((1.,0.,0.))`);
  const originId = define(`IFCCARTESIANPOINT((0.,0.,0.))`);
  const worldPlacementId = define(
    `IFCAXIS2PLACEMENT3D(${ref(originId)},${ref(zAxisId)},${ref(xAxisId)})`,
  );
  const modelContextId = define(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-5,${ref(worldPlacementId)},$)`,
  );
  const bodyContextId = define(
    `IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ref(modelContextId)},$,.MODEL_VIEW.,$)`,
  );

  // -- project -> site -> building --
  const projectId = define(
    `IFCPROJECT(${stepString(guidFor("project"))},${ref(ownerHistoryId)},${stepString(projectName)},$,$,${stepString(projectName)},$,(${ref(modelContextId)}),${ref(unitAssignmentId)})`,
  );
  const sitePlacementId = define(`IFCLOCALPLACEMENT($,${ref(worldPlacementId)})`);
  const siteId = define(
    `IFCSITE(${stepString(guidFor("site"))},${ref(ownerHistoryId)},'Site',$,$,${ref(sitePlacementId)},$,$,.ELEMENT.,$,$,$,$,$)`,
  );
  define(
    `IFCRELAGGREGATES(${stepString(guidFor("rel:project:site"))},${ref(ownerHistoryId)},$,$,${ref(projectId)},(${ref(siteId)}))`,
  );
  const buildingPlacementId = define(`IFCLOCALPLACEMENT(${ref(sitePlacementId)},${ref(worldPlacementId)})`);
  const buildingId = define(
    `IFCBUILDING(${stepString(guidFor("building"))},${ref(ownerHistoryId)},'Building',$,$,${ref(buildingPlacementId)},$,$,.ELEMENT.,$,$,$)`,
  );
  define(
    `IFCRELAGGREGATES(${stepString(guidFor("rel:site:building"))},${ref(ownerHistoryId)},$,$,${ref(siteId)},(${ref(buildingId)}))`,
  );

  // -- one storey per phase --
  const storeyPlacementIds = new Map<string, number>();
  const storeyIds = new Map<string, number>();
  for (const phase of phases) {
    const objects = objectsByPhase.get(phase) ?? [];
    const elevation = objects.length > 0 ? Math.min(...objects.map((o) => o.bboxMinMm[2])) : 0;
    const placementId = define(`IFCLOCALPLACEMENT(${ref(buildingPlacementId)},${ref(worldPlacementId)})`);
    storeyPlacementIds.set(phase, placementId);
    const storeyId = define(
      `IFCBUILDINGSTOREY(${stepString(guidFor(`storey:${phase}`))},${ref(ownerHistoryId)},${stepString(phaseStoreyName(phase))},$,$,${ref(placementId)},$,$,.ELEMENT.,${stepReal(elevation)})`,
    );
    storeyIds.set(phase, storeyId);
  }
  define(
    `IFCRELAGGREGATES(${stepString(guidFor("rel:building:storeys"))},${ref(ownerHistoryId)},$,$,${ref(buildingId)},(${phases.map((phase) => ref(storeyIds.get(phase) as number)).join(",")}))`,
  );

  // -- one product per mesh object: extruded rectangle profile, +dz, placed at the bbox --
  const productIdsByPhase = new Map<string, number[]>();
  for (const phase of phases) productIdsByPhase.set(phase, []);
  for (const object of doc.objects) {
    const phase = object.phase || "other";
    const storeyPlacement = storeyPlacementIds.get(phase);
    const className = ifcClassForKind(object.kind);
    const min = object.bboxMinMm;
    const max = object.bboxMaxMm;
    const dx = Math.max(0, max[0] - min[0]);
    const dy = Math.max(0, max[1] - min[1]);
    const dz = Math.max(0, max[2] - min[2]);

    const profileOriginId = define(`IFCCARTESIANPOINT((0.,0.,0.))`);
    const profilePlacementId = define(`IFCAXIS2PLACEMENT3D(${ref(profileOriginId)},$,$)`);
    const profileId = define(
      `IFCRECTANGLEPROFILEDEF(.AREA.,$,${ref(profilePlacementId)},${stepReal(dx)},${stepReal(dy)})`,
    );
    const extrudeDirectionId = define(`IFCDIRECTION((0.,0.,1.))`);
    const solidId = define(
      `IFCEXTRUDEDAREASOLID(${ref(profileId)},${ref(profilePlacementId)},${ref(extrudeDirectionId)},${stepReal(dz)})`,
    );
    const shapeRepresentationId = define(
      `IFCSHAPEREPRESENTATION(${ref(bodyContextId)},'Body','SweptSolid',(${ref(solidId)}))`,
    );
    const productShapeId = define(`IFCPRODUCTDEFINITIONSHAPE($,$,(${ref(shapeRepresentationId)}))`);

    const locationId = define(
      `IFCCARTESIANPOINT((${stepReal(min[0])},${stepReal(min[1])},${stepReal(min[2])}))`,
    );
    const axisId = define(`IFCAXIS2PLACEMENT3D(${ref(locationId)},$,$)`);
    const placementId = define(
      `IFCLOCALPLACEMENT(${storeyPlacement === undefined ? "$" : ref(storeyPlacement)},${ref(axisId)})`,
    );

    const guid = stepString(guidFor(`product:${object.id}`));
    const name = stepString(object.label || object.id);
    let entity: string;
    if (className === "IfcDoor") {
      entity = `IFCDOOR(${guid},${ref(ownerHistoryId)},${name},$,$,${ref(placementId)},${ref(productShapeId)},$,.DOOR.,.NOTDEFINED.,$)`;
    } else if (className === "IfcWindow") {
      entity = `IFCWINDOW(${guid},${ref(ownerHistoryId)},${name},$,$,${ref(placementId)},${ref(productShapeId)},$,.WINDOW.,.NOTDEFINED.,$)`;
    } else if (className === "IfcBuildingElementProxy") {
      entity = `IFCBUILDINGELEMENTPROXY(${guid},${ref(ownerHistoryId)},${name},$,${stepString(proxyObjectType(object.kind))},${ref(placementId)},${ref(productShapeId)},$,.NOTDEFINED.)`;
    } else {
      entity = `${className.toUpperCase()}(${guid},${ref(ownerHistoryId)},${name},$,$,${ref(placementId)},${ref(productShapeId)},$,$)`;
    }
    const productId = define(entity);
    const bucket = productIdsByPhase.get(phase);
    if (bucket) bucket.push(productId);
  }

  // -- containment: products -> their storey --
  for (const phase of phases) {
    const productIds = productIdsByPhase.get(phase) ?? [];
    const storeyId = storeyIds.get(phase);
    if (!storeyId || productIds.length === 0) continue;
    define(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE(${stepString(guidFor(`rel:contained:${phase}`))},${ref(ownerHistoryId)},$,$,(${productIds.map(ref).join(",")}),${ref(storeyId)})`,
    );
  }

  const header = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
    `FILE_NAME(${stepString(`${projectName}.ifc`)},${stepString(stamp.toISOString().replace(/\.\d{3}Z$/, ""))},('Exporter'),('ArchResidenceBD'),${stepString("ArchResidenceBD mesh exporter")},'ArchResidenceBD','');`,
    `FILE_SCHEMA(('IFC4'));`,
    "ENDSEC;",
    "DATA;",
  ].join("\n");

  return `${header}\n${lines.join("\n")}\nENDSEC;\nEND-ISO-10303-21;\n`;
}

// ---------------------------------------------------------------------------
// FreeCAD macro writer
// ---------------------------------------------------------------------------

/** The kinds whose IFC class the macro embeds for its optional ifcopenshell export. */
const MACRO_KINDS = [
  "column",
  "beam",
  "lintel",
  "grade-beam",
  "footing",
  "slab",
  "wall",
  "partition",
  "parapet",
  "spandrel",
  "door",
  "window",
  "stair",
  "railing",
  "tank",
  "canopy",
  "kitchen",
  "bath",
  "balcony",
  "excavation",
  "guard",
  "glass",
  "door_frame",
];

export function buildFreeCadMacro(doc: MeshDocument, meta: ExportMeta): string {
  const projectName = meta.projectName?.trim() || "ArchResidenceBD";
  const phases = orderedPhases(doc);
  const objects = doc.objects.map((object) => ({
    id: object.id,
    label: object.label,
    kind: object.kind,
    phase: object.phase || "other",
    min: object.bboxMinMm,
    max: object.bboxMaxMm,
    // The same palette the WebGL viewer uses (W2.8); rounded for a tidy macro.
    color: getColorForObject(object).map((channel) => Math.round(channel * 10000) / 10000),
  }));
  const phaseLabels: Record<string, string> = {};
  for (const phase of phases) phaseLabels[phase] = phaseStoreyName(phase);
  const classMap: Record<string, string> = {};
  for (const kind of MACRO_KINDS) classMap[kind] = ifcClassForKind(kind);

  const metaLines = [
    `    "projectName": ${JSON.stringify(projectName)},`,
    `    "stories": ${Number.isFinite(meta.stories) ? meta.stories : 0},`,
    `    "plotSize": ${Number.isFinite(meta.plotSize) ? meta.plotSize : 0},`,
    `    "plotUnit": ${JSON.stringify(meta.plotUnit || "m2")},`,
    `    "generatedAt": ${meta.generatedAt ? JSON.stringify(meta.generatedAt) : "None"},`,
  ].join("\n");

  return [
    "# -*- coding: utf-8 -*-",
    `"""ArchResidenceBD mesh rebuild macro - generated by src/cad/exporters.ts (W3).`,
    "",
    "Rebuilds the measured mesh as real Part geometry: one Part.makeBox per mesh object,",
    "grouped per phase in App::Part containers and coloured with the viewer palette.",
    "If the ifcopenshell add-on is installed it also writes a small IFC4 file; without it",
    "the macro still runs and only prints a notice.",
    '"""',
    "",
    "import json",
    "import os",
    "import re",
    "",
    "import FreeCAD as App",
    "import Part",
    "",
    `PROJECT_NAME = ${JSON.stringify(projectName)}`,
    "",
    "META = {",
    metaLines,
    "}",
    "",
    `PHASES = json.loads(${JSON.stringify(JSON.stringify(phases))})`,
    `PHASE_LABELS = json.loads(${JSON.stringify(JSON.stringify(phaseLabels))})`,
    `IFC_CLASSES = json.loads(${JSON.stringify(JSON.stringify(classMap))})`,
    "",
    `OBJECTS = json.loads(r"""${JSON.stringify(objects)}""")`,
    "",
    "",
    "def build():",
    '    """Rebuild the measured mesh as FreeCAD Part geometry."""',
    "    doc = App.newDocument(PROJECT_NAME)",
    "    groups = {}",
    "    for phase in PHASES:",
    '        group = doc.addObject("App::Part", "phase_" + re.sub(r"[^0-9A-Za-z_]", "_", phase))',
    "        group.Label = PHASE_LABELS.get(phase, phase)",
    "        groups[phase] = group",
    "",
    "    built = 0",
    "    skipped = 0",
    "    for spec in OBJECTS:",
    '        minimum = spec["min"]',
    '        maximum = spec["max"]',
    "        dx = maximum[0] - minimum[0]",
    "        dy = maximum[1] - minimum[1]",
    "        dz = maximum[2] - minimum[2]",
    "        if dx <= 0.0 or dy <= 0.0 or dz <= 0.0:",
    "            skipped += 1",
    "            continue",
    "        box = Part.makeBox(dx, dy, dz, App.Vector(minimum[0], minimum[1], minimum[2]))",
    '        name = "obj_" + re.sub(r"[^0-9A-Za-z_]", "_", spec["id"])',
    "        shape = Part.show(box, name)",
    '        shape.Label = spec["label"]',
    "        try:",
    '            shape.ViewObject.ShapeColor = tuple(spec["color"])',
    "        except Exception:",
    "            pass  # headless FreeCAD has no ViewObject",
    '        groups[spec["phase"]].addObject(shape)',
    "        built += 1",
    "",
    "    doc.recompute()",
    '    print("ArchResidenceBD macro: rebuilt %d solid(s) in %d phase group(s) %s (%d degenerate skipped)."',
    "          % (built, len(PHASES), PHASES, skipped))",
    '    print("Project %r: %d storey/stories declared, plot %s %s (generated %s)."',
    '          % (PROJECT_NAME, META["stories"], META["plotSize"], META["plotUnit"], META["generatedAt"]))',
    "    _export_ifc_if_available(doc)",
    "    return doc",
    "",
    "",
    "def _export_ifc_if_available(doc):",
    '    """Optional IFC4 export via ifcopenshell.api; skipped gracefully in vanilla FreeCAD."""',
    "    try:",
    "        import ifcopenshell  # noqa: F401",
    "        import ifcopenshell.api  # noqa: F401",
    "    except ImportError:",
    '        print("ifcopenshell is not installed; skipping the optional IFC export (the geometry above was built normally).")',
    "        return",
    "    try:",
    "        _export_ifc(doc)",
    "    except Exception as exc:",
    '        print("IFC export skipped: %s" % exc)',
    "",
    "",
    "def _export_ifc(doc):",
    "    from ifcopenshell.api import run",
    "",
    '    ifc = run("project.create_file", version="IFC4")',
    '    project = run("root.create_entity", ifc, ifc_class="IfcProject", name=PROJECT_NAME)',
    '    run("unit.assign_unit", ifc, length={"is_metric": True, "raw": "MILLI"})',
    "",
    '    model = run("context.add_context", ifc, context_type="Model")',
    '    body = run("context.add_context", ifc, context_type="Model",',
    '               context_identifier="Body", target_view="MODEL_VIEW", parent=model)',
    "",
    '    building = run("root.create_entity", ifc, ifc_class="IfcBuilding", name="Building")',
    '    run("aggregate.assign_object", ifc, relating_object=project, products=[building])',
    "",
    "    storeys = {}",
    "    for phase in PHASES:",
    '        storey = run("root.create_entity", ifc, ifc_class="IfcBuildingStorey",',
    "                     name=PHASE_LABELS.get(phase, phase))",
    '        run("aggregate.assign_object", ifc, relating_object=building, products=[storey])',
    "        storeys[phase] = storey",
    "",
    "    for spec in OBJECTS:",
    '        minimum = spec["min"]',
    '        maximum = spec["max"]',
    '        ifc_class = IFC_CLASSES.get(spec["kind"], "IfcBuildingElementProxy")',
    '        product = run("root.create_entity", ifc, ifc_class=ifc_class, name=spec["label"])',
    '        run("geometry.edit_object_placement", ifc, product=product, matrix=_placement(minimum))',
    '        run("spatial.assign_container", ifc, products=[product],',
    '            relating_structure=storeys[spec["phase"]])',
    "",
    "        dx = maximum[0] - minimum[0]",
    "        dy = maximum[1] - minimum[1]",
    "        dz = maximum[2] - minimum[2]",
    "        if dx <= 0.0 or dy <= 0.0 or dz <= 0.0:",
    "            continue",
    '        point = run("root.create_entity", ifc, ifc_class="IfcCartesianPoint",',
    "                    Coordinates=(0.0, 0.0, 0.0))",
    '        axis = run("root.create_entity", ifc, ifc_class="IfcAxis2Placement3D", Location=point)',
    '        profile = run("root.create_entity", ifc, ifc_class="IfcRectangleProfileDef",',
    '                      ProfileType="AREA", Position=axis, XDim=dx, YDim=dy)',
    '        direction = run("root.create_entity", ifc, ifc_class="IfcDirection",',
    "                        DirectionRatios=(0.0, 0.0, 1.0))",
    '        solid = run("root.create_entity", ifc, ifc_class="IfcExtrudedAreaSolid",',
    '                    SweptArea=profile, Position=axis, ExtrudedDirection=direction, Depth=dz)',
    '        representation = run("geometry.add_representation", ifc, context=body,',
    '                             items=[solid], representation_type="SweptSolid",',
    '                             representation_identifier="Body")',
    '        run("geometry.assign_representation", ifc, product=product, representation=representation)',
    "",
    '    out_path = os.path.join(os.path.dirname(doc.FileName) if doc.FileName else os.path.expanduser("~"),',
    '                           "%s.ifc" % PROJECT_NAME)',
    "    ifc.write(out_path)",
    '    print("IFC written to %s" % out_path)',
    "",
    "",
    "def _placement(origin):",
    '    """A 4x4 placement matrix at `origin` (nested lists; ifcopenshell accepts these)."""',
    "    return [[1.0, 0.0, 0.0, origin[0]],",
    "            [0.0, 1.0, 0.0, origin[1]],",
    "            [0.0, 0.0, 1.0, origin[2]],",
    "            [0.0, 0.0, 0.0, 1.0]]",
    "",
    "",
    "build()",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Strip every quoted string from a STEP text (keeping the quotes), so that the
 * structural checks below never misread labels that contain parentheses or #N.
 * Returns null when a string literal is unterminated.
 */
function stripStepStrings(text: string): string | null {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (!inString) {
      if (character === "'") {
        inString = true;
        out += "''";
      } else {
        out += character;
      }
    } else if (character === "'") {
      if (text[i + 1] === "'") {
        i += 1; // escaped apostrophe stays inside the string
      } else {
        inString = false;
      }
    }
  }
  return inString ? null : out;
}

/**
 * Structural validation of a hand-written IFC STEP file.
 * Returns a list of problems; an empty list means the file is structurally sound.
 */
export function validateIfcStep(ifcText: string): string[] {
  const problems: string[] = [];
  if (!ifcText || !ifcText.trim()) {
    problems.push("the file is empty");
    return problems;
  }
  const text = ifcText.replace(/\r\n?/g, "\n").trimStart();

  if (!/^ISO-10303-21;/.test(text)) {
    problems.push("the file does not start with ISO-10303-21;");
  }
  if (!/^HEADER;[\s\S]*?^DATA;/m.test(text)) {
    problems.push("HEADER and DATA sections are missing or out of order");
  }
  if (!/^ENDSEC;\nDATA;/m.test(text)) {
    problems.push("missing ENDSEC; after the header");
  }
  if (!/\nENDSEC;\nEND-ISO-10303-21;/.test(text)) {
    problems.push("missing the closing ENDSEC; + END-ISO-10303-21;");
  }

  const header = text.match(/^HEADER;([\s\S]*?)^ENDSEC;/m)?.[1] ?? "";
  if (!header.includes("FILE_DESCRIPTION")) problems.push("HEADER lacks FILE_DESCRIPTION");
  if (!header.includes("FILE_NAME")) problems.push("HEADER lacks FILE_NAME");
  if (!/FILE_SCHEMA\(\('IFC4'\)\)/.test(header)) {
    problems.push("HEADER FILE_SCHEMA is not (('IFC4'))");
  }

  const stripped = stripStepStrings(text);
  if (stripped === null) problems.push("an unterminated string literal was found");
  const safe = stripped ?? "";

  // Balanced parentheses.
  let depth = 0;
  for (const character of safe) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (depth < 0) {
      problems.push("a closing parenthesis has no matching opening parenthesis");
      depth = 0;
    }
  }
  if (depth !== 0) problems.push(`parentheses are unbalanced (${depth} unmatched)`);

  // Definitions, and strictly sequential line numbers.
  const definitions = new Map<number, string>();
  let lastDefined = 0;
  const definitionPattern = /^#(\d+)\s*=\s*(IFC[A-Z0-9_]*)/gm;
  let match: RegExpExecArray | null;
  while ((match = definitionPattern.exec(safe)) !== null) {
    const number = Number(match[1]);
    if (definitions.has(number)) problems.push(`#${number} is defined more than once`);
    definitions.set(number, match[2]);
    if (number !== lastDefined + 1) {
      problems.push(`definitions are not sequential: #${number} appears right after #${lastDefined}`);
    }
    lastDefined = number;
  }
  if (definitions.size === 0) problems.push("the DATA section contains no entity definitions");

  // Every reference resolves.
  const referencePattern = /#(\d+)(?![=0-9])/g;
  while ((match = referencePattern.exec(safe)) !== null) {
    const number = Number(match[1]);
    if (!definitions.has(number)) problems.push(`reference #${number} is never defined`);
  }

  // GUIDs: 22 characters from the IFC base-64 alphabet, first character 0-3.
  const guidPattern = /'([0-9A-Za-z_$]{22})'/g;
  const seenGuids = new Set<string>();
  while ((match = guidPattern.exec(text)) !== null) {
    const guid = match[1];
    if (!/^[0-3]/.test(guid)) {
      problems.push(`GUID "${guid}" does not start with 0-3 (malformed base-64 compression)`);
    }
    if (seenGuids.has(guid)) problems.push(`GUID "${guid}" is used more than once`);
    seenGuids.add(guid);
  }
  const nearMissPattern = /'([0-9A-Za-z_$]{21}|[0-9A-Za-z_$]{23})'/g;
  while ((match = nearMissPattern.exec(text)) !== null) {
    problems.push(`string "${match[1]}" looks like a malformed GUID (wrong length)`);
  }

  // Required entities.
  const required = [
    "IFCPERSON",
    "IFCORGANIZATION",
    "IFCPERSONANDORGANIZATION",
    "IFCAPPLICATION",
    "IFCOWNERHISTORY",
    "IFCSIUNIT",
    "IFCUNITASSIGNMENT",
    "IFCDIRECTION",
    "IFCCARTESIANPOINT",
    "IFCAXIS2PLACEMENT3D",
    "IFCGEOMETRICREPRESENTATIONCONTEXT",
    "IFCGEOMETRICREPRESENTATIONSUBCONTEXT",
    "IFCPROJECT",
    "IFCSITE",
    "IFCBUILDING",
    "IFCBUILDINGSTOREY",
    "IFCLOCALPLACEMENT",
    "IFCRECTANGLEPROFILEDEF",
    "IFCEXTRUDEDAREASOLID",
    "IFCSHAPEREPRESENTATION",
    "IFCPRODUCTDEFINITIONSHAPE",
    "IFCRELAGGREGATES",
    "IFCRELCONTAINEDINSPATIALSTRUCTURE",
  ];
  const definedNames = new Set(definitions.values());
  for (const entity of required) {
    if (!definedNames.has(entity)) problems.push(`required entity ${entity} is missing`);
  }

  // Millimetre length unit and a Body/SweptSolid representation.
  // Check the original text (not stripped) for these strings since they're inside quotes.
  if (!/IFCSIUNIT\(\s*\*?\s*,\s*\.LENGTHUNIT\.\s*,\s*\.MILLI\.\s*,\s*\.METRE\./.test(text)) {
    problems.push("no IfcSIUnit declares LENGTHUNIT in millimetres");
  }
  if (!/'Body'\s*,\s*'SweptSolid'/.test(text)) {
    problems.push("no Body/SweptSolid shape representation");
  }

  return problems;
}
