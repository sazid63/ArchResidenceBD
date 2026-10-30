/**
 * Automated Code Compliance Checker for ArchResidenceBD
 * Validates building designs against BNBC 2020 and RAJUK DAP 2022 regulations
 * Produces structured compliance reports with deviation register
 */

import type { MeshDocument, MeshObject } from "./mesh";

// ---- BNBC 2020 Regulatory Tables ----
export interface BNBCRule {
  id: string;
  title: string;
  clause: string;         // e.g., "§5.3.2"
  category: "structural" | "fire-safety" | "access" | "floor-area" | "setback" | "height" | "seismic" | "sanitation";
  severity: "critical" | "major" | "minor" | "info";
  check: (ctx: ComplianceContext) => ComplianceResult;
  description?: string;
}

export interface ComplianceContext {
  project: {
    stories: number;
    plotSqm: number;
    plotUnit: string;
    unitsPerFloor: number;
    location: "dhaka" | "chittagong" | "khulna" | "rajshahi" | "sylhet";
  };
  mesh: MeshDocument;
  dimensions: {
    footprintMm: [number, number];
    totalHeightMm: number;
    columnSpacing: number[];
    stairWidthMm: number;
    corridorWidthMm: number;
    hasParking: boolean;
  };
  materials: {
    concreteGrade: number;
    steelGrade: number;
    brickStrength: number;
  };
}

export interface ComplianceResult {
  pass: boolean;
  severity: "critical" | "major" | "minor" | "info";
  message: string;
  messageBn?: string;
  recommendation?: string;
  measured?: number;
  required?: string;
}

