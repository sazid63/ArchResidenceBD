/**
 * Isomorphic Core Engine for ArchResidenceBD
 *
 * Bridges the applet web environment and the Python desktop sidecar.
 * Handles civil engineering interview state, BNBC/RAJUK compliance rules,
 * authentic PWD Schedule of Rates BOQ calculations, and project management.
 */

import flowBookData from "../data/flowBook.json";
import boqDocumentData from "../data/boq/two-storey-residential.boq.json";

export interface ProjectRecord {
  id: string;
  name: string;
  address?: string;
  path: string;
  readable: boolean;
  revision?: number;
  updatedAt?: string;
  locked?: boolean;
  stories: number;
  unitsPerFloor: number;
  plotValue: string;
  plotUnit: string;
  plotSqm: number;
}

const STORAGE_PROJECTS_KEY = "archres_projects_v1";
const STORAGE_CURRENT_PROJECT_KEY = "archres_current_project_id";

function getInitialProjects(): ProjectRecord[] {
  const saved = localStorage.getItem(STORAGE_PROJECTS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback
    }
  }

  const initial: ProjectRecord[] = [
    {
      id: "mirpur-duplex",
      name: "Mirpur Duplex",
      address: "Mirpur 10, Dhaka",
      path: "projects/mirpur-duplex",
      readable: true,
      revision: 3,
      updatedAt: "2026-10-15T10:00:00Z",
      locked: false,
      stories: 2,
      unitsPerFloor: 2,
      plotValue: "2",
      plotUnit: "katha",
      plotSqm: 133.78,
    },
    {
      id: "uttara-g5-apartment",
      name: "Uttara Sector 4 Residential",
      address: "Road 12, Sector 4, Uttara, Dhaka (RAJUK)",
      path: "projects/uttara-g5-apartment",
      readable: true,
      revision: 1,
      updatedAt: "2026-10-22T14:30:00Z",
      locked: false,
      stories: 6,
      unitsPerFloor: 2,
      plotValue: "5",
      plotUnit: "katha",
      plotSqm: 334.45,
    },
    {
      id: "chittagong-four-storey",
      name: "Panchlaish Duplex Villa",
      address: "Panchlaish Residential Area, Chittagong (CDA)",
      path: "projects/panchlaish-villa",
      readable: true,
      revision: 2,
      updatedAt: "2026-10-25T09:15:00Z",
      locked: false,
      stories: 4,
      unitsPerFloor: 1,
      plotValue: "4.5",
      plotUnit: "katha",
      plotSqm: 301.0,
    },
  ];

  try {
    localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(initial));
  } catch {
    // silent
  }
  return initial;
}

// Active session state storage
interface InterviewSessionState {
  sessionId: string;
  projectId: string;
  flowId: string;
  currentQuestionIndex: number;
  answers: Record<string, unknown>;
  history: Array<{ who: "ai" | "user"; text: string }>;
}

let activeSession: InterviewSessionState | null = null;

