# ArchResidenceBD v2.2

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
- Google Gemini API Key (set as `GOOGLE_GENERATIVE_AI_API_KEY` in environment)

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

## 🏗️ Version History

### v2.2 (Current)
- Enhanced BNBC setback calculation logic.
- Improved 3D rendering stability for complex balcony designs.
- Added Bengali language support for AI structural recommendations.
- Updated PWD rate schedule database (October 2026).

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---
*Developed for the Bangladesh Civil Engineering & Architecture community.*
