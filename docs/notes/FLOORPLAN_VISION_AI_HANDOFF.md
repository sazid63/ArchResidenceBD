# Floor Plan Curation Task — Handoff for a Vision AI

## Context
I'm building **ArchResidenceBD**, a React app that generates 3D residential buildings for Bangladesh. It needs a **curated preset library of REAL 2D floor plan images** (architectural drawings, not building photos), organized into exactly 3 categories:

1. **1-unit** — floor plan with a single apartment/house unit per floor
2. **2-unit** — floor plan with exactly two units per floor
3. **2+ unit** — floor plan with three or more units per floor

Each plan will become a preset in the app. Users pick a category (or let the app pick randomly), and the plan image is shown in the UI + used as the basis for generating a parametric 3D building.

## Your Task
For each of the 61 source links below:

1. **Open the link** (or the Pinterest pin it points to) and **look at the actual image(s) shown there**.
2. **KEEP it only if ALL of these are true:**
   - It is a **2D floor plan / architectural drawing** (plan view with room outlines, dimensions, room labels).
   - It is a **residential** plan (house or apartment), Bangladesh context preferred but any country acceptable.
   - You can clearly see and count the **number of units** in the drawing.
3. **REJECT (mark as SKIP) if:**
   - It is a building photo, 3D render, exterior/facade image, or elevation.
   - It is a website homepage/blog article with no floor plan drawing visible.
   - The unit count is ambiguous or the drawing is illegible.
4. For each KEEP, record:
   - **ID** (from the table below)
   - **Category** (1-unit / 2-unit / 2+ unit) based on what you actually count
   - **Direct image URL** of the floor plan drawing (the actual .jpg/.png/.webp file if you can find it, not the page URL)
   - **One-line description** (e.g., "2 units, 3 bed + 2 bed each, 50x40 ft plot")
