# ArchResidenceBD v2.5.4

**ArchResidenceBD** is a specialized civil engineering software suite tailored for residential building design in Bangladesh. It bridges the gap between architectural vision and engineering compliance, integrating local regulations (BNBC 2020 / RAJUK DAP 2022) with professional-grade 3D modeling, structural analysis, and cost estimation.

---

## 🚀 Key Features

| Feature | Description |
|---------|-------------|
| **2D → 3D Floor Plan Pipeline** | 50 verified Bangladeshi floor plan drawings drive parametric 3D model generation. 1-unit, 2-unit, 2+ unit categories with random/manual selection per floor. |
| **Bilingual AI Planning** | Intelligent building layout generation with support for English and Bengali commands (Archie chat engine). |
| **Regulatory Compliance** | BNBC 2020 Part 3, RAJUK DAP 2022 setback & safety rules, M25/Fe415 structural design per ACI 318. |
| **NativeCAD 3D Engine** | High-performance watertight 3D solids (columns, beams, slabs, walls, stairs, parapets, water tanks). Zero overlaps, zero z-fighting. |
| **Structural Analysis** | Column utilization ≤ 0.80, beam utilization ≤ 0.85, deflection L/360, seismic Zone 3 base shear. |
| **PWD BOQ Estimation** | Automated Bill of Quantities with PWD SOR 2022 rates (civil, electrical, plumbing, reinforcement). |
| **Phase-Based Interview** | Site → Foundation → Ground → Floors → Roof → Utilities → 3D Design, with AI-guided Q&A. |
| **PWA + Offline** | Service worker caches fonts, assets, and API responses for offline use. |
| **Self-Hosted Fonts** | Inter, Lora, Noto Sans Bengali (OFL licensed) — no Google Fonts. |

---

## 🛠️ Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Vite 8 |
| **Backend** | Express (Node.js), TypeScript |
| **AI** | Google Gemini API (via server proxy) |
| **3D** | Custom parametric solid kernel (WebGL via Three.js in viewer) |
| **Data** | localStorage (projects), JSON (BOQ, compliance, floor plans) |
| **Quality** | `npm run verify` — 8 audit suites, 50+ mesh cases, 220 solid configs |

---

## 📦 Getting Started

### Prerequisites

- **Node.js 20+** (recommended)
- **npm** (bundled with Node)
- **Google Gemini API Key** (for AI chat — set as env var)

### Installation

```bash
# 1. Clone
git clone https://github.com/sazid63/ArchResidenceBD.git
cd ArchResidenceBD

# 2. Install deps
npm install

# 3. Configure env (optional — for AI chat)
echo "VITE_GOOGLE_GENERATIVE_AI_API_KEY=your_key" > .env

# 4. Dev server (with Express proxy)
npm run dev
# → http://localhost:5173 (Vite) + http://localhost:3001 (Express)

# 5. Production build + preview
npm run build && npm run preview
# → http://localhost:4173
```

---

## 🗂️ Repository Layout

