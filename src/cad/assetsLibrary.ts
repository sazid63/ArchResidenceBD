/**
 * ArchResidenceBD Architectural Asset Library
 * Pre-engineered 3D Parametric Components for Bangladeshi Residential Buildings.
 * Compliant with BNBC 2020 Part 3 (General Building Requirements) & RAJUK 2008.
 */

import { MeshObject } from "./mesh";
import { createBoxMesh } from "./parametricBuildingGenerator";

export interface ArchitecturalAsset {
  id: string;
  nameEn: string;
  nameBn: string;
  category: "doors" | "windows" | "stairs" | "balconies" | "kitchen" | "bathroom" | "structural";
  dimensionsMm: [number, number, number]; // W, D, H
  descriptionEn: string;
  descriptionBn: string;
  material: string;
  provenanceRepo?: string;
  ifcClass?: string;
  generateMesh: (
    baseId: string,
    x: number,
    y: number,
    z: number,
    phase: string,
  ) => MeshObject[];
}

export const ARCHITECTURAL_ASSETS: ArchitecturalAsset[] = [
  // ==========================================
  // DOORS
  // ==========================================
  {
    id: "door-main-teak",
    nameEn: "Main Entrance Teak Wood Door",
    nameBn: "প্রধান প্রবেশদ্বার সেগুন কাঠের দরজা",
    category: "doors",
    dimensionsMm: [1000, 125, 2100],
    descriptionEn: "1000mm x 2100mm Solid Teak/Chittagong Silkoroi main entrance door with 125mm heavy wooden frame and brass hardware.",
    descriptionBn: "১০০০মিমি × ২১০০মিমি সেগুন কাঠের প্রধান প্রবেশদ্বার। সলিড ফ্রেম ও ডেকোরেটিভ ডিজাইন সংবলিত।",
    material: "Teak Wood / Mahogany",
    generateMesh: (baseId, x, y, z, phase) => {
      const w = 1000;
      const d = 125;
      const h = 2100;
      return [
        // Outer Wooden Frame Left
        createBoxMesh(`${baseId}_frame_l`, "Main Door Frame (Left)", "door", phase, x, y, z, x + 75, y + d, z + h),
        // Outer Wooden Frame Right
        createBoxMesh(`${baseId}_frame_r`, "Main Door Frame (Right)", "door", phase, x + w - 75, y, z, x + w, y + d, z + h),
        // Outer Wooden Frame Top Lintel
        createBoxMesh(`${baseId}_frame_t`, "Main Door Top Lintel Frame", "door", phase, x, y, z + h - 75, x + w, y + d, z + h),
        // Solid Door Panel
        createBoxMesh(`${baseId}_panel`, "Teak Wood Solid Door Panel", "door", phase, x + 75, y + 25, z, x + w - 75, y + 75, z + h - 75),
        // Metallic Brass Handle
        createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "railing", phase, x + w - 150, y + 75, z + 1000, x + w - 120, y + 110, z + 1150),
      ];
    },
  },
  {
    id: "door-glass-sliding",
    nameEn: "Balcony Aluminum Glass Sliding Door",
    nameBn: "বারান্দার অ্যালুমিনিয়াম গ্লাস স্লাইডিং ডোর",
    category: "doors",
    dimensionsMm: [1800, 100, 2100],
    descriptionEn: "1800mm x 2100mm 2-track aluminum sliding glass door with 6mm clear tempered glass panes for balconies.",
    descriptionBn: "১৮০০মিমি × ২১০০মিমি ২-ট্র্যাক অ্যালুমিনিয়াম স্লাইডিং গ্লাস ডোর। পর্যাপ্ত আলো-বাতাস চলাচলের উপযোগী।",
    material: "Powder Coated Aluminum & Tempered Glass",
    generateMesh: (baseId, x, y, z, phase) => {
      const w = 1800;
      const d = 100;
      const h = 2100;
      return [
        // Aluminum Outer Surround Frame
        createBoxMesh(`${baseId}_frame_l`, "Sliding Door Frame (Left)", "door", phase, x, y, z, x + 50, y + d, z + h),
        createBoxMesh(`${baseId}_frame_r`, "Sliding Door Frame (Right)", "door", phase, x + w - 50, y, z, x + w, y + d, z + h),
        createBoxMesh(`${baseId}_frame_t`, "Sliding Door Frame (Top)", "door", phase, x, y, z + h - 50, x + w, y + d, z + h),
        // Glass Panel 1 (Left Sliding Leaf)
        createBoxMesh(`${baseId}_glass_1`, "Glass Sliding Leaf Left", "railing", phase, x + 50, y + 20, z + 50, x + w / 2 + 25, y + 45, z + h - 50),
        // Glass Panel 2 (Right Sliding Leaf)
        createBoxMesh(`${baseId}_glass_2`, "Glass Sliding Leaf Right", "railing", phase, x + w / 2 - 25, y + 55, z + 50, x + w - 50, y + 80, z + h - 50),
      ];
    },
  },

  // ==========================================
  // WINDOWS
  // ==========================================
  {
    id: "win-sliding-std",
    nameEn: "Standard 2-Panel Aluminum Sliding Window",
    nameBn: "মানসম্মত ২-প্যানেল অ্যালুমিনিয়াম স্লাইডিং জানালা",
    category: "windows",
    dimensionsMm: [1500, 100, 1200],
    descriptionEn: "1500mm W x 1200mm H 2-panel aluminum sliding window with frosted/tinted glass and mosquito mesh track.",
    descriptionBn: "১৫০০মিমি × ১২০০মিমি অ্যালুমিনিয়াম স্লাইডিং জানালা। থাই সেকশন ও গ্লাস সংবলিত।",
    material: "Aluminum Thai Section & 5mm Tinted Glass",
    generateMesh: (baseId, x, y, z, phase) => {
      const w = 1500;
      const d = 100;
      const h = 1200;
      return [
        // Concrete Window Sill (100mm thick)
        createBoxMesh(`${baseId}_sill`, "Concrete Window Sill", "slab", phase, x - 50, y - 20, z - 75, x + w + 50, y + d + 20, z),
        // Aluminum Outer Channel Frame
        createBoxMesh(`${baseId}_frame_l`, "Window Channel Left", "wall", phase, x, y, z, x + 40, y + d, z + h),
        createBoxMesh(`${baseId}_frame_r`, "Window Channel Right", "wall", phase, x + w - 40, y, z, x + w, y + d, z + h),
        createBoxMesh(`${baseId}_frame_t`, "Window Channel Top", "wall", phase, x, y, z + h - 40, x + w, y + d, z + h),
        // Tinted Glass Panes
        createBoxMesh(`${baseId}_pane_1`, "Left Window Glass Pane", "railing", phase, x + 40, y + 25, z + 40, x + w / 2 + 15, y + 45, z + h - 40),
        createBoxMesh(`${baseId}_pane_2`, "Right Window Glass Pane", "railing", phase, x + w / 2 - 15, y + 55, z + 40, x + w - 40, y + 75, z + h - 40),
      ];
    },
  },
  {
    id: "win-toilet-louvre",
    nameEn: "Bathroom Frosted Louver Ventilator",
    nameBn: "বাথরুমের ফ্রস্টেড গ্লাস লুভার ভেন্টিলেটর",
    category: "windows",
    dimensionsMm: [600, 75, 600],
    descriptionEn: "600mm x 600mm adjustable frosted glass louvered ventilator window for toilets and bath spaces.",
    descriptionBn: "৬০০মিমি × ৩০০মিমি বাথরুমের প্রফেশনাল গ্লাস ভেন্টিলেটর। এক্সজস্ট ফ্যান সুবিধা সহ।",
    material: "Aluminum & 6mm Frosted Glass Louvers",
    generateMesh: (baseId, x, y, z, phase) => {
      const w = 600;
      const d = 75;
      const h = 600;
      return [
        // Outer Frame
        createBoxMesh(`${baseId}_frame`, "Ventilator Frame", "wall", phase, x, y, z, x + w, y + d, z + h),
        // 3 Glass Louver Blades
        createBoxMesh(`${baseId}_blade_1`, "Louver Blade 1", "railing", phase, x + 20, y + 20, z + 100, x + w - 20, y + d - 20, z + 120),
        createBoxMesh(`${baseId}_blade_2`, "Louver Blade 2", "railing", phase, x + 20, y + 20, z + 280, x + w - 20, y + d - 20, z + 300),
        createBoxMesh(`${baseId}_blade_3`, "Louver Blade 3", "railing", phase, x + 20, y + 20, z + 460, x + w - 20, y + d - 20, z + 480),
      ];
    },
  },

  // ==========================================
  // STAIRCASES
  // ==========================================
  {
    id: "stair-doglegged-rcc",
    nameEn: "BNBC Standard RCC Doglegged Staircase",
    nameBn: "বিএনবিসি স্ট্যান্ডার্ড আরসিসি ডগ-লেগড সিঁড়ি",
    category: "stairs",
    dimensionsMm: [2400, 4800, 3000],
    descriptionEn: "1000mm clear width double-flight doglegged RCC stair assembly with 150mm risers, 250mm treads, and 1200mm landing slab.",
    descriptionBn: "২৪০০মিমি × ৪৮০০মিমি আরসিসি ডগ-লেগড সিঁড়ি। ১৫মিমি রাইজার, ২৫০মিমি ট্রেড ও হ্যান্ডরেইল সংবলিত।",
    material: "Reinforced Cast Concrete & Steel Handrail",
    generateMesh: (baseId, x, y, z, phase) => {
      const flightW = 1000;
      const risers = 10;
      const riserH = 150;
      const treadD = 250;
      const landingD = 1200;
      const objects: MeshObject[] = [];

      // Flight 1 Steps (Rising 0 to 1500mm)
      for (let i = 0; i < risers; i++) {
        objects.push(
          createBoxMesh(
            `${baseId}_f1_step_${i + 1}`,
            `Flight 1 Step ${i + 1}`,
            "stair",
            phase,
            x,
            y + i * treadD,
            z + i * riserH,
            x + flightW,
            y + (i + 1) * treadD,
            z + (i + 1) * riserH,
          ),
        );
      }

      // Mid Landing Slab (1200mm x 2400mm at Z = 1500mm)
      objects.push(
        createBoxMesh(
          `${baseId}_landing`,
          "Mid-Landing RCC Slab",
          "slab",
          phase,
          x,
          y + risers * treadD,
          z + 1500 - 125,
          x + flightW * 2 + 400,
          y + risers * treadD + landingD,
          z + 1500,
        ),
      );

      // Flight 2 Steps (Rising 1500mm to 3000mm returning)
      for (let i = 0; i < risers; i++) {
        const stepY = y + risers * treadD - (i + 1) * treadD;
        objects.push(
          createBoxMesh(
            `${baseId}_f2_step_${i + 1}`,
            `Flight 2 Step ${i + 1}`,
            "stair",
            phase,
            x + flightW + 200,
            stepY,
            z + 1500 + i * riserH,
            x + flightW * 2 + 200,
            stepY + treadD,
            z + 1500 + (i + 1) * riserH,
          ),
        );
      }

      // Stainless Steel Handrail along stair well
      objects.push(
        createBoxMesh(
          `${baseId}_handrail_1`,
          "Flight 1 Handrail",
          "railing",
          phase,
          x + flightW,
          y,
          z + 900,
          x + flightW + 40,
          y + risers * treadD + landingD,
          z + 1500 + 900,
        ),
      );

      return objects;
    },
  },

  // ==========================================
  // BALCONIES
  // ==========================================
  {
    id: "balcony-glass-cantilever",
    nameEn: "Modern Tempered Glass Cantilever Balcony",
    nameBn: "আধুনিক টেম্পার্ড গ্লাস ক্যান্টিলিভার বারান্দা",
    category: "balconies",
    dimensionsMm: [3600, 1400, 1000],
    descriptionEn: "1400mm cantilever projecting RCC slab with 12mm clear tempered glass paneling and 316 stainless steel top cap handrail.",
    descriptionBn: "১৪০০মিমি প্রক্ষেপিত আরসিসি স্ল্যাব ও টেম্পার্ড গ্লাস সেফটি রেলিং সংবলিত মডার্ন ব্যালকনি।",
    material: "RCC Slab & 12mm Tempered Glass SS 316 Railing",
    generateMesh: (baseId, x, y, z, phase) => {
      const w = 3600;
      const d = 1400;
      return [
        // Cantilever RCC Slab (125mm)
        createBoxMesh(`${baseId}_slab`, "Cantilever Balcony Slab", "balcony", phase, x, y, z, x + w, y + d, z + 125),
        // Front Glass Panel Railing (900mm high)
        createBoxMesh(`${baseId}_glass_front`, "Front Glass Railing Panel", "railing", phase, x, y + d - 50, z + 125, x + w, y + d, z + 125 + 900),
        // SS Top Cap Handrail Tube
        createBoxMesh(`${baseId}_ss_cap`, "SS 316 Top Cap Rail", "railing", phase, x - 20, y + d - 60, z + 125 + 900, x + w + 20, y + d + 10, z + 125 + 950),
        // Left Glass Return
        createBoxMesh(`${baseId}_glass_left`, "Left Railing Return", "railing", phase, x, y, z + 125, x + 50, y + d, z + 125 + 900),
        // Right Glass Return
        createBoxMesh(`${baseId}_glass_right`, "Right Railing Return", "railing", phase, x + w - 50, y, z + 125, x + w, y + d, z + 125 + 900),
      ];
    },
  },

  // ==========================================
  // KITCHEN
  // ==========================================
  {
    id: "kitchen-l-counter-slab",
    nameEn: "L-Shaped RCC Kitchen Counter Base Slab",
    nameBn: "এল-আকৃতির আরসিসি কিচেন কাউন্টার স্ল্যাব",
    category: "kitchen",
    dimensionsMm: [2400, 1800, 850],
    descriptionEn: "850mm high L-shaped 75mm RCC counter slab with granite top finish, 600mm depth, stainless steel sink cutout, and gas burner alcove.",
    descriptionBn: "৮৫০মিমি উচ্চতার এল-আকৃতির কিচেন কাউন্টার স্ল্যাব। সিঙ্ক এবং গ্যাস স্টোভের উন্মুক্ত অংশ সহ।",
    material: "75mm Cast RCC & Polished Granite Top",
    generateMesh: (baseId, x, y, z, phase) => {
      return [
        // Main Counter Leg 1 (2400mm along X)
        createBoxMesh(`${baseId}_leg1`, "Kitchen Counter Slab Main", "slab", phase, x, y, z + 775, x + 2400, y + 600, z + 850),
        // Counter Leg 2 (L-Return 1800mm along Y)
        createBoxMesh(`${baseId}_leg2`, "Kitchen Counter Slab L-Return", "slab", phase, x, y + 600, z + 775, x + 600, y + 1800, z + 850),
        // Counter Brick Support Wall
        createBoxMesh(`${baseId}_support1`, "Counter Brick Support Wall 1", "wall", phase, x + 50, y + 50, z, x + 150, y + 550, z + 775),
        createBoxMesh(`${baseId}_support2`, "Counter Brick Support Wall 2", "wall", phase, x + 2250, y + 50, z, x + 2350, y + 550, z + 775),
        // Backsplash Tile Margin (150mm upstand)
        createBoxMesh(`${baseId}_backsplash`, "Granite Backsplash Upstand", "wall", phase, x, y + 580, z + 850, x + 2400, y + 600, z + 1000),
      ];
    },
  },

  // ==========================================
  // BATHROOM
  // ==========================================
  {
    id: "bath-sunken-pipe-shaft",
    nameEn: "Sunken RCC Bathroom Base & Plumbing Shaft",
    nameBn: "সানকেন আরসিসি বাথরুম স্ল্যাব ও প্লাম্বিং শ্যাফট",
    category: "bathroom",
    dimensionsMm: [2100, 1500, 150],
    descriptionEn: "150mm RCC sunken slab drop for concealed P-traps, water inlet/drainage slope, 100mm threshold curb, and vertical pipe chase duct.",
    descriptionBn: "১৫০মিমি সানকেন স্ল্যাব ড্রপ। বাথরুম প্লাম্বিং, স্যানিটারি ফিটিংস এবং কনসিল্ড ড্রেনেজ ঢালের জন্য আদর্শ।",
    material: "Waterproofed Sunken RCC Slab & Masonry Duct",
    provenanceRepo: "buildingSMART/Sample-Test-Files",
    ifcClass: "IfcSanitaryTerminal",
    generateMesh: (baseId, x, y, z, phase) => {
      return [
        // Sunken Floor Basin Recess (-150mm drop)
        createBoxMesh(`${baseId}_recess`, "Bathroom Sunken Floor Basin", "slab", phase, x + 50, y + 50, z - 150, x + 2050, y + 1450, z),
        // Entry Threshold Water Stop Curb (100mm high)
        createBoxMesh(`${baseId}_curb`, "Bathroom Threshold Water Stop Curb", "wall", phase, x, y, z, x + 2100, y + 125, z + 100),
        // Vertical MEP Pipe Shaft Duct
        createBoxMesh(`${baseId}_shaft`, "MEP Plumbing Riser Pipe Duct", "wall", phase, x + 1600, y + 1000, z, x + 2050, y + 1450, z + 2800),
      ];
    },
  },

  // ==========================================
  // OPEN SOURCE STRUCTURAL & BIM ASSETS
  // ==========================================
  {
    id: "struct-ifc-column-c30",
    nameEn: "IfcColumn: 350x350 High-Strength RCC Column Profile",
    nameBn: "আইএফসি স্ট্যান্ডার্ড কলাম: ৩৫০মিমি হাই-স্ট্রেন্থ আরসিসি কলাম",
    category: "structural",
    dimensionsMm: [350, 350, 3000],
    descriptionEn: "350mm x 350mm C30/37 RCC column profile with 8x20mm Grade-60 longitudinal rebar and 10mm lateral ties @ 150mm c/c.",
    descriptionBn: "৩৫০মিমি × ৩৫০মিমি আরসিসি কলাম প্রফাইল। ৮টি ২০মিমি প্রধান রড ও ১০মিমি কলাম টাই সংবলিত।",
    material: "C30 Concrete & B500D Rebar",
    provenanceRepo: "buildingSMART/Sample-Test-Files",
    ifcClass: "IfcColumn",
    generateMesh: (baseId, x, y, z, phase) => {
      return [
        createBoxMesh(`${baseId}_core`, "IfcColumn Solid Core", "column", phase, x, y, z, x + 350, y + 350, z + 3000),
        createBoxMesh(`${baseId}_cap_top`, "Column Capital Lintel Tie", "beam", phase, x - 25, y - 25, z + 2850, x + 375, y + 375, z + 3000),
      ];
    },
  },
  {
    id: "stair-freecad-spiral-escape",
    nameEn: "FreeCAD Library: Steel Spiral Fire Escape Staircase",
    nameBn: "ফ্রিক্যাড লাইব্রেরি: স্পাইরাল স্টিল ফায়ার এস্কেপ সিঁড়ি",
    category: "stairs",
    dimensionsMm: [1800, 1800, 3000],
    descriptionEn: "1800mm diameter helical steel fire exit stair assembly with central column pipe, checkered tread plates, and perimeter safety guardrail.",
    descriptionBn: "১৮০০মিমি ব্যাসের স্পাইরাল আরসিও স্টেইনলেস স্টিল ইমার্জেন্সি সিঁড়ি। ফায়ার এস্কেপ নর্মস অনুসৃত।",
    material: "Galvanized Structural Steel",
    provenanceRepo: "FreeCAD/FreeCAD-library",
    ifcClass: "IfcStair",
    generateMesh: (baseId, x, y, z, phase) => {
      const objects = [];
      // Central Steel Column Pipe
      objects.push(createBoxMesh(`${baseId}_pipe`, "Spiral Center Steel Column", "column", phase, x + 825, y + 825, z, x + 975, y + 975, z + 3000));
      // Helical Treads (12 Steps)
      for (let i = 0; i < 12; i++) {
        const angleZ = z + i * 250;
        objects.push(
          createBoxMesh(
            `${baseId}_step_${i + 1}`,
            `Spiral Tread ${i + 1}`,
            "stair",
            phase,
            x + 300,
            y + 800 + (i % 2 === 0 ? 0 : 100),
            angleZ,
            x + 1500,
            y + 1000 + (i % 2 === 0 ? 0 : 100),
            angleZ + 50,
          ),
        );
      }
      return objects;
    },
  },
  {
    id: "louver-ladybug-solar-shading",
    nameEn: "Ladybug Tools: Motorized Louver Solar Shading Array",
    nameBn: "লেডিবাগ টুলস: সোলার শেডিং মটরাইজড ল্যুভার অ্যারে",
    category: "windows",
    dimensionsMm: [2400, 200, 1500],
    descriptionEn: "2400mm x 1500mm exterior horizontal aluminum shading louver system engineered for daylight optimization and heat gain reduction.",
    descriptionBn: "২৪০০মিমি × ১৫০০মিমি এক্সটেরিয়র অ্যালুমিনিয়াম সোলার শেডিং ব্রাইজ-সোলেইল সিস্টেম।",
    material: "Extruded Aluminum & Servo Actuators",
    provenanceRepo: "ladybug-tools/3d-models",
    ifcClass: "IfcShadingDevice",
    generateMesh: (baseId, x, y, z, phase) => {
      const objects = [];
      for (let i = 0; i < 6; i++) {
        objects.push(
          createBoxMesh(
            `${baseId}_blade_${i + 1}`,
            `Solar Louver Blade ${i + 1}`,
            "railing",
            phase,
            x,
            y,
            z + i * 250,
            x + 2400,
            y + 200,
            z + i * 250 + 40,
          ),
        );
      }
      return objects;
    },
  },
];
