/**
 * Curated 2D floor-plan template library.
 *
 * Every entry is a real, visually verified architectural drawing stored in
 * `public/assets/floorplans/`. The unit category is the count that was actually read off the
 * drawing (see public/assets/floorplans/manifest.json), not the source page title.
 *
 * `presetId` links a 2D template to the parametric room geometry that builds its 3D model; it is
 * the 2D → 3D bridge used by the mesh generator (`src/cad/parametricBuildingGenerator.ts`).
 */

export type FloorplanCategory = "1-unit" | "2-unit" | "2+ unit";

export interface FloorPlanTemplate {
  /** Curated id, also the image filename stem. */
  id: string;
  title: string;
  titleBn?: string;
  /** Dwellings per floor as counted on the drawing. */
  unitsPerFloor: number;
  category: FloorplanCategory;
  /** Public path of the 2D drawing. */
  image: string;
  description: string;
  descriptionBn?: string;
  plotSizeRange?: string;
  features: string[];
  sourceUrl: string;
  /** Parametric preset that turns this 2D plan into a 3D model. */
  presetId: string;
}

const IMG = "/assets/floorplans";

export const FLOORPLAN_TEMPLATES: FloorPlanTemplate[] = [
  // ─────────────────────────── 1 unit per floor ───────────────────────────
  {
    id: "bd-1u-001",
    title: "1561 sqft south-face single unit, Uttara",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-001.jpg`,
    description: "Typical floor plan with furniture layout, one apartment per floor, lift and stair core on the road side.",
    plotSizeRange: "3.5–4.5 Katha",
    features: ["1 unit/floor", "Lift + stair core", "Verified drawing"],
    sourceUrl: "https://www.bdhousing.com/details/239531/1561-sft-south-face-single-unit-apt-uttara-dhaka-bangladesh",
    presetId: "preset-single-luxury",
  },
  {
    id: "bd-1u-002",
    title: "1575 sqft single unit, Bashundhara K-Block",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-002.jpg`,
    description: "Clean typical floor plan for a single dwelling with drawing-dining in the centre and bedrooms on three sides.",
    plotSizeRange: "4.0–5.0 Katha",
    features: ["1 unit/floor", "Typical floor plan", "Verified drawing"],
    sourceUrl: "https://pbazaar.com/en/1575-sft-ongoing-single-unit-apartmentflat-at-bashundhara-k-block",
    presetId: "preset-architect-villa",
  },
  {
    id: "bd-1u-004",
    title: "Single-family house, ground + first floor plans",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-004.png`,
    description: "Two-storey single dwelling: paired floor plans with car porch, living, kitchen and bedrooms.",
    features: ["1 unit/floor", "Two floor plans", "Car porch"],
    sourceUrl: "https://expertinteriorbd.com/modern-house-design-in-bangladesh/",
    presetId: "preset-duplex-courtyard",
  },
  {
    id: "bd-1u-006",
    title: "1-unit house plan on a 23×46 ft plot",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-006.png`,
    description: "Compact single-dwelling plan for a narrow plot: two bedrooms, living, kitchen and a straight stair.",
    plotSizeRange: "23 × 46 ft",
    features: ["1 unit/floor", "Narrow plot", "Verified drawing"],
    sourceUrl: "https://clarityarchitects.com/design/23x46_1_unit_floor_plan_dwg_residential_house_design/1490",
    presetId: "preset-family-duplex",
  },
  {
    id: "bd-1u-008",
    title: "2850 sqft 4-bed flat, Jolshiri Abashon",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-008.jpg`,
    description: "Typical floor plan of one large dwelling, four bedrooms around a central living-dining spine.",
    plotSizeRange: "4.0–5.0 Katha",
    features: ["1 unit/floor", "4 bedrooms", "Verified drawing"],
    sourceUrl: "https://www.facebook.com/homes71/posts/2850-sft-flat-for-sale-at-jolshiri-abashonclose-to-golf-lake-and-parksouth-facin/1549328493878574/",
    presetId: "preset-single-luxury",
  },
  {
    id: "bd-1u-009",
    title: "2170 sqft 4-bed single unit, Bashundhara R/A",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-009.jpg`,
    description: "7th & 8th floor plan of a single dwelling with three bedrooms, two toilets and a corner balcony.",
    plotSizeRange: "4.0–5.0 Katha",
    features: ["1 unit/floor", "3 bedrooms", "Verified drawing"],
    sourceUrl: "https://www.bdhousing.com/details/244466/bddl-shwapno-bilash-2170-sft-4-beds-under-construction-apartment-for-sale-at-bashundhara-r-a",
    presetId: "preset-architect-villa",
  },
  {
    id: "bd-1u-011",
    title: "Assure Tasneem 3-bed typical floor plan, Uttara",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-011.jpg`,
    description: "One apartment per floor with three bedrooms, two balconies and a dedicated lift lobby.",
    plotSizeRange: "4.5–5.5 Katha",
    features: ["1 unit/floor", "Lift lobby", "Verified drawing"],
    sourceUrl: "https://www.assuregroupbd.com/properties/assure-tasneem-uttara",
    presetId: "preset-family-duplex",
  },
  {
    id: "bd-1u-012",
    title: "Wahid Villa 2000 sqft typical floor plan",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-012.jpg`,
    description: "Single dwelling per floor with living, dining, three bedrooms and a service stair core.",
    plotSizeRange: "5.0–7.0 Katha",
    features: ["1 unit/floor", "2000 sqft", "Verified drawing"],
    sourceUrl: "http://www.fairfaceholdingsltd.com/projects/44",
    presetId: "preset-single-luxury",
  },
  {
    id: "bd-1u-017",
    title: "AutoCAD practice house plan sheet",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-017.jpg`,
    description: "Dimensioned ground floor plan of a single dwelling with elevation and door-window schedule.",
    features: ["1 unit/floor", "Dimensioned", "Elevation included"],
    sourceUrl: "https://www.facebook.com/civiltechtime/posts/-autocad-practice-drawing-house-planthis-autocad-practice-drawing-presents-a-wel/1371782311747114/",
    presetId: "preset-duplex-courtyard",
  },
  {
    id: "bd-1u-018",
    title: "Single-storey small house plan",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-018.jpg`,
    description: "One-storey single dwelling: two bedrooms, common bath, kitchen, living and an open side patio.",
    plotSizeRange: "1.5–3.0 Katha",
    features: ["1 unit/floor", "Single storey", "Open patio"],
    sourceUrl: "http://www.dwgnet.com/2016/01/single-story-small-house-plan-04/",
    presetId: "preset-architect-villa",
  },
  {
    id: "bd-1u-020",
    title: "Modern single-storey house, ground floor plan",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-020.png`,
    description: "Ground floor and top floor plans of one dwelling with central stair and bedrooms on both wings.",
    plotSizeRange: "3.0–5.0 Katha",
    features: ["1 unit/floor", "Two floor plans", "Verified drawing"],
    sourceUrl: "https://www.firstfloorplan.com/2020/02/single-unit-modern-house-plans.html",
    presetId: "preset-family-duplex",
  },
  {
    id: "bd-1u-021",
    title: "35'8\" × 42' ground floor plan, 4 bed",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-1u-021.jpg`,
    description: "Single dwelling on a 35'8\" × 42' footprint: four bedrooms, drawing-dining in the middle, stair at the front.",
    plotSizeRange: "35'8\" × 42'",
    features: ["1 unit/floor", "4 bedrooms", "Verified drawing"],
    sourceUrl: "https://fi.pinterest.com/pin/784400460129764209/",
    presetId: "preset-single-luxury",
  },
  {
    id: "bd-3u-017",
    title: "Type-A 1550 sqft, 1st–6th floor plan",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-3u-017.jpg`,
    description: "One flat per floor over six storeys, with parking on the ground floor and a shared lift-stair core.",
    plotSizeRange: "1550 sqft / floor",
    features: ["1 unit/floor", "6 storeys", "Verified drawing"],
    sourceUrl: "https://www.bdhousing.com/details/242106/1550-sqft-3-beds-under-construction-flats-for-sale-at-aftab-nagar",
    presetId: "preset-architect-villa",
  },
  {
    id: "bd-3u-020",
    title: "Single-unit plan from the Bangladesh design board",
    unitsPerFloor: 1,
    category: "1-unit",
    image: `${IMG}/bd-3u-020.jpg`,
    description: "Single dwelling floor plan with two bedrooms, drawing-dining, kitchen and a corner toilet block.",
    features: ["1 unit/floor", "Verified drawing"],
    sourceUrl: "https://www.pinterest.com/ideas/bangladesh-house-design-plan/935738105283/",
    presetId: "preset-duplex-courtyard",
  },

  // ─────────────────────────── 2 units per floor ───────────────────────────
  {
    id: "bd-1u-007",
    title: "Ground floor plan with two mirrored units",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-1u-007.jpg`,
    description: "Two mirrored flats per floor — each with its own kitchen, master bedroom and toilets — sharing a central entry.",
    features: ["2 units/floor", "Mirrored layout", "Verified drawing"],
    sourceUrl: "https://fi.pinterest.com/pin/241998179971973411/",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-001",
    title: "Two-unit village house, 50 × 40 ft",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-001.png`,
    description: "Symmetrical two-unit plan: four bedrooms in total, two dining spaces and a shared central stair.",
    plotSizeRange: "50 × 40 ft",
    features: ["2 units/floor", "4 bedrooms total", "Verified drawing"],
    sourceUrl: "https://www.firstfloorplan.com/2019/08/village-house-floor-plan-4-bedroom.html",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-005",
    title: "2-unit house plan, 40'1\" × 46'0\"",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-005.jpg`,
    description: "Dimensioned two-unit plan with three bedrooms per unit and a shared entry porch and stair.",
    plotSizeRange: "40'1\" × 46'0\"",
    features: ["2 units/floor", "3 bedrooms/unit", "Dimensioned"],
    sourceUrl: "https://www.facebook.com/cdz.bd/videos/2-unit-house-plan-/2650230328702918/",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-008",
    title: "2-unit apartment building, 80 × 75 ft",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-008.jpg`,
    description: "Typical floor plan of a two-flat apartment building with a central lift-stair core and dual balconies.",
    plotSizeRange: "80 × 75 ft",
    features: ["2 units/floor", "Lift core", "Verified drawing"],
    sourceUrl: "https://www.firstfloorplan.com/2020/04/2-unit-apartment-building-floor-plan.html",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-010",
    title: "Lucky Light House, Unit-A + Unit-B",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-010.jpg`,
    description: "Two compact flats (~850 sqft each) per floor with a shared lift and stair, built for a small Ibrahimpur plot.",
    plotSizeRange: "2.5–3.5 Katha",
    features: ["2 units/floor", "Compact flats", "Verified drawing"],
    sourceUrl: "https://www.bdhousing.com/details/243704/lucky-light-house-850-sqft-2-beds-ready-apartment-flats-for-sale-at-ibrahimpur",
    presetId: "preset-narrow-duct",
  },
  {
    id: "bd-2u-011",
    title: "Two mirrored 2-bed units with furniture",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-011.png`,
    description: "Two identical 2-bedroom units side by side, each with kitchen, dining, two verandahs and its own entry.",
    features: ["2 units/floor", "2 bedrooms/unit", "Furnished layout"],
    sourceUrl: "https://www.pinterest.com/ideas/2-unit-house-plans/950467667072/",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-015",
    title: "Two-unit ~1700 sqft plan",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-015.png`,
    description: "Paired two-bedroom units around a central stair, with kitchens and verandahs on the outer edges.",
    plotSizeRange: "~1700 sqft / floor",
    features: ["2 units/floor", "Central stair", "Verified drawing"],
    sourceUrl: "https://www.pinterest.com/pin/house-plan-of-1700-sq-ft--336855247138924269/",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-017",
    title: "Two-unit residential plan, Unit A / Unit B",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-017.jpg`,
    description: "Clean black-and-white plan: two units with two bedrooms, powder room, kitchen and living each.",
    features: ["2 units/floor", "2 bedrooms/unit", "Clean drawing"],
    sourceUrl: "https://www.dreamstime.com/detailed-floor-plan-modern-two-unit-residential-building-architectural-showing-layout-room-dimensions-image431689230",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-018",
    title: "40 × 40 ft two-unit floor plan",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-018.png`,
    description: "Typical plan on a 40 × 40 ft plot: two mirrored units, each with two bedrooms and a front verandah.",
    plotSizeRange: "40 × 40 ft",
    features: ["2 units/floor", "Mirrored layout", "Verified drawing"],
    sourceUrl: "https://clarityarchitects.com/design/40x40_2_unit_floor_plan_dwg_residential_building_design/1487",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-2u-019",
    title: "North-facing double-unit 2BHK, 33 × 58 ft",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-019.jpg`,
    description: "The same 2BHK repeated front and back with a shared stair core — the classic north-facing double unit.",
    plotSizeRange: "33 × 58 ft",
    features: ["2 units/floor", "2BHK each", "Dimensioned"],
    sourceUrl: "https://houseplans.world/items/house-plan-with-double-unit-2bhk-north-facing-home-plan/1564",
    presetId: "preset-narrow-duct",
  },
  {
    id: "bd-2u-020",
    title: "Two-unit residential building plan",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-2u-020.jpg`,
    description: "Two dwellings per floor around a central stair with separate front and rear entries.",
    features: ["2 units/floor", "Central stair", "Document render"],
    sourceUrl: "https://www.scribd.com/doc/256453102/Two-Unit-Residential-Building-Plan",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-3u-010",
    title: "Two 3BHK flats per floor",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-3u-010.jpg`,
    description: "CAD layout with two mirrored 3BHK flats and a shared lift-stair core in the middle.",
    features: ["2 units/floor", "3BHK each", "CAD drawing"],
    sourceUrl: "https://cadbull.com/detail/179857/3-BHK-Apartment-Layout-plan-AutoCAD-Drawing-Download-DWG-File",
    presetId: "preset-dual-3bed",
  },
  {
    id: "bd-3u-014",
    title: "Typical floor plan labelled 'Double Unit'",
    unitsPerFloor: 2,
    category: "2-unit",
    image: `${IMG}/bd-3u-014.jpg`,
    description: "Two units (Type A / Type B) around a central lift and stair, with verandahs on the road side.",
    plotSizeRange: "1310 sqft project",
    features: ["2 units/floor", "Type A + B", "Verified drawing"],
    sourceUrl: "https://www.bdhousing.com/details/240237/1310-sqft-3-beds-ready-apartment-flats-for-sale-at-bashundhara-r-a",
    presetId: "preset-dual-3bed",
  },

  // ─────────────────────────── 3+ units per floor ───────────────────────────
  {
    id: "bd-3u-002",
    title: "3300 sqft plan, Unit-A / B / C",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-002.jpg`,
    description: "Three labelled units around a single stair core on a 3300 sqft floor.",
    plotSizeRange: "3300 sqft / floor",
    features: ["3 units/floor", "Labelled units", "Verified drawing"],
    sourceUrl: "https://www.firstfloorplan.com/2019/06/small-2-bedroom-house-plans-and-designs.html",
    presetId: "preset-triple-rental",
  },
  {
    id: "bd-3u-004",
    title: "Three-unit floor plan",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-004.jpg`,
    description: "Three dwellings per floor, each with its own dining table and kitchen, served by one staircase.",
    features: ["3 units/floor", "Document render", "Verified drawing"],
    sourceUrl: "https://www.scribd.com/document/812491357/3-unit-floor-plan",
    presetId: "preset-triple-rental",
  },
  {
    id: "bd-3u-005",
    title: "3300 sqft three-unit plan (alternate rendering)",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-005.png`,
    description: "Colour rendering of the 3300 sqft three-unit layout — the same plan as bd-3u-002, easier to read.",
    plotSizeRange: "3300 sqft / floor",
    features: ["3 units/floor", "Colour layout", "Verified drawing"],
    sourceUrl: "https://www.firstfloorplan.com/2019/06/small-2-bedroom-house-plans-and-designs.html",
    presetId: "preset-triple-rental",
  },
  {
    id: "bd-3u-006",
    title: "Three-unit residential building layout",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-006.png`,
    description: "Wide floor plate split into three flats with a central lift and stair and a rear service corridor.",
    features: ["3 units/floor", "Central core", "Verified drawing"],
    sourceUrl: "https://clarityarchitects.com/design/residential_building_plan_3_unit_autocad_dwg/506",
    presetId: "preset-triple-rental",
  },
  {
    id: "bd-3u-012",
    title: "63' × 56' three-unit house plan",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-012.jpg`,
    description: "High-resolution drawing of three dwellings side by side, each with master bedroom, dining, kitchen and living.",
    plotSizeRange: "63 × 56 ft",
    features: ["3 units/floor", "High resolution", "Verified drawing"],
    sourceUrl: "https://rajmistriy.blogspot.com/2021/12/3unit-House-plan.html",
    presetId: "preset-triple-rental",
  },
  {
    id: "bd-3u-015",
    title: "Three-unit plan, Unit-01 / 02 / 03",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-015.png`,
    description: "Explicitly labelled three-unit floor with a shared lift-stair lobby and three separate kitchens.",
    features: ["3 units/floor", "Labelled units", "Verified drawing"],
    sourceUrl: "https://www.firstfloorplan.com/2019/07/3-unit-floor-plan.html",
    presetId: "preset-triple-rental",
  },
  {
    id: "bd-3u-016",
    title: "Four-flat first & second floor plan",
    unitsPerFloor: 4,
    category: "2+ unit",
    image: `${IMG}/bd-3u-016.jpg`,
    description: "Large floor plate with four dwellings, two stair cores, balconies on both ends and a rear road frontage.",
    plotSizeRange: "58 × 77 ft",
    features: ["4 units/floor", "Two stair cores", "Verified drawing"],
    sourceUrl: "https://in.pinterest.com/pin/3-unit-floor-plan--377317275048425947/",
    presetId: "preset-studio-bachelor",
  },
  {
    id: "bd-3u-018",
    title: "Furniture layout plan, flats A / B / C",
    unitsPerFloor: 3,
    category: "2+ unit",
    image: `${IMG}/bd-3u-018.jpg`,
    description: "Furnished residential building floor plan with three flats (A, B, C) around a central staircase.",
    features: ["3 units/floor", "Furnished layout", "Verified drawing"],
    sourceUrl: "https://www.facebook.com/groups/civilengineeringclassroom/posts/1813402285880810/",
    presetId: "preset-triple-rental",
  },
];

/** Category used for a dwellings-per-floor count. */
export function categoryForUnits(units: number): FloorplanCategory {
  if (units <= 1) return "1-unit";
  if (units === 2) return "2-unit";
  return "2+ unit";
}

/** Verified templates that match a dwellings-per-floor count. */
export function templatesForUnits(units: number): FloorPlanTemplate[] {
  const category = categoryForUnits(units);
  return FLOORPLAN_TEMPLATES.filter((t) => t.category === category);
}

export function getTemplate(id: string | null | undefined): FloorPlanTemplate | null {
  if (!id) return null;
  return FLOORPLAN_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** Presets that can stand in when a category has no verified drawing. */
export function fallbackPresetForUnits(units: number): string {
  if (units <= 1) return "preset-single-luxury";
  if (units === 2) return "preset-dual-3bed";
  if (units === 3) return "preset-triple-rental";
  return "preset-studio-bachelor";
}
