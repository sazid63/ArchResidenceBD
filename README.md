<div align="center">

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:06151B,35:0F2C33,70:1B3A48,100:0B0F17&height=180&section=header&text=ARCHRESIDENCEBD&font=Orbitron&fontSize=30&fontColor=D7F5E8&animation=fadeIn&fontAlignY=38&desc=OFFLINE-FIRST%20BUILDING%20PLANNING%20FOR%20BANGLADESH&descAlignY=63&descSize=12" width="100%" alt="ArchResidenceBD banner" />

[![TypeScript](https://img.shields.io/badge/TypeScript-React%20%2B%20Node-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Offline-first](https://img.shields.io/badge/Mode-Offline%20first-1E6F73?style=flat-square)](#)
[![Bangladesh](https://img.shields.io/badge/Code-Local%20planning-7E9EAE?style=flat-square)](#)

</div>

# ArchResidenceBD

**ArchResidenceBD** is a specialized civil engineering software suite for residential building design in Bangladesh. It connects architectural intent with engineering constraints, local planning rules, and practical cost reporting in one local-first workflow.

This project focuses on the early design phase: from rough concept to a structured, measurable, costed building model, without requiring cloud dependence or a disconnected spreadsheet workflow.

---

## Key features

| Feature | Description |
|---------|-------------|
| **2D → 3D Floor Plan Pipeline** | 50 verified Bangladeshi floor plan drawings drive parametric 3D model generation. 1-unit, 2-unit, and 2+ unit categories with random or manual selection per floor. |
| **Bilingual AI Planning** | Intelligent building layout generation with support for English and Bengali commands (Archie chat engine). |
| **Regulatory Compliance** | BNBC 2020 Part 3, RAJUK DAP 2022 setback and safety rules, M25/Fe415 structural design per ACI 318. |
| **NativeCAD 3D Engine** | High-performance watertight 3D solids for columns, beams, slabs, walls, stairs, parapets, and water tanks. |
| **Structural Analysis** | Column utilization, beam utilization, deflection, and seismic checks all remain visible and testable. |
| **PWD BOQ Estimation** | Automated Bill of Quantities with PWD SOR 2022 rates for civil, electrical, plumbing, and reinforcement. |
| **Phase-Based Interview** | Site → Foundation → Ground → Floors → Roof → Utilities → 3D Design, guided by a structured AI question flow. |
| **PWA + Offline** | Service worker caching keeps the app usable in limited or disconnected environments. |
| **Self-Hosted Fonts** | Inter, Lora, and Noto Sans Bengali are bundled locally, without pulling Google Fonts at runtime. |

---

## Technology stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Vite 8 |
| **Backend** | Express (Node.js), TypeScript |
| **AI** | Google Gemini API via a server proxy |
| **3D** | Custom parametric solid kernel with WebGL viewer |
| **Data** | localStorage, JSON, BOQ datasets and floor plan records |
| **Quality** | `npm run verify` with audit suites and structural checks |

---

## Getting started

### Prerequisites

- Node.js 20+
- npm
- Google Gemini API key for AI chat features

### Installation

```bash
# 1. Clone
git clone https://github.com/sazid63/ArchResidenceBD.git
cd ArchResidenceBD

# 2. Install dependencies
npm install

# 3. Start the app
npm run dev
```

### Production build

```bash
npm run build
npm start
```

The project is designed as a local planning and modeling workspace: robust for early design decisions, transparent about assumptions, and explicit where compliance or cost estimates remain preliminary.

---

## Notes

This project is intended for residential building planning workflows in Bangladesh and is designed to make the design-to-cost pipeline more structured and inspectable. The generated results are still estimates that should be reviewed by an engineer or architect before any final construction decision.