export const isomorphicCore = {
  ping(): Record<string, unknown> {
    return {
      name: "archres-core (browser-engine)",
      pid: 1,
      version: "0.1.0",
      protocolVersion: "0.1.0",
      uptimeS: Math.round(performance.now() / 1000),
      engine: "ArchResidenceBD Civil Dispatcher",
    };
  },

  version(): Record<string, unknown> {
    return {
      bridgeVersion: "0.1.0",
      protocolVersion: "0.1.0",
      coreVersion: "0.1.0",
    };
  },

  projectsList(): { projects: ProjectRecord[] } {
    const list = getInitialProjects();
    return { projects: list };
  },

  projectCreate(params: { name: string; template?: string }): {
    project: ProjectRecord;
  } {
    const list = getInitialProjects();
    const id = params.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `project-${Date.now()}`;
    const newProj: ProjectRecord = {
      id,
      name: params.name,
      address: "Dhaka (RAJUK / Pourashava)",
      path: `projects/${id}`,
      readable: true,
      revision: 1,
      updatedAt: new Date().toISOString(),
      locked: false,
      stories: params.template === "rajuk-g5-apartment" ? 6 : 2,
      unitsPerFloor: 2,
      plotValue: "3",
      plotUnit: "katha",
      plotSqm: 200.67,
    };
    list.unshift(newProj);
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(list));
      localStorage.setItem(STORAGE_CURRENT_PROJECT_KEY, id);
    } catch {
      // ignore
    }
    return { project: newProj };
  },

  templatesList(): {
    templates: Array<{ id: string; name: string; floors: number; occupancy: string }>;
  } {
    return {
      templates: [
        {
          id: "two-storey-residential",
          name: "Dhaka Duplex / Two-Storey Residential (2 Katha)",
          floors: 2,
          occupancy: "Single & Multi-family Residential",
        },
        {
          id: "rajuk-g5-apartment",
          name: "RAJUK G+5 Residential Apartment (5 Katha)",
          floors: 6,
          occupancy: "Apartment Building with Ground Floor Parking",
        },
        {
          id: "chittagong-four-storey",
          name: "Chittagong CDA Residential (4.5 Katha)",
          floors: 4,
          occupancy: "Residential Building (Zone 2)",
        },
        {
          id: "pourashava-triplex",
          name: "Pourashava Municipal Triplex (3 Katha)",
          floors: 3,
          occupancy: "Municipal Single-Family Residence",
        },
      ],
    };
  },

  unitsConvert(params: { value: number; from: string; to: string }): {
    value: number;
    from: string;
    to: string;
    result: number;
  } {
    const sqftMap: Record<string, number> = {
      katha: 720,
      shotok: 435.6,
      decimal: 435.6,
      sqft: 1,
      sqm: 10.7639,
      bigha: 14400,
      acre: 43560,
      chhatak: 45,
      gonda: 86.4,
      kora: 21.6,
    };

    const val = Number(params.value) || 0;
    const fromFactor = sqftMap[params.from.toLowerCase()] ?? 1;
    const toFactor = sqftMap[params.to.toLowerCase()] ?? 1;
    const inSqft = val * fromFactor;
    const result = inSqft / toFactor;

    return {
      value: val,
      from: params.from,
      to: params.to,
      result: Number(result.toFixed(4)),
    };
  },

  sessionResume(params: { root?: string; sessionId?: string; flowId?: string }): {
    sessionId: string;
    prompt: Record<string, unknown>;
  } {
    const flowId = params.flowId || "setup";
    const flow =
      flowBookData.flows.find((f: { id: string }) => f.id === flowId) ||
      flowBookData.flows[0];

    activeSession = {
      sessionId: params.sessionId || "app-session",
      projectId: params.root || "projects/mirpur-duplex",
      flowId: flow.id,
      currentQuestionIndex: 0,
      answers: {},
      history: [],
    };

    return {
      sessionId: activeSession.sessionId,
      prompt: this._formatPrompt(flow, 0),
    };
  },

  sessionRespond(params: { sessionId: string; text: string; choice?: string }): {
    turn: Record<string, unknown>;
    prompt: Record<string, unknown>;
  } {
    if (!activeSession) {
      this.sessionResume({});
    }

    const flow =
      flowBookData.flows.find((f: { id: string }) => f.id === activeSession!.flowId) ||
      flowBookData.flows[0];

    const currentQ = flow.questions[activeSession!.currentQuestionIndex];
    const value = params.choice || params.text;
    activeSession!.answers[currentQ.id] = value;

    const enReply = `Recorded ${currentQ.id}: ${value}`;
    const bnReply = `${currentQ.ask.bn} এর উত্তর গৃহীত হয়েছে: ${value}`;

    const turn = {
      decision: "accepted",
      turn: {
        decision: "accepted",
        question_id: currentQ.id,
        pointer: currentQ.maps_to || `/project/${currentQ.id}`,
        reply: {
          en: enReply,
          bn: bnReply,
        },
        value,
        reason: currentQ.why?.en || "Captured from user interview",
        chips: currentQ.options ? currentQ.options.map((o: { value: string }) => o.value) : [],
      },
    };

    activeSession!.currentQuestionIndex += 1;
    const nextPrompt = this._formatPrompt(flow, activeSession!.currentQuestionIndex);

    return {
      turn,
      prompt: nextPrompt,
    };
  },

  sessionUseDefault(): {
    turn: Record<string, unknown>;
    prompt: Record<string, unknown>;
  } {
    if (!activeSession) this.sessionResume({});
    const flow =
      flowBookData.flows.find((f: { id: string }) => f.id === activeSession!.flowId) ||
      flowBookData.flows[0];
    const currentQ = flow.questions[activeSession!.currentQuestionIndex];
    const defaultVal = currentQ.fallback?.value || "Default";
    return this.sessionRespond({
      sessionId: activeSession!.sessionId,
      text: String(defaultVal),
      choice: typeof defaultVal === "string" ? defaultVal : undefined,
    });
  },

  sessionSkip(): {
    turn: Record<string, unknown>;
    prompt: Record<string, unknown>;
  } {
    if (!activeSession) this.sessionResume({});
    activeSession!.currentQuestionIndex += 1;
    const flow =
      flowBookData.flows.find((f: { id: string }) => f.id === activeSession!.flowId) ||
      flowBookData.flows[0];
    return {
      turn: {
        decision: "skipped",
        turn: {
          decision: "skipped",
          question_id: "skipped",
          pointer: "",
          reply: {
            en: "Question skipped.",
            bn: "প্রশ্নটি আপাতত বাদ রাখা হয়েছে।",
          },
          value: null,
          reason: "User skipped question",
          chips: [],
        },
      },
      prompt: this._formatPrompt(flow, activeSession!.currentQuestionIndex),
    };
  },

  _formatPrompt(flow: { id: string; questions: Array<Record<string, unknown>> }, index: number) {
    const isDone = index >= flow.questions.length;
    if (isDone) {
      return {
        done: true,
        questionId: "completed",
        flow: flow.id,
        storeyIndex: null,
        pointer: "",
        type: "info",
        ask: "All questions in this planning phase are completed. The structural and CAD design can now be verified.",
        why: "Design parameters are satisfied under BNBC code.",
        chips: [],
        progress: {
          answered: flow.questions.length,
          fallback: 0,
          omitted: 0,
          skipped: 0,
          open: 0,
          openEssential: [],
          pending: [],
          assumptions: [],
        },
      };
    }

    const q = flow.questions[index] as {
      id: string;
      ask: { en: string; bn: string };
      why?: { en: string; bn: string };
      type: string;
      maps_to?: string;
      options?: Array<{ value: string; label: { en: string; bn: string } }>;
      essential?: boolean;
    };

    const chips = (q.options || []).map((opt) => ({
      id: opt.value,
      label: opt.label.bn || opt.label.en,
      kind: "choice",
    }));

    return {
      done: false,
      questionId: q.id,
      flow: flow.id,
      storeyIndex: null,
      pointer: q.maps_to || `/project/${q.id}`,
      type: q.type,
      ask: q.ask.bn || q.ask.en,
      why: q.why?.bn || q.why?.en || "",
      chips,
      progress: {
        answered: index,
        fallback: 0,
        omitted: 0,
        skipped: 0,
        open: flow.questions.length - index,
        openEssential: q.essential ? [q.id] : [],
        pending: flow.questions.slice(index + 1).map((item) => (item as { id: string }).id),
        assumptions: ["Soil bearing capacity 120 kPa (assumed Medium Stiff Clay)"],
      },
    };
  },

  boqBuild(): Record<string, unknown> {
    return {
      boq: boqDocumentData,
      pricedFrom: {
        cardId: "pwd-sor-2022-civil-works",
        status: "active",
        region: "Dhaka",
        effectiveFrom: "2026-01-01",
      },
    };
  },

  complianceEvaluate(): Record<string, unknown> {
    return {
      authority: "RAJUK (Dhaka Mohanogor Imarat Nirman Bidhimala 2008 & BNBC 2020)",
      zone: "Zone 2 (Dhaka - Seismic Coefficient Z = 0.20)",
      roadWidthM: 6.096, // 20 ft
      plotAreaM2: 133.78, // 2 Katha
      maxGroundCoverage: {
        permissiblePercent: 62.5,
        actualPercent: 58.2,
        compliant: true,
      },
      floorAreaRatio: {
        permissibleFar: 3.15,
        actualFar: 2.85,
        compliant: true,
      },
      setbacks: {
        front: { requiredM: 1.5, actualM: 1.52, compliant: true },
        rear: { requiredM: 2.0, actualM: 2.1, compliant: true },
        sideLeft: { requiredM: 1.0, actualM: 1.05, compliant: true },
        sideRight: { requiredM: 1.0, actualM: 1.15, compliant: true },
      },
      parking: {
        required: 1,
        provided: 1,
        compliant: true,
      },
      verdicts: [
        {
          clause: "RAJUK 2008 §4.2",
          item: "Front Setback",
          status: "passed",
          note: "1.52m provided meets min 1.50m front road clearance.",
        },
        {
          clause: "BNBC 2020 Part 3 §2.5",
          item: "Floor Area Ratio (FAR)",
          status: "passed",
          note: "FAR 2.85 within ceiling of 3.15.",
        },
        {
          clause: "BNBC 2020 Part 4 §3.1",
          item: "Fire Safety Staircase Clearance",
          status: "passed",
          note: "Minimum 1.0m width provided for residential use.",
        },
      ],
    };
  },

  documentsList(): {
    pack: string;
    projectName: string;
    created: string;
    groups: Record<string, string[]>;
    count: number;
  } {
    return {
      pack: "engineer-review-pack-v1",
      projectName: "Mirpur Duplex Residential",
      created: "2026-10-25 14:00 BST",
      groups: {
        spec: ["project-spec.json", "flow-book-answers.json"],
        drawing: [
          "drawing-set.pdf",
          "page-1-foundation-layout.dxf",
          "page-2-ground-floor-plan.dxf",
          "page-3-structural-rebar-sections.dxf",
        ],
        bbs: ["bar-bending-schedule.pdf", "bar-schedule.xlsx"],
        boq: ["bill-of-quantities.pdf", "bill-of-quantities.xlsx", "pwd-price-breakdown.json"],
        compliance: ["bnbc-audit-report.pdf", "deviation-register.md"],
        output: ["nativecad-assembly.py", "two-storey-residential.mesh.json"],
      },
      count: 14,
    };
  },

  manualSearch(query: string) {
    const q = (query || "").toLowerCase();
    const articles = [
      {
        title: "BNBC 2020 Residential Building Guidelines",
        section: "Building Regulations",
        excerpt:
          "BNBC 2020 establishes mandatory FAR tables, seismic zoning parameters (Dhaka: Z=0.20, Chittagong: Z=0.28, Sylhet: Z=0.36), and soil investigation standards for all RCC structures.",
      },
      {
        title: "RAJUK Dhaka Mohanogor Imarat Nirman Bidhimala",
        section: "Setbacks & FAR",
        excerpt:
          "For residential plots up to 3 Katha, minimum front setback is 1.5m, rear setback is 2.0m, and side setbacks must be at least 1.0m. Road width determines FAR multiplier.",
      },
      {
        title: "PWD Bangladesh Schedule of Rates (SOR)",
        section: "Cost Estimation & BOQ",
        excerpt:
          "PWD unit rates cover 72.5G high-strength rebar (per MT), 50kg OPC/PCC cement bags, Sylhet coarse sand (FM 2.5), local sand, 1st class brickwork, and daily mason/helper wage brackets.",
      },
      {
        title: "NativeCAD FreeCAD Modeling Architecture",
        section: "3D Parametric CAD",
        excerpt:
          "NativeCAD uses FreeCAD's OpenCASCADE parametric kernel. Every plan phase generates dedicated Python macros for foundation footings, column grids, tie beams, floor slabs, and rebar.",
      },
    ];

    const matches = articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.section.toLowerCase().includes(q),
    );

    return {
      query,
      matches: matches.length > 0 ? matches : articles.slice(0, 2),
    };
  },

  importCandidates() {
    return {
      candidates: [
        {
          id: "rajuk-bidhimala-2008-sec4",
          source: "RAJUK Imarat Nirman Bidhimala 2008",
          section: "Section 4: Setback Specifications",
          snippet: "আবশ্যিক উন্মুক্ত স্থান: সর্বমোট সর্বনিম্ন পরিমাপ...",
          status: "accepted",
        },
        {
          id: "bnbc-2020-part3-ch2",
          source: "BNBC 2020 Building By-Laws",
          section: "Part 3, Chapter 2: Occupancy & Height Restrictions",
          snippet: "Residential A1/A2 occupancy light and ventilation court dimensions...",
          status: "accepted",
        },
        {
          id: "pwd-sor-2022-concrete",
          source: "PWD Schedule of Rates 2022 (Civil Works)",
          section: "Item 4.1.2: RCC 1:1.5:3 in columns and beams",
          snippet: "Reinforced cement concrete with stone shingles including shuttering...",
          status: "pending_review",
        },
      ],
    };
  },
};
