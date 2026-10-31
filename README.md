# ArchResidenceBD v2.4.2

ArchResidenceBD is a specialized civil engineering software suite tailored for residential building design in Bangladesh. It bridges the gap between architectural vision and engineering compliance, integrating local regulations (BNBC/RAJUK) with professional-grade modeling and estimation tools.

## 🚀 Key Features

- **Bilingual AI Planning**: Intelligent building layout generation with support for both English and Bengali commands.
- **Regulatory Compliance**: Integrated checks for BNBC (Bangladesh National Building Code) and RAJUK (Rajdhani Unnayan Kartripakkha) setback and safety rules.
- **NativeCAD 3D Engine**: A high-performance 3D modeling environment built specifically for residential structures.
- **PWD BOQ Estimation**: Automated Bill of Quantities (BOQ) generation following Public Works Department (PWD) standards and latest rate schedules.
- **Full-Stack Performance**: Powered by a robust React frontend and a TypeScript-based backend for seamless design-to-data workflows.

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Express (Node.js), TypeScript
- **AI Integration**: Google Gemini API (Interactions API)
- **Deployment**: AI Studio / Cloud Run

## 📦 Getting Started

### Prerequisites

- Node.js (v18+)
- npm or yarn
- Google Gemini API Key (set as `VITE_GOOGLE_GENERATIVE_AI_API_KEY` in environment)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sazid63/ArchResidenceBD.git
   cd ArchResidenceBD
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the root directory and add:
   ```env
   VITE_GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## 🗂️ Repository Layout

| Path | Contents |
|------|----------|
| `src/cad/` | Parametric generator, `solidKernel.ts` (disjoint/closed solids + validator), exporters (IFC/FreeCAD), structural, BOQ, drawings |
| `src/data/` | Floor-plan presets (`floorplanPresets.ts`), 60-plan catalogue + `floorplanMapping.ts` (plan → preset), generated CAD/BOQ data |
| `src/screens`, `src/components`, `src/engine` | UI, project state, Archie chat engine |
| `src/server/` | Express server (Gemini proxy); `npm run dev` |
| `scripts/` | `audits/`, `tests/`, `render/`, `extraction/` (see `scripts/README.md`); `npm run verify` |
| `docs/` | ADRs, specs, release notes, knowledge base |
| `spec/` | Rule packs, flows, models, RAG sources |
| `tools/` | BOQ lecture sources and extracted text |
| `public/assets/floorplans/` | Floor-plan drawings |

Package manager: **npm** (`package-lock.json`). See `RELEASES.md` for release notes.

## 🏗️ Version History

### v2.4.2 (Current)
- Chosen typical floor plan now drives every floor; solid-resolution pass (0 overlaps / 0 z-fighting); preset room overlaps fixed; windows slide clear of columns; `npm run verify`.


### v2.3 (Current) - Major Rework
- **60 Real Bangladeshi Floor Plans**: Parsed from docx links, 30 actual images downloaded with 2D SVG previews
- **AUST CE208/CE205 BOQ Generator**: Complete rewrite with proper PWD SOR calculations (electrical wiring, switchgear, fixtures, earthing, generator)
- **ProjectsScreen Fix**: LocalStorage integration, Open/Delete project buttons working
- **Accessibility Audit**: ARIA tab patterns, keyboard navigation, SVG accessibility, focus trapping in modals
- **Code Quality Refactoring**: Shared types module, shared hook, ProjectContext (400+ lines eliminated)
- **TypeScript Clean**: 0 errors, 0 `any` types, circular dependencies resolved
- **Build Success**: 712ms, 87 modules, 768 KB JS

### v2.2 (Previous)

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
*Developed for the Bangladesh Civil Engineering & Architecture community.*
