# Final Implementation Plan — ArchResidenceBD Complete Suite

Finish, polish, and ready **ArchResidenceBD** — the civil engineering and residential design software for Bangladesh — building directly on the existing codebase (`sazid63/ArchResidenceBD`) and Hugging Face model fleet (`sazid63/archresidencebd-models`).

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Build on Existing Work**: All existing components (Tauri/React app shell, UI kit, design tokens, screens, NativeCAD viewer, civil data, generated CAD meshes, and Python core schemas) are preserved and polished.
> - **Dual Runtime Bridge (Desktop + Web)**: The app will run seamlessly both as a Windows Desktop application (via Tauri sidecar IPC) and as a cloud/browser web application (with a built-in isomorphic core engine dispatcher), so users never see "the app needs shell" or dead clicks in any environment.
> - **Hugging Face Model Fleet**: Incorporate the newly trained `archres-repair-v0-Q4_K_M.gguf` from Hugging Face into the registry, resolve the Qwen3-Reranker instruct template issue (ADR-0026), and provide an in-app AI Fleet Dashboard with optional Gemini/Claude/OpenAI cloud fallback.
> - **Windows Installer & Bundle**: Provide the complete Inno Setup script, NSIS configuration, and automated PowerShell/batch packaging workflow bundling the App, NativeCAD engine, and Hugging Face models into a single one-click `.exe` installer.

---

## 1. Overview & Core Concept

ArchResidenceBD is an offline-first Windows and Web civil engineering application tailored for Bangladesh:
1. **Bilingual Conversational Intake (Bangla & English)**: Gathers plot size (Katha, Decimal, Sqft), stories (Duplex, G+4, G+6, etc.), road width, location (Dhaka RAJUK, Chittagong CDA, Pourashava), units, and breaks the project into phases (Site excavation, Foundation, Floor 0, Typical Floors, Rooftop, Common services).
2. **Compliance Verification**: Evaluates BNBC 2020 & RAJUK Building By-laws (FAR, MGC, setbacks, parking).
3. **NativeCAD 3D Parametric Workspace**: Interactive WebGL mesh viewer with real-time phase toggling, object dimensions, volume measurements ($m^3$), and FreeCAD Python script export.
4. **PWD BOQ Cost Engine**: Itemized quantities (Rebar, Cement, Sylhet sand, Bricks, Labor, Machinery hire) priced against official Bangladesh PWD Schedule of Rates.
5. **AI Fleet Management**: Orchestrates the 4 specialized models (`archie-chat-v0`, `archres-repair-v0`, `archie-embed`, and `archie-rerank`).

---

## 2. Architecture & Technical Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ArchResidenceBD Interface                       │
│      (Sidebar Navigation · Bangla / English · Dark/Light Theme)        │
├───────────────────┬────────────────────────────────────────────────────┤
│  Navigation       │ Active Screen View                                 │
│  • Projects       │ 1. ProjectsScreen & ProjectSetupScreen             │
│  • Phase Planning │ 2. PhaseChatScreen (AI Conversational Intake)      │
│  • NativeCAD 3D   │ 3. NativeCadScreen (3D WebGL Engine & Model Tree)  │
│  • BOQ Costing    │ 4. BoqScreen (PWD Rates, Materials & Labor)        │
│  • AI Fleet Hub   │ 5. FleetScreen (4 Local Models + Cloud Fallback)   │
│  • Documents      │ 6. DocumentsScreen (Drawings, BBS, Reports, Pack)  │
│  • Utilities      │ 7. UnitsScreen (Katha/Decimal) & TemplatesScreen   │
│  • Distribution   │ 8. WindowsInstallerScreen (InnoSetup & Bundling)   │
├───────────────────┴────────────────────────────────────────────────────┤
│                      Isomorphic IPC Core Bridge                        │
│   • Desktop: window.__TAURI__.core.invoke("ask", ...)                  │
│   • Web/Cloud: In-memory Core Engine (BNBC + PWD + Flow Book + RAG)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Key Improvements & Fixes to Implement