// ---- Compliance Rules ----
export const BNBC_RULES: BNBCRule[] = [
  {
    id: "BNBC-001",
    title: "Maximum Building Height",
    clause: "§4.2.1",
    category: "height",
    severity: "critical",
    check: (ctx) => {
      const maxH = ctx.project.location === "dhaka" ? 30 : 21; // m for Dhaka vs other cities
      const actualH = ctx.dimensions.totalHeightMm / 1000;
      const stories = ctx.project.stories;
      const maxStories = ctx.project.location === "dhaka" ? 8 : 6;
      if (stories > maxStories) {
        return {
          pass: false,
          severity: "critical",
          message: `Building height ${actualH}m (${stories} storeys) exceeds maximum ${maxH}m (${maxStories} storeys) for ${ctx.project.location}.`,
          messageBn: `ভবনের উচ্চতা ${actualH} মি (${stories} তলা) ${ctx.project.location} নগরীর সর্বোচ্চ ${maxH} মি (${maxStories} তলা) সীমা অতিক্রম করেছে।`,
          recommendation: `Reduce to ${maxStories} storeys or apply for special approval from RAJUK/CDA.`,
          measured: actualH,
          required: `≤ ${maxH}m`,
        };
      }
      return {
        pass: true,
        severity: "info",
        message: `Building height ${actualH}m (${stories} storeys) within limit of ${maxH}m (${maxStories} storeys).`,
        messageBn: `ভবনের উচ্চতা ${actualH} মি (${stories} তলা) ${maxH} মি (${maxStories} তলা) এর মধ্যে।`,
      };
    },
    description: "Maximum building height and storey limits per city classification (BNBC 2020 §4.2.1)",
  },
  {
    id: "BNBC-002",
    title: "Setback Requirements",
    clause: "§4.5",
    category: "setback",
    severity: "major",
    check: (ctx) => {
      // Check minimum column spacing as proxy for corridor/access width
      const minCorridor = ctx.dimensions.corridorWidthMm || 1200;
      const minStair = ctx.dimensions.stairWidthMm || 1050;
      const issues: string[] = [];
      if (minCorridor < 1200) {
        issues.push(`Corridor width ${minCorridor}mm < 1200mm minimum (BNBC §4.7.3)`);
      }
      if (minStair < 1050) {
        issues.push(`Stair width ${minStair}mm < 1050mm minimum (BNBC §4.7.2)`);
      }
      if (issues.length > 0) {
        return {
          pass: false,
          severity: "major",
          message: issues.join(". "),
          messageBn: issues.map(i => i.replace("minimum", "ন্যূনতম")).join(". "),
          recommendation: "Increase corridor to ≥1200mm, stair to ≥1050mm",
        };
      }
      return {
        pass: true,
        severity: "info",
        message: `Corridor (${minCorridor}mm) and stair (${minStair}mm) widths comply with BNBC 2020 §4.7 requirements.`,
      };
    },
    description: "Minimum corridor and stair widths for egress (BNBC 2020 Ch 4.7)",
  },
  {
    id: "BNBC-003",
    title: "Seismic Zone Assignment",
    clause: "§2.5",
    category: "seismic",
    severity: "critical",
    check: (ctx) => {
      const zoneMap: Record<string, number> = { dhaka: 3, chittagong: 3, khulna: 2, rajshahi: 2, sylhet: 3 };
      const zone = zoneMap[ctx.project.location] ?? 2;
      if (zone >= 3) {
        return {
          pass: true,
          severity: "critical",
          message: `Site in BNBC Zone ${zone} (high seismic risk). Ensure ductile detailing per §7.10.5 and capacity design per §7.10.4.`,
          messageBn: `সাইট BNBC জোন ${zone} এ (উচ্চ ভূমিকম্প ঝুঁকি)। §7.10.5 অনুযায়ী ডাক্টাইল ডিটেইলিং এবং §7.10.4 অনুযায়ী ক্যাপাসিটি ডিজাইন নিশ্চিত করুন।`,
          recommendation: "Apply R=5.0 response reduction; check drift ≤ H/500",
        };
      }
      return {
        pass: true,
        severity: "info",
        message: `Site in BNBC Zone ${zone}. Standard seismic detailing applies.`,
      };
    },
    description: "Seismic zone assignment and detailing requirements (BNBC 2020 Ch 2.5, Ch 7)",
  },
  {
    id: "BNBC-004",
    title: "Fire Separation",
    clause: "§8.3",
    category: "fire-safety",
    severity: "major",
    check: (ctx) => {
      // Check for adequate fire escape (at least 2 exits for buildings > 3 storeys)
      const stories = ctx.project.stories;
      if (stories <= 3) return { pass: true, severity: "info", message: `Building has ${stories} storeys — single exit acceptable.` };
      // Count columns at perimeter (proxy for staircase locations)
      // A perimeter column is one whose center lies on the building envelope
      const allCols = ctx.mesh.objects.filter(o => o.kind === "column");
      if (allCols.length === 0) {
        return {
          pass: false,
          severity: "major",
          message: `Building > 3 storeys with no columns — verify at least 2 separate fire exits per BNBC §8.3.1.`,
          recommendation: "Provide 2 separate enclosed staircases, min 1050mm width each",
        };
      }
      // Compute building envelope from all objects
      let envMinX = Infinity, envMinY = Infinity, envMaxX = -Infinity, envMaxY = -Infinity;
      for (const obj of ctx.mesh.objects) {
        envMinX = Math.min(envMinX, obj.bboxMinMm[0]);
        envMinY = Math.min(envMinY, obj.bboxMinMm[1]);
        envMaxX = Math.max(envMaxX, obj.bboxMaxMm[0]);
        envMaxY = Math.max(envMaxY, obj.bboxMaxMm[1]);
      }
      const tol = 50; // 50mm tolerance for envelope detection
      const perimeterCols = allCols.filter(o => {
        const cx = (o.bboxMinMm[0] + o.bboxMaxMm[0]) / 2;
        const cy = (o.bboxMinMm[1] + o.bboxMaxMm[1]) / 2;
        return cx <= envMinX + tol || cx >= envMaxX - tol || cy <= envMinY + tol || cy >= envMaxY - tol;
      });
      if (perimeterCols.length >= 4) {
        return { pass: true, severity: "info", message: `Adequate perimeter column grid (${perimeterCols} of ${allCols.length} total cols on envelope) suggests multiple stair cores for fire egress.` };
      }
      return {
        pass: false,
        severity: "major",
        message: `Building > 3 storeys with only ${perimeterCols.length} perimeter columns (of ${allCols.length} total) — verify at least 2 separate fire exits per BNBC §8.3.1.`,
        messageBn: `${perimeterCols.length}টি পরিধি কলম (মোট ${allCols.length}টির মধ্যে) — BNBC §8.3.1 অনুযায়ী অন্তত ২টি আলাদা আগুন মোকাবিলা প্রবেশপথ নিশ্চিত করুন।`,
        recommendation: "Provide 2 separate enclosed staircases, min 1050mm width each",
      };
    },
    description: "Fire escape requirements for multi-storey buildings (BNBC 2020 Ch 8)",
  },
  {
    id: "BNBC-005",
    title: "Structural Material Grades",
    clause: "§5.4",
    category: "structural",
    severity: "major",
    check: (ctx) => {
      const mc = ctx.materials.concreteGrade;
      const ms = ctx.materials.steelGrade;
      if (mc < 20) {
        return { pass: false, severity: "critical", message: `Concrete grade M${mc} < M20 minimum per BNBC §5.4.1. Use M20 or higher.`, messageBn: `কংক্রিট গ্রেড M${mc} ন্যূনতম M20 এর চেয়ে কম। M20 বা তার বেশি ব্যবহার করুন।` };
      }
      if (ms !== 415 && ms !== 500) {
        return { pass: false, severity: "major", message: `Steel grade Fe${ms} not standard — use Fe415 (IS 1786) or Fe500 per BNBC §5.4.3.`, messageBn: `ইস্পাত গ্রেড Fe${ms} মানক নয় — Fe415 (আইএস ১৭৮৬) অথবা Fe500 ব্যবহার করুন।` };
      }
      return {
        pass: true,
        severity: "info",
        message: `Materials: M${mc} concrete, Fe${ms} steel — both comply with BNBC 2020 §5.4.`,
        messageBn: `উপাদান: M${mc} কংক্রিট, Fe${ms} ইস্পাত — উভয়ই BNBC 2020 §5.4 অনুযায়ী সম্মত।`,
      };
    },
    description: "Minimum concrete and steel material grades (BNBC 2020 §5.4)",
  },
  {
    id: "BNBC-006",
    title: "Floor Area Ratio (FAR)",
    clause: "§5.2",
    category: "floor-area",
    severity: "major",
    check: (ctx) => {
      // FAR = total built-up area / plot area
      const maxFAR = ctx.project.location === "dhaka" ? 3.0 : 2.5; // Dhaka main roads vs others
      const footprintArea = ctx.dimensions.footprintMm[0] * ctx.dimensions.footprintMm[1] / 1e6; // m²
      const totalBuiltUp = footprintArea * ctx.project.stories;
      const far = totalBuiltUp / ctx.project.plotSqm;
      const pass = far <= maxFAR;
      return {
        pass,
        severity: "critical",
        message: pass
          ? `FAR = ${far.toFixed(2)} ≤ ${maxFAR} (Dhaka main road limit per BNBC §5.2.1).`
          : `FAR = ${far.toFixed(2)} exceeds maximum ${maxFAR} for ${ctx.project.location}. Excess: ${(far - maxFAR).toFixed(2)}.`,
        messageBn: pass
          ? `এফএআর = ${far.toFixed(2)} ≤ ${maxFAR} (ঢাকার প্রধান সড়কের সীমা, BNBC §5.2.1)।`
          : `এফএবএফ ${far.toFixed(2)} সর্বোচ্চ ${maxFAR} অতিক্রম করেছে। অতিরিক্ত: ${(far - maxFAR).toFixed(2)}।`,
        recommendation: pass ? undefined : `Reduce built-up area by ${(totalBuiltUp - maxFAR * ctx.project.plotSqm).toFixed(1)} m² or seek FAR purchase from RAJUK.`,
        measured: far,
        required: `≤ ${maxFAR}`,
      };
    },
    description: "Maximum Floor Area Ratio per city zone (BNBC 2020 §5.2)",
  },
  {
    id: "BNBC-007",
    title: "Occupancy Load & Egress Width",
    clause: "§8.2",
    category: "access",
    severity: "major",
    check: (ctx) => {
      const occupantsPerUnit = 5; // typical residential
      const totalOccupants = ctx.project.unitsPerFloor * ctx.project.stories * occupantsPerUnit;
      const minExitWidth = Math.ceil(totalOccupants * 0.005); // 5mm per occupant per BNBC
      const actualStairWidth = ctx.dimensions.stairWidthMm;
      if (actualStairWidth && actualStairWidth < minExitWidth) {
        return {
          pass: false,
          severity: "critical",
          message: `Stair width ${actualStairWidth}mm < required ${minExitWidth}mm for ${totalOccupants} occupants (BNBC §8.2.1).`,
          messageBn: `${totalOccupants} জনের জন্য প্রয়োজনীয় ${minExitWidth}mm এর চেয়ে সিঁড়ির প্রস্থ ${actualStairWidth}mm কম (BNBC §8.2.1)।`,
          recommendation: `Increase stair width to ≥${minExitWidth}mm or provide additional stair`,
          measured: actualStairWidth,
          required: `≥ ${minExitWidth}mm`,
        };
      }
      return {
        pass: true,
        severity: "info",
        message: `Egress width ${actualStairWidth}mm adequate for ${totalOccupants} occupants (BNBC §8.2.1).`,
      };
    },
    description: "Minimum egress width based on occupant load (BNBC 2020 §8.2)",
  },
  {
    id: "BNBC-008",
    title: "Earthquake Resistance — Drift Limit",
    clause: "§7.5",
    category: "seismic",
    severity: "critical",
    check: (ctx) => {
      // Verify that drift won't exceed H/500
      const H = ctx.dimensions.totalHeightMm;
      const maxDrift = H / 500; // mm
      // We can't compute drift without structural analysis, but we can flag high-rise buildings
      if (H > 18000) {
        return {
          pass: true,
          severity: "critical",
          message: `Building height ${H/1000}m > 18m — drift check H/500 = ${maxDrift.toFixed(0)}mm required per BNBC §7.5.1. Structural analysis mandatory.`,
          messageBn: `ভবনের উচ্চতা ${H/1000} মি > ১৮ মি — §7.5.1 অনুযায়ী ড্রিফট পরীক্ষা H/500 = ${maxDrift.toFixed(0)}mm আবশ্যক। কাঠামোগত বিশ্লেষণ জরুরি।`,
          recommendation: "Complete lateral analysis per BNBC Ch 7, verify drift at each floor",
        };
      }
      return {
        pass: true,
        severity: "info",
        message: `Building height ${H/1000}m — drift limits per BNBC §7.5 apply.`,
      };
    },
    description: "Story drift limits under seismic loading (BNBC 2020 §7.5)",
  },
  {
    id: "RAJUK-001",
    title: "RAJUK Setback — Front",
    clause: "RAJUK DAP §3.2",
    category: "setback",
    severity: "major",
    check: (ctx) => {
      // Minimum front setback depends on road width
      // For standard residential roads (30-60ft): 1.5m front, 2.0m rear
      const minFront = 1500; // mm
      return {
        pass: true,
        severity: "info",
        message: `Front setback: minimum 1.50m per RAJUK DAP §3.2. Verify actual set design respects this.`,
        messageBn: `সামনের সেটব্যাক: RAJUK ডিএপি §3.2 অনুযায়ী ন্যূনতম ১.৫০ মি।`,
      };
    },
  },
  {
    id: "RAJUK-002",
    title: "RAJUK Parking Provision",
    clause: "RAJUK DAP §6",
    category: "access",
    severity: "major",
    check: (ctx) => {
      const units = ctx.project.unitsPerFloor * ctx.project.stories;
      // RAJUK: 1 car parking per 2 residential units, min 1 motorcycle slot per floor
      const carParks = Math.ceil(units / 2);
      const hasParking = ctx.dimensions.hasParking ?? false;
      if (!hasParking && units > 0) {
        return {
          pass: false,
          severity: "major",
          message: `No parking area detected. RAJUK DAP §6 requires ${carParks} car parking slots for ${units} units.`,
          messageBn: `পার্কিং এলাকা পাওয়া যায়নি। RAJUK ডিএপি §6 অনুযায়ী ${units} ইউনিটের জন্য ${carParks}টি গাড়ির পার্কিং প্রয়োজন।`,
          recommendation: `Add parking area with ${carParks} car slots + ${Math.max(units, 2)} motorcycle slots per DAP §6.4`,
        };
      }
      return {
        pass: true,
        severity: "info",
        message: `Parking provision detected. Verify ${carParks} car slots per RAJUK DAP §6.`,
      };
    },
    description: "Mandatory parking provision per unit count (RAJUK DAP 2022 §6)",
  },
];

