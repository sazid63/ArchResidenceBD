# ADR-0004 — Product identity: NativeCAD only; engine notices confined to the Licences screen

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** Owner

## Context

NativeCAD is the product — AI + compliance + workflow + CAD — and the open-source CAD engine is one internal component among many (the way Chromium is one component of Chrome). Owner directive (2026-10-17): the product must never *present itself* as the engine; no "powered by" branding copy, no engine name in UI, generated documents, or installer. The engine is LGPL-2.1, and that licence requires real notices when we redistribute it: a prominent notice that the library is used, its copyright notice among the app's notices, and a copy of the licence text. Branding freedom and licence compliance must both hold. This supersedes the "About attribution" phrasing in plan v1.5 (§3, §5.3, §11, A4, Appendix B) — plan amended as v1.5.1.

## Decision

1. **Branding surfaces are 100 % NativeCAD / ArchResidenceBD**: app UI, splash, About headline, chat, generated drawings/PDF/DXF, installer. The engine name never appears. Enforced by `tools/ci/brand_guard.py` (CI, product source) and in-generator asserts for documents (S3 pattern — W2.5's drawing generator must carry the same guard).
2. **Required LGPL-2.1 notices live on one legal surface**: a **Licences** screen reachable from About, plus licence files shipped in the install folder. Legal text only — component, licence, copyright notice, licence text — never marketing phrasing, never on branding screens.
3. **Internal engineering docs keep upstream naming** (plan, spike evidence, `docs/licenses/THIRD_PARTY.md`, dev scripts): provenance for licence audits and upstream bug reports. Internal docs are not product surfaces.
4. **Embedded engine GUI** (full-CAD tab, S6): branded per plan §5.3 (name / splash / icons / theme); engine-branded dialogs and pages replaced where the branding system allows and catalogued in spike S6; any residual engine strings inside the engine's own deep dialogs are a tracked, measured residue — never in our surfaces.

## Consequences

- About carries no "powered by" line; it links to the Licences screen.
- Brand guard skips exactly one ship path by design: the legal module (`app/src/legal/**`; the installer's `legal/**` when it exists).
- If the owner later wants the engine unnamed even on the Licences screen, that is a licence-compliance deviation requiring explicit owner sign-off — not a branding tweak.