### A. Core Bridge & Browser/Cloud Compatibility
- Enhance `src/ipc/core.ts` with an **Isomorphic Dispatcher**:
  - Detects if running inside Tauri (`isDesktopShell()`).
  - If running in web mode (cloud preview or browser), routes calls to an in-memory execution engine that mirrors `archres_core.bridge`:
    - Handles `projects.list`, `project.create`, `templates.list`, `units.convert`.
    - Handles `session.resume`, `session.respond`, `session.use_default`, `session.skip` for all project phases.
    - Handles `boq.build` with accurate PWD 2025/2026 rates and quantities.
    - Handles `compliance.evaluate` for BNBC 2020 & RAJUK FAR/setback rules.
  - Eliminates all "needs shell" errors, allowing normal users to test and run the full flow immediately.

### B. NativeCAD 3D Parametric Viewport
- Copy and integrate the actual generated mesh and design documents:
  - `two-storey-residential.mesh.json` (real tessellated structural elements: footings, grade beams, columns, floor slab, rooftop).
  - `foundation-two-storey-residential.design.json`.
  - `floor-two-storey-residential.design.json`.
  - `rebar-two-storey-residential.bbs.json`.
- Enhance the WebGL viewer with:
  - Phase visibility checkboxes (Foundation, Floor 0, Floor 1, Roof, Common).
  - Inspection of dimensions ($mm$) and volume ($m^3$).
  - Camera reset, wireframe mode, and FreeCAD Python script export button.

### C. Hugging Face AI Fleet Integration & Optimization
- Update `spec/models/registry.json`:
  - Upgrade `archie-repair` to use the trained `archres-repair-v0-Q4_K_M.gguf` from the Hugging Face repo.
  - Fix Qwen3-Reranker prompt template so it provides valid ranking scores across queries.
- Add an in-app **AI Fleet & Model Manager** screen:
  - Shows status of all 4 models from `https://huggingface.co/sazid63/archresidencebd-models`.
  - Single-click copyable PowerShell / curl download commands for the GGUF weights.
  - Interactive tester for Bengali/English prompts and civil queries.
  - Cloud AI Settings tab allowing users to insert Gemini, Claude, or OpenAI API keys as optional fallbacks.

### D. Windows One-Click Installer & Deployment Package
- Create complete Windows installation pipeline:
  - `installer/ArchResidenceBD.iss` (Inno Setup 6 script bundling the app, NativeCAD FreeCAD runtime, models, and desktop shortcut).
  - `build-windows-installer.ps1` (Automated PowerShell packaging script).
  - In-app download & export center for installer files and user guide.

---

## 4. Execution Steps

1. **Port Existing App Structure**:
   - Transfer all components, screens, layout, theme tokens, UI kit, i18n dictionary, labels, and CAD viewers from `/tmp/ArchResidenceBD_repo/app/src/` into `/src/`.
   - Copy CAD generated artifacts (`*.mesh.json`, `*.design.json`, `*.bbs.json`) into `/src/data/cad/generated/`.
2. **Implement Isomorphic Core Bridge**:
   - Update `src/ipc/core.ts` to seamlessly handle both Tauri and Web runtimes.
   - Implement the complete deterministic civil engine in `src/engine/` covering Bengali/English flow questions, BNBC rules, and PWD BOQ calculations.
3. **Build the AI Fleet & Hugging Face Hub Screen**:
   - Create `src/screens/FleetScreen.tsx` with live fleet health, model download commands, interactive test console, and cloud API key configuration.
4. **Build the Windows Installer Hub**:
   - Create `src/screens/WindowsInstallerScreen.tsx` with Inno Setup script generator, file bundle inspector, and one-click packaging instructions.
5. **Verify & Test**:
   - Verify all screens, navigation paths, 3D WebGL rendering, Bangla/English switching, project creation, and BOQ calculations.
   - Run `compile_applet` and verify zero errors.
