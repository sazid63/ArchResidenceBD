# ADR-0044 — The products are ArchResidenceBD and NativeCAD, and one module owns the brand law

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.13 follow-up (the naming
audit)
**Code:** `core/src/archres_core/cad/brand.py` · `tools/ci/brand_guard.py` ·
`core/tests/test_cad_brand.py` · **Spec:** `docs/spec/naming-and-brand-v0.md`
**Depends on:** W2.5, W2.13, W3.3, W3.7 · plan §3, §5.3 · ADR-0004

## Context

The owner named the products: the **software is ArchResidenceBD** and the **CAD inside it is
NativeCAD** — a specially designed CAD where **locally hosted AI agents make the 3D building
models** ✓. The open-source engine underneath is bundled, unmodified and invisible ✓ (plan §3 ✓,
§5.3 ✓: "the engine is bundled open-source CAD (LGPL-2.1) presented as NativeCAD" ✓).

An audit of the whole repository against that law found the app's surfaces clean ✓ and **three
real defects in the generated documents** ✓ plus one systemic gap ✓ — and a review of the
products' own naming found that the documents named neither product ✓.

## Decisions

1. **One module owns the law.** `archres_core.cad.brand` is the single implementation of "the
   upstream project's name must not appear in a product surface" ✓. The CI guard ✓ and the live
   probes ✓ both call it ✓ — a generator that forgets to strip its output and a document that
   slips through are caught by the **same** check ✓, not by two drifting copies ✓.
2. **The guard scans the shippable set, not just the app.** It used to scan `app/` and
   `installer/` only and trust each generator to police its own output ✓ — the assumption the
   DXF leak slipped through ✓. It now also scans the drawing set ✓, the documents ✓, the
   compliance reports ✓, the prices ✓ and **the engineer pack's contents** ✓ (read out of the
   zip ✓ — the pack *is* the ship list ✓). The vendored addon ✓, the spike evidence ✓, the
   eval manifests ✓ and the scratch tree stay out of scope ✓ — legitimately ✓.
3. **A strip must leave the file sound.** The DXF writer stamps the upstream name into the file
   header ✓; the generator now replaces it with the product's ✓ — and the probe asserts **two**
   things ✓: the name is gone ✓ **and** the DXF still has its sections and its geometry ✓. A
   strip that breaks the file is worse than the leak it hides ✓.
4. **The handoff carries the CAD.** The pack gained the drawings' **DXFs** ✓ — an engineer's
   handoff without the CAD is half a handoff ✓.
5. **A drawing may not mislabel itself.** The W2.5 sheet built the **first** floor and labelled
   it "GROUND FLOOR PLAN" ✓ — a false document ✓, and the no-falsification law is not a rule
   about prices only ✓. The label and the title now come from the storey the design carries ✓.
6. **Each document names the product that made it.** The **drawings** are the CAD's ✓ ("NativeCAD
   <build>" ✓); the **BOQ, the BBS and the reports** are the app's ✓ ("ArchResidenceBD
   <build>" ✓). One name per thing ✓, and the build that produced the file ✓ — which is how
   support works ✓.
7. **The boot report is evidence, and it names no machine.** It records what the engine called
   itself before the branding ✓ — that is the proof the branding works ✓ — and the engine's
   *name* ✓, never a path into someone's machine ✓.
8. **The licence notices are the owner's.** This package is about branding ✓, not licensing ✓ ✓.

## Consequences

- The brand guard is clean over **67 files** ✓ and can no longer be fooled by a generator that
  forgets ✓.
- A DXF, a PDF, an xlsx, an SVG, an HTML page or a PDF in the pack that names the upstream
  project **fails CI** ✓ ✓.
- A sheet cannot call the first floor the ground floor ✓ ✓.
- A document says which product made it ✓ ✓ — and the pack an engineer hands over carries the
  CAD ✓ ✓.
- The upstream project's name still lives where it belongs ✓: the code ✓, the plan ✓, the ADRs
  ✓, the CI ✓, the vendored addon ✓ — provenance ✓, not branding ✓ ✓.