5. **Download** every kept floor plan image to this folder:
   `C:\1_SAJID\ArchResidenceBD\repo\public\assets\floorplans\`
   - Name the files exactly: `<ID>.jpg` (or .png), e.g. `bd-1u-001.jpg`
   - Overwrite existing files with the same name (old files are being replaced).

## Deliverable Format
When done, return a table:

| ID | Category | Image File Saved | Description | Status |
|----|----------|------------------|-------------|--------|
| bd-1u-001 | 1-unit | bd-1u-001.jpg | 4BR, 1561 sqft | OK |
| bd-2u-005 | — | — | building render | SKIP |

Plus a final count: how many 1-unit, 2-unit, 2+ unit images were saved.

**Goal: at least 8 images per category** (24+ total). If a category falls short, note it explicitly.

## The 61 Source Links

### Category 1: intended 1-unit (21)
1. bd-1u-001 — https://www.bdhousing.com/details/239531/1561-sft-south-face-single-unit-apt-uttara-dhaka-bangladesh
2. bd-1u-002 — https://pbazaar.com/en/1575-sft-ongoing-single-unit-apartmentflat-at-bashundhara-k-block
3. bd-1u-003 — https://dreamtouch-bd.com/4-bedroom-house-design-in-bangladesh/
4. bd-1u-004 — https://expertinteriorbd.com/modern-house-design-in-bangladesh/
5. bd-1u-005 — https://studioarchifiction.com/house-design-bangladesh/
6. bd-1u-006 — https://clarityarchitects.com/design/23x46_1_unit_floor_plan_dwg_residential_house_design/1490
7. bd-1u-007 — https://fi.pinterest.com/pin/241998179971973411/
8. bd-1u-008 — https://www.facebook.com/homes71/posts/2850-sft-flat-for-sale-at-jolshiri-abashonclose-to-golf-lake-and-parksouth-facin/1549328493878574/
9. bd-1u-009 — https://www.bdhousing.com/details/244466/bddl-shwapno-bilash-2170-sft-4-beds-under-construction-apartment-for-sale-at-bashundhara-r-a
10. bd-1u-010 — https://bikroy.com/mohammadpur/houses-apartments-for-sale/1650-sft-luxury-single-unit-apartment-at-bashundhara-NJaNOwd0S71xWTvvZ764pyR.html
11. bd-1u-011 — https://www.assuregroupbd.com/properties/assure-tasneem-uttara
12. bd-1u-012 — http://www.fairfaceholdingsltd.com/projects/44
13. bd-1u-013 — https://sirajtech.org/product/one-storey-house-plan
14. bd-1u-014 — https://nbconsultant.com.bd/floor-plan-in-bangladesh/
15. bd-1u-015 — https://sirajtech.org/product/one-storey-house-plan
16. bd-1u-016 — https://clarityarchitects.com/design/single_family_residence_cad_plan_dwg/1370
17. bd-1u-017 — https://www.facebook.com/civiltechtime/posts/-autocad-practice-drawing-house-planthis-autocad-practice-drawing-presents-a-wel/1371782311747114/
18. bd-1u-018 — http://www.dwgnet.com/2016/01/single-story-small-house-plan-04/
19. bd-1u-019 — https://www.facebook.com/dwgfiles/posts/typical-apartment-floor-plan-with-1bhk-units-living-dining-and-kitchenexplore-a-/1669891424492068/
20. bd-1u-020 — https://www.firstfloorplan.com/2020/02/single-unit-modern-house-plans.html
21. bd-1u-021 — https://fi.pinterest.com/pin/784400460129764209/

### Category 2: intended 2-unit (20)
22. bd-2u-001 — https://www.firstfloorplan.com/2019/08/village-house-floor-plan-4-bedroom.html
23. bd-2u-002 — https://www.facebook.com/firstfloorplan/
24. bd-2u-003 — https://www.youtube.com/watch?v=30d3qo3t_84
25. bd-2u-004 — https://barirdesign.com/tag/low-cost-house-design-in-bangladesh
26. bd-2u-005 — https://www.facebook.com/cdz.bd/videos/2-unit-house-plan-/2650230328702918/
27. bd-2u-006 — https://www.youtube.com/watch?v=JtMh_-vkewM
28. bd-2u-007 — https://www.tiktok.com/@modern.house.design/video/7312121643038461186
29. bd-2u-008 — https://www.firstfloorplan.com/2020/04/2-unit-apartment-building-floor-plan.html
30. bd-2u-009 — https://www.facebook.com/cdz.bd/posts/2-unit-house-plan-construction-floorplan/1464765582317305/
31. bd-2u-010 — https://www.bdhousing.com/details/243704/lucky-light-house-850-sqft-2-beds-ready-apartment-flats-for-sale-at-ibrahimpur
32. bd-2u-011 — https://www.pinterest.com/ideas/2-unit-house-plans/950467667072/
33. bd-2u-012 — https://www.youtube.com/watch?v=MZmOLnG4JX8
34. bd-2u-013 — https://www.youtube.com/watch?v=dgVxYAY7pTY
35. bd-2u-014 — https://www.facebook.com/cdz.bd/videos/2-unit-house-plan/1135579012077451/
36. bd-2u-015 — https://www.pinterest.com/pin/house-plan-of-1700-sq-ft--336855247138924269/
37. bd-2u-016 — https://designscad.com/downloads/twin-2bhk-residential-unit-floor-plan-with-services-bay/
38. bd-2u-017 — https://www.dreamstime.com/detailed-floor-plan-modern-two-unit-residential-building-architectural-showing-layout-room-dimensions-image431689230
39. bd-2u-018 — https://clarityarchitects.com/design/40x40_2_unit_floor_plan_dwg_residential_building_design/1487
40. bd-2u-019 — https://houseplans.world/items/house-plan-with-double-unit-2bhk-north-facing-home-plan/1564
41. bd-2u-020 — https://www.scribd.com/doc/256453102/Two-Unit-Residential-Building-Plan

### Category 3: intended 2+ unit (20)
42. bd-3u-001 — https://www.facebook.com/firstfloorplan/
43. bd-3u-002 — https://www.firstfloorplan.com/2019/06/small-2-bedroom-house-plans-and-designs.html
44. bd-3u-003 — https://www.facebook.com/cdz.bd/videos/3-unit-house-floor-plan-%E0%A7%A9-%E0%A6%87%E0%A6%89%E0%A6%A8%E0%A6%BF%E0%A6%9F%E0%A7%87%E0%A6%B0-%E0%A6%AC%E0%A6%BE%E0%A6%A1%E0%A6%BC%E0%A6%BF%E0%A6%B0-%E0%A6%A1%E0%A6%BF%E0%A6%9C%E0%A6%BE%E0%A6%87
45. bd-3u-004 — https://www.scribd.com/document/812491357/3-unit-floor-plan
46. bd-3u-005 — https://www.firstfloorplan.com/2019/06/small-2-bedroom-house-plans-and-designs.html
47. bd-3u-006 — https://clarityarchitects.com/design/residential_building_plan_3_unit_autocad_dwg/506
48. bd-3u-007 — https://www.facebook.com/cdz.bd/videos/3-unit-floor-plan-house-plan-design-in-bangladesh-2021/152462490247978/
49. bd-3u-008 — https://www.youtube.com/watch?v=1OFwqGL5n2U
50. bd-3u-009 — https://www.bariplans.com/2022/09/85x30-house-plan-autocad-free-file.html
51. bd-3u-010 — https://cadbull.com/detail/179857/3-BHK-Apartment-Layout-plan-AutoCAD-Drawing-Download-DWG-File
52. bd-3u-011 — https://www.youtube.com/watch?v=gmyt-5R_jD0
53. bd-3u-012 — https://rajmistriy.blogspot.com/2021/12/3unit-House-plan.html
54. bd-3u-013 — https://www.youtube.com/watch?v=3_qcew5zhWs
55. bd-3u-014 — https://www.bdhousing.com/details/240237/1310-sqft-3-beds-ready-apartment-flats-for-sale-at-bashundhara-r-a
56. bd-3u-015 — https://www.firstfloorplan.com/2019/07/3-unit-floor-plan.html
57. bd-3u-016 — https://in.pinterest.com/pin/3-unit-floor-plan--377317275048425947/
58. bd-3u-017 — https://www.bdhousing.com/details/242106/1550-sqft-3-beds-under-construction-flats-for-sale-at-aftab-nagar
59. bd-3u-018 — https://www.facebook.com/groups/civilengineeringclassroom/posts/1813402285880810/
60. bd-3u-019 — https://fi.pinterest.com/pin/784400460129764209/ (comment mentions "3 units semi detached" — verify by looking)
61. bd-3u-020 — https://www.pinterest.com/ideas/bangladesh-house-design-plan/935738105283/ (pick one clear multi-unit plan from this board)

## Important Notes
- The "intended category" labels above come from titles/URLs and are **NOT verified** — you must verify by actually looking at each drawing. If a drawing shows a different unit count, recategorize it (you may renumber IDs, but keep the ID table mapping).
- Prefer images that are **clean plan drawings** (white background, black lines, room labels). Avoid screenshots with heavy watermarks or ads.
- If a page needs login (Facebook, Scribd, TikTok, Pinterest boards), try to find the same plan on a public source; if impossible, mark SKIP with reason "login wall".
- Minimum target: **8 per category** (24+ total saved images).
- Save folder: `C:\1_SAJID\ArchResidenceBD\repo\public\assets\floorplans\`
