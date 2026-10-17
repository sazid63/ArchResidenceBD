# Third-party components & licences

Tracked as part of the $0 / open-source compliance discipline. Bundled components stay unmodified where their licence requires it.

| Component | Role | Licence | Status |
|---|---|---|---|
| FreeCAD | NativeCAD engine (bundled) | LGPL-2.1 (verified) | planned — spike S6 |
| freecad-mcp (neka-nat) | MCP pattern basis (fork) | MIT | planned |
| llama.cpp | Inference runtime | MIT | planned — spike S2 |
| llama-swap | Fleet manager | MIT | planned |
| PyNite | 3D FEM (v1.5 module) | MIT | planned |
| FreeCAD-Reinforcement | Rebar scripting | to verify at integration | planned — spike S5 |
| Qwen3 family (incl. 30B-A3B teacher) | Fleet bases / embedder / reranker | Apache-2.0 | planned |

**In-app licence notices (final build):** required notices are legal text on the app's **Licences** screen (linked from About) plus licence files in the install folder — never branding copy. No "powered by" line anywhere; no UI surface outside the Licences screen names a bundled component (enforced by `tools/ci/brand_guard.py`, which allows only that legal module — ADR-0004).