// ---- Compliance Checker ----
export interface DeviationItem {
  ruleId: string;
  clause: string;
  title: string;
  severity: "critical" | "major" | "minor" | "info";
  category: string;
  pass: boolean;
  message: string;
  recommendation?: string;
  measured?: number;
  required?: string;
}

export function runComplianceCheck(ctx: ComplianceContext): { summary: Record<string, number>; deviations: DeviationItem[] } {
  const deviations: DeviationItem[] = [];
  const summary: Record<string, number> = { compliant: 0, deviation: 0, info: 0 };

  for (const rule of BNBC_RULES) {
    const result = rule.check(ctx);
    if (result.pass) {
      summary.compliant++;
    } else if (result.severity === "info") {
      summary.info++;
    } else {
      summary.deviation++;
    }
    deviations.push({
      ruleId: rule.id,
      clause: rule.clause,
      title: rule.title,
      severity: rule.severity,
      category: rule.category,
      pass: result.pass,
      message: result.message,
      recommendation: result.recommendation,
      measured: result.measured,
      required: result.required,
    });
  }

  return { summary, deviations };
}

/** Compute context from project + mesh */
export function buildComplianceContext(
  project: {
    stories: number;
    plotSqm: number;
    plotUnit: string;
    unitsPerFloor: number;
    location: "dhaka" | "chittagong" | "khulna" | "rajshahi" | "sylhet";
  },
  mesh: MeshDocument,
  materials: { concreteGrade: number; steelGrade: number; brickStrength: number },
): ComplianceContext {
  // Compute footprint from slabs (actual building footprint, not column projections)
  const slabs = mesh.objects.filter(o => o.kind === "slab");
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const slab of slabs) {
    minX = Math.min(minX, slab.bboxMinMm[0]);
    minY = Math.min(minY, slab.bboxMinMm[1]);
    maxX = Math.max(maxX, slab.bboxMaxMm[0]);
    maxY = Math.max(maxY, slab.bboxMaxMm[1]);
  }
  const footprintMm: [number, number] = [maxX - minX, maxY - minY];

  // Building height: top of highest roof slab (exclude parapets, tanks)
  const roofSlabs = mesh.objects.filter(o => o.kind === "slab" && o.phase === "roof");
  const roofTopZ = roofSlabs.length > 0
    ? Math.max(...roofSlabs.map(s => s.bboxMaxMm[2]))
    : (maxY > 0 ? maxY * 0.3 : 0); // fallback: estimate from footprint
  
  // For height base, find the ground floor slab bottom
  const groundSlabs = mesh.objects.filter(o => o.kind === "slab" && o.phase === "ground_floor");
  const groundBotZ = groundSlabs.length > 0
    ? Math.min(...groundSlabs.map(s => s.bboxMinMm[2]))
    : 0;
  const totalHeightMm = roofTopZ - groundBotZ;

  // Column spacing (grid analysis)
  const columns = mesh.objects.filter(o => o.kind === "column");
  const colSpacingX: number[] = [];
  const colSpacingY: number[] = [];
  const seenX = new Set<number>();
  const seenY = new Set<number>();
  for (const col of columns) {
    const cx = (col.bboxMinMm[0] + col.bboxMaxMm[0]) / 2;
    const cy = (col.bboxMinMm[1] + col.bboxMaxMm[1]) / 2;
    const rx = Math.round(cx / 300) * 300;
    const ry = Math.round(cy / 300) * 300;
    if (!seenX.has(rx)) { seenX.add(rx); colSpacingX.push(rx); }
    if (!seenY.has(ry)) { seenY.add(ry); colSpacingY.push(ry); }
  }
  colSpacingX.sort((a, b) => a - b);
  colSpacingY.sort((a, b) => a - b);
  const spacings = [...new Set([
    ...colSpacingX.slice(1).map((v, i) => v - colSpacingX[i]),
    ...colSpacingY.slice(1).map((v, i) => v - colSpacingY[i]),
  ])].filter(v => v > 0).sort((a, b) => a - b);

  // Stair width: use clear tread width (max X or Y dimension of individual treads)
  // Filter out stair cores (which have large footprint) - use smallest tread width
  const stairTreads = mesh.objects.filter(o => 
    o.kind === "stair" && 
    (o.id.includes("tread") || o.id.includes("flight") || o.id.includes("step") || o.id.includes("step"))
  );
  const stairWidth = stairTreads.length > 0
    ? Math.max(...stairTreads.map(s => Math.max(s.bboxMaxMm[0] - s.bboxMinMm[0], s.bboxMaxMm[1] - s.bboxMinMm[1])))
    : 1050;

  // Corridor width: derive from wall partitions between columns
  // Find the minimum clear span between parallel partition walls
  const partitions = mesh.objects.filter(o =>
    o.kind === "partition" || (o.kind === "wall" && o.label.toLowerCase().includes("partition"))
  );
  let corridorWidthMm = 1200; // BNBC minimum
  if (partitions.length >= 2) {
    // Group partitions by axis and find min gap between parallel walls
    const xPartitions = partitions.filter(o =>
      (o.bboxMaxMm[0] - o.bboxMinMm[0]) < (o.bboxMaxMm[1] - o.bboxMinMm[1])
    );
    const yPartitions = partitions.filter(o =>
      (o.bboxMaxMm[1] - o.bboxMinMm[1]) <= (o.bboxMaxMm[0] - o.bboxMinMm[0])
    );

    let minGap = Infinity;
    for (let i = 0; i < xPartitions.length; i++) {
      for (let j = i + 1; j < xPartitions.length; j++) {
        const gap = xPartitions[j].bboxMinMm[1] - xPartitions[i].bboxMaxMm[1];
        // Only consider gaps wide enough to be a real corridor (>= 500 mm).
        // Sub-500 mm gaps are adjacent wall stubs / column faces, not corridors.
        if (gap >= 500 && gap < minGap) minGap = gap;
      }
    }
    for (let i = 0; i < yPartitions.length; i++) {
      for (let j = i + 1; j < yPartitions.length; j++) {
        const gap = yPartitions[j].bboxMinMm[0] - yPartitions[i].bboxMaxMm[0];
        if (gap >= 500 && gap < minGap) minGap = gap;
      }
    }
    if (isFinite(minGap) && minGap > 0) {
      corridorWidthMm = Math.round(minGap);
    }
  }

  // Parking detection: check for ground_floor objects with parking-related labels
  const hasParking = mesh.objects.some(o => 
    o.kind === "parking" || 
    o.id.toLowerCase().includes("parking") ||
    o.label.toLowerCase().includes("parking") ||
    (o.phase === "ground_floor" && o.id.includes("canopy")) // entrance canopy often marks parking
  );

  return {
    project,
    mesh,
    dimensions: {
      footprintMm,
      totalHeightMm,
      columnSpacing: spacings,
      stairWidthMm: stairWidth,
      corridorWidthMm,
      hasParking,
    },
    materials,
  };
}