```
ArchResidenceBD/
├── src/
│   ├── cad/                    # 3D engine core
│   │   ├── parametricBuildingGenerator.ts   # Main 3D generator (2D→3D)
│   │   ├── solidKernel.ts                 # Disjoint solids + validator
│   │   ├── sectionSizing.ts               # Structural sizing (BNBC)
│   │   ├── stairBuilder.ts                # Dog-leg stairs with slab openings
│   │   ├── exporters.ts                   # IFC, FreeCAD, OBJ, GLTF
│   │   ├── boqGenerator.ts                # PWD SOR 2022 BOQ
│   │   └── ... (drawingEngine, formwork, rebar, etc.)
│   ├── data/
│   │   ├── floorplanLibrary.ts      # 50 verified 2D templates (1/2/2+ unit)
│   │   ├── floorplanSelection.ts    # Manual/random pick per unit category
│   │   ├── floorplanMapping.ts      # Template → 3D preset resolution
│   │   ├── floorplanPresets.ts      # 10 parametric room presets
│   │   ├── boq/, compliance/, prices/ # Reference data
│   │   └── rules/                   # BNBC/RAJUK rule packs
│   ├── engine/
│   │   ├── projectState.ts          # Project CRUD, phases, localStorage
│   │   ├── phasePlanner.ts          # AI interview logic per phase
│   │   └── ...
│   ├── screens/                     # 25+ phase screens (chat, 3D, BOQ, etc.)
│   ├── components/                  # FloorplanPreview, Progressive, etc.
│   ├── context/ProjectContext.tsx   # React state + localStorage sync
│   ├── i18n.tsx                     # EN/BN bilingual support
│   └── ...
├── public/
│   ├── assets/floorplans/           # 50 verified floor plan images
│   ├── sw.js                        # Service worker (cache-first)
│   └── manifest.json                # PWA manifest
├── scripts/
│   ├── audits/                      # mesh-audit, solid-audit, sizing, presets
│   ├── tests/                       # floorplan-chain, model-quality, manual
│   └── floorplans-curation/         # Pinterest scraping pipeline
├── docs/                            # ADRs, specs, release notes
├── spec/                            # Rule packs, flows, RAG sources
├── tools/                           # BOQ lecture sources
├── dist/                            # Production build output (gitignored)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🏗️ Version History

### **v2.5.4** (Current — 2026-11-04)
- **'Start 3D Design Now' chip** directly opens 3D design from Utilities phase
- **Utilities phase approval keywords** expanded (`design`, `start`, `3d`, `open`)
- **Project creation loop fixed** — `ProjectContext` syncs localStorage + React state
- **Create Project button stabilized** with `useCallback` + `stopPropagation/preventDefault`

### **v2.5.3**
- Fixed infinite loop in Utilities phase — approval now triggers `startDesign()`

### **v2.5.2**
- `ProjectSetupScreen` uses `useProject()` hook → atomic save to context + localStorage
- `Generate Random Building` button also fixed

### **v2.5.1**
- `Create Project & Start Planning` button stabilized with `useCallback` + event handling

### **v2.5.0** — **Major: 2D→3D Floor Plan Integration**
- **50 verified floor plan images** (14×1-unit, 15×2-unit, 21×2+ unit) from Pinterest/Bangladesh sources
- **New data layer**: `floorplanLibrary.ts`, `floorplanSelection.ts`, `floorplanMapping.ts`
- **Template-driven footprint**: `plotSizeRange` (ft, ft-in, sqft, Katha) → building envelope
- **10 parametric presets** with relative coords (`boundsRel`, `pointsRel`) + non-rectangular polygons
- **All audits pass**: 50 mesh cases (0 defects) + 220 solid configs (0 overlaps/z-fights)

### **v2.4.4**
- UI/UX polish: responsive drawer, hash routing, accessible dialogs, FreeCAD/IFC export
- Crash fixes, theme variables, hooks audit

### **v2.4.3**
- Structural section sizing from engine; exact-rise stairs with slab openings
- Measured BOQ take-off with correct units/reinforcement

### **v2.4.2**
- Chosen floor plan drives every floor; solid-resolution pass (0 overlaps/z-fights)
- Windows slide clear of columns; `npm run verify` introduced

### **v2.3**
- 60 real Bangladeshi floor plans parsed; 30 images with 2D SVG previews
- AUST CE208/CE205 BOQ generator rewrite (PWD SOR electrical, fixtures, earthing)
- ProjectsScreen localStorage integration; accessibility audit (ARIA, keyboard, focus)
- Code quality: shared types, ProjectContext, 0 TS errors, 0 `any` types

---

## 🧪 Quality Gates

```bash
# Full verification suite (runs in CI)
npm run verify
# → tsc --noEmit
# → audit:hooks (0 violations in 85 files)
# → test:floorplan (chain checks)
# → test:quality (model metrics)
# → test:manual (search)
# → audit:sizing (structural sizing table)
# → audit:solid (220 configs — 0 overlaps/z-fights)
# → audit:presets (footprint coverage warnings)
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork → create feature branch
2. Run `npm run verify` before PR
3. Ensure `npm run build` succeeds
4. Update CHANGELOG/RELEASES if user-facing

---

## 📞 Support & Community

- **Issues**: [GitHub Issues](https://github.com/sazid63/ArchResidenceBD/issues)
- **Discussions**: [GitHub Discussions](https://github.com/sazid63/ArchResidenceBD/discussions)
- **Docs**: `/docs` folder (ADRs, specs, BOQ lecture notes)

---

*Built for Bangladesh Civil Engineering & Architecture community.*  
*বাংলাদেশের সিভিল ইঞ্জিনিয়ারিং ও আর্কিটেকচার সমुदায়ের জন্য নির্মিত।*