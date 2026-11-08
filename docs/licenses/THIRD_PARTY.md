# Third-party components and licences

What the app ships, and under which licence. The in-app Licences screen (`src/legal/notices.ts`) must match this table.

| Component | Role | Licence | Status |
|---|---|---|---|
| React, React DOM | User interface library | MIT | bundled |
| Lucide icons (lucide-react) | Interface icons | ISC | bundled |
| Noto Sans, Noto Sans Bengali | Interface fonts, self-hosted | OFL-1.1 | bundled |
| Tailwind CSS | Base stylesheet reset | MIT | bundled |
| Tauri | Windows desktop shell | Apache-2.0 OR MIT | bundled (desktop build) |

Build-time tools (Vite, TypeScript, Vitest, esbuild) are not shipped in the app.

**Removed in v3:** llama.cpp, llama-swap and the Qwen3-based model fleet. The app no longer runs local AI models (BUILD_PLAN.md, decision 2). FreeCAD and PyNite were never bundled; the app writes a FreeCAD macro as text and does not include FreeCAD itself.
