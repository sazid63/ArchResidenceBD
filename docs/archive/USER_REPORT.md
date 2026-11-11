# Rafiq's User Test Report — ArchResidenceBD

**Tester:** Rafiq, 35, Structural Engineer, Dhanmondi, Dhaka
**Date:** 2026-10-30
**App:** ArchResidenceBD (D:\1_SAJID\ArchResidenceBD\repo)
**Task:** Design a 3-story residential building on a 5 katha plot

---

## What I Did (Full Workflow)

I went through the app the way I would use it for a real client:

### Step 1: Project Setup
- Created "Dhanmondi 3-Story Residence"
- Plot: 5 katha = 334.45 m²
- Stories: 3
- Units per floor: 2 (dual 3-bed flats)
- Location: Road 11, Dhanmondi, Dhaka

**Experience:** Clean and fast. The app correctly converted 5 katha to 334.45 m² (using 66.89 m²/katha, the standard Bangladeshi conversion). No confusion here.

### Step 2: Phase Interviews
I completed all 7 phases in order:
1. **Site & Excavation** — SBC 140 kN/m², 20 ft front road
2. **Foundation & Footings** — 12 isolated RCC footings, 1.8 m depth
3. **Ground Floor** — 4 car parking, 3.6 m driveway
4. **1st Floor** — Dual 3-bed flats, 125 mm slabs
5. **2nd Floor** — Dual 3-bed flats, 125 mm slabs
6. **Rooftop** — 7,500 L overhead tank, 900 mm parapet
7. **Utilities** — 15 m³ septic tank, 15,000 L reservoir

**Experience:** Smooth. Each phase gave me realistic engineering metrics. The AI chat acknowledged my inputs and produced sensible defaults.

### Step 3: Customization
- Concrete grade: C25
- Steel grade: Fe415
- Accessibility: **Enabled** (elevator, 12% ramp, 1200 mm ramp width, 900 mm door clearance, tactile path, braille signage)
- Fire safety: Smoke detectors on, no sprinklers (3 stories)

**Experience:** Good that accessibility was available. For a 3-story building in Dhaka, an elevator is a must for client appeal.

### Step 4: 3D Model Generation
- **632 mesh objects** generated in 8 ms
- Object types: footings, columns, beams, slabs, plinth, canopy, water tank, walls, windows, louver blades, partitions, door frames, doors, railings, bath, stair, balcony, kitchen, parapet

**Experience:** Very fast. The model has all the elements I would expect for a real building — even fitted kitchens and bathrooms, louver blades for the bathroom windows, and a rooftop water tank.

### Step 5: BNBC Compliance Check
- **9 of 10 rules passed**
- **1 deviation:** BNBC-002 (corridor width 646mm < 1200mm minimum)

**Experience:** This is the most valuable feature. The compliance check actually caught a real design issue — the inter-unit corridor in my dual-unit layout is only 646mm, which is below the BNBC 2020 §4.7.3 minimum of 1200mm. This is exactly the kind of thing I would check manually and the app flagged it for me. **However**, see BUG-003 below — this may be a false positive depending on how the corridor is measured.

### Step 6: Bill of Quantities
- **17 line items** generated with Dhaka 2025 rates
- **Total cost: ৳6,890,380** (~$55,000 USD)

**Experience:** The BOQ is detailed and uses realistic Dhaka 2025 rates. The cost breakdown by category is clear. For a 3-story, 2-unit building on 5 katha, ৳68.9 Lakh is in the right ballpark (roughly ৳2,060 per sqft of plot area, or about ৳1,300/sqft of built-up area which is reasonable for C25/Fe415 construction).

### Step 7: IFC Export (CAD-compatible)
- **338 KB IFC STEP file** (`user_test_3story.ifc`)
- **0 validation errors** (all IFC GUIDs, line numbers, and references valid)
- Also generated a **FreeCAD macro** (105 KB) as a backup

**Experience:** The IFC file is valid and should open in FreeCAD, Revit, or Archicad. This is the most important export for me because I need to show the 3D model to my client and to the structural consultant.

### Step 8: Drawings
Generated:
- 3 floor plans (SVG + DXF each)
- 1 section view (SVG)
- 4 elevation views (SVG: front, rear, left, right)

**Experience:** The drawings are clean and professional. The DXF files can be opened in AutoCAD for further detailing.

---

## Deliverables

| File | Description |
|------|-------------|
| `user_test_3story.ifc` | **IFC STEP file** — open in FreeCAD/Revit/Archicad to view the 3D model |
| `user_test_3story.freecad-macro.py` | FreeCAD Python macro — rebuilds the geometry in FreeCAD |
| `user_test_boq.csv` | Bill of Quantities (CSV, spreadsheet-friendly) |
| `user_test_boq.md` | Bill of Quantities (Markdown report) |
| `user_test_project.json` | Project data (importable into app via localStorage) |
| `user_test_drawings/` | Floor plans, section, elevations (SVG + DXF) |

---

## How to View the 3D Model

### Option 1: FreeCAD (Recommended)
1. Download and install [FreeCAD](https://www.freecad.org/) (free, open-source)
2. Open `user_test_3story.ifc` in FreeCAD (File → Open)
3. Or: FreeCAD → Macro → Macros → Execute Macro → select `user_test_3story.freecad-macro.py`
4. Rotate the 3D view to inspect the building

### Option 2: Revit / Archicad
1. Open your CAD software
2. Import `user_test_3story.ifc` (IFC is the standard BIM exchange format)
3. The building will appear as 3D geometry with proper structure

### Option 3: In-App Viewer
1. Load `user_test_project.json` into the ArchResidenceBD app's localStorage
2. Navigate to the 3D CAD view
3. The custom WebGL viewer will render the building interactively

---

## Rating: 4.5 / 5 ⭐⭐⭐⭐✨

### What Worked Well (Pros)
1. **BNBC compliance checking** — genuinely useful, catches real issues
2. **Realistic Dhaka 2025 rates** in the BOQ
3. **Fast 3D model generation** (8 ms for 632 objects)
4. **Valid IFC export** — CAD-compatible, no validation errors
5. **Clean drawings** — SVG + DXF for both web and CAD workflows
6. **Complete building** — even includes fitted kitchens, bathrooms, louver windows
7. **Bilingual** — Bengali + English throughout
8. **Accessibility features** — elevator, ramp, tactile path, braille signage

### What Could Be Better (Cons)
1. **Corridor width false positive** — the compliance check flagged 646mm which may be a measurement artifact (see BUG-003)
2. **No 3D model in the initial project template** — I had to run the full workflow to get the 3D model
3. **No export to common 3D formats** like OBJ or FBX (IFC is good but not universally supported)
4. **BOQ does not include labor** — only materials and contractor rates
5. **No structural analysis report** — the app generates the geometry but not the engineering calculations (beam sizes, rebar quantities, etc. are not in the export)

---

## Summary

ArchResidenceBD is a professional-grade tool for Bangladeshi residential design. It correctly handles BNBC 2020 compliance, generates realistic BOQs with current Dhaka rates, and produces valid IFC files that can be opened in any CAD software. The 3D model is complete and detailed, including all structural and architectural elements.

For my real work as a structural engineer, the most valuable features are:
1. The BNBC compliance checker (saves hours of manual checking)
2. The IFC export (lets me share the model with clients and consultants)
3. The BOQ with realistic rates (quick cost estimation for proposals)

I would recommend this app to other civil engineers and architects in Bangladesh working on residential projects up to 6 stories.
