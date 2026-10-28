<!-- AUTO-GENERATED from spec/flows/phase-flow-book.yaml - do not edit. -->
<!-- Regenerate: uv run --directory core python ../tools/flow/render_book.py -->
<!-- Check freshness: uv run --directory core python ../tools/flow/render_book.py --check -->

# Phase Flow Book — v0.1.0

**Status:** draft — first pass; wording is ours — engineer review pending (ADR-0001, label: "engineer validation pending — Launch Plan")  ·  **Languages:** বাংলা + English (hand-authored — never machine-translated)

The authored BN/EN question sets for every phase (plan §5.5). The machine-readable source of truth is `spec/flows/phase-flow-book.yaml`, validated against `spec/schemas/flow-book.schema.json` in CI. This rendered book is for reading and review. To add or change a question: edit the YAML (a data edit), run the tests, then regenerate this file with `uv run --directory core python ../tools/flow/render_book.py`.

## Coverage

| Flow | Phase kind | Repeats | Questions | Conditional | Essential | Units in play |
|---|---|---|---|---|---|---|
| setup — Project Setup | — | once | 22 | 3 | 6 | `m2`, `m`, `kPa` |
| site-excavation — Site & Excavation | `site_excavation` | once | 7 | 1 | 0 | `m` |
| foundation — Foundation | `foundation` | once | 7 | 1 | 0 | `m` |
| floor — Floor | `floor` | per storey | 9 | 2 | 0 | `m` |
| roof-boundary — Roof & Boundary | `roof_boundary` | once | 7 | 0 | 0 | `m` |
| common-services — Common Services | `common_services` | once | 8 | 0 | 0 | — |
| **Total** | | | **60** | **7** | **6** | |

---

## setup — Project Setup / প্রকল্প সেটআপ

**Repeats:** once · **Units in play:** `m2`, `m`, `kPa`

**Goal (EN):** The basics every phase builds on: where the plot is, how big it is, how many floors, and the facts we should not guess.

**লক্ষ্য (বাংলা):** জমি কোথায়, কত বড়, কত তলা — আর যে তথ্যগুলো অনুমান করা উচিত নয়, সব একসাথে।

### 1. `project-name` — text, essential

- **Ask (EN):** What should we call this project?
- **জিজ্ঞাসা (বাংলা):** এই প্রকল্পের নাম কী হবে?
- **Why:** Used on drawings, reports and the engineer pack.
- **কেন:** ড্রয়িং, রিপোর্ট আর ইঞ্জিনিয়ার প্যাকে এই নামেই থাকবে।
- **Maps to:** `/project/name`
- **If unanswered:** cannot be assumed — the interview keeps it open (other work proceeds with its own flags; nothing stalls)

### 2. `display-units` — choice

- **Ask (EN):** Which units should the app show?
- **জিজ্ঞাসা (বাংলা):** পরিমাপ কোন এককে দেখতে চান?
- **Why:** Land stays in katha/shotok; room sizes follow your choice.
- **কেন:** জমি কাঠা-শতকে দেখানো হবে; ঘরের মাপ আপনার পছন্দের এককে।
- **Maps to:** `/project/displayUnits/area`
- **Options:**
  - `metric` — Metric (m, m²) · মেট্রিক (মিটার, বর্গমিটার)
  - `feet-inch` — Feet–inch (ft, ft²) · ফুট–ইঞ্চি (ফুট, বর্গফুট)
  - `bangla-land` — Bangla land units (katha, shotok) · দেশি একক (কাঠা, শতক)
- **If unanswered:** fixed default → `feet-inch`

### 3. `division` — choice, essential

- **Ask (EN):** Which division is the plot in?
- **জিজ্ঞাসা (বাংলা):** জমিটি কোন বিভাগে?
- **Why:** This decides the approval authority and the seismic zone.
- **কেন:** এখান থেকেই অনুমোদনকারী কর্তৃপক্ষ ও ভূমিকম্পের অঞ্চল ঠিক হবে।
- **Maps to:** `/site/address/division`
- **Options:**
  - `dhaka` — Dhaka · ঢাকা
  - `chattogram` — Chattogram · চট্টগ্রাম
  - `rajshahi` — Rajshahi · রাজশাহী
  - `khulna` — Khulna · খুলনা
  - `barishal` — Barishal · বরিশাল
  - `sylhet` — Sylhet · সিলেট
  - `rangpur` — Rangpur · রংপুর
  - `mymensingh` — Mymensingh · ময়মনসিংহ
- **If unanswered:** cannot be assumed — the interview keeps it open (other work proceeds with its own flags; nothing stalls)

### 4. `district` — text, essential

- **Ask (EN):** Which district?
- **জিজ্ঞাসা (বাংলা):** জেলা কোনটি?
- **Why:** Picks the applicable rule pack.
- **কেন:** জেলা দিয়েই প্রযোজ্য রুল প্যাক বাছা হবে।
- **Maps to:** `/site/address/district`
- **If unanswered:** cannot be assumed — the interview keeps it open (other work proceeds with its own flags; nothing stalls)

### 5. `area-name` — text

- **Ask (EN):** Thana or area name (e.g. Mirpur Section 7)?
- **জিজ্ঞাসা (বাংলা):** থানা বা এলাকার নাম কী (যেমন: মিরপুর ৭ নম্বর সেকশন)?
- **Why:** Goes on documents; also helps fetch local prices.
- **কেন:** কাগজপত্রে এলাকার নাম থাকবে; এলাকার দাম আনতেও লাগে।
- **Maps to:** `/site/address/areaName`
- **If unanswered:** field left empty

### 6. `plot-area` — number, essential

- **Ask (EN):** How big is the plot?
- **জিজ্ঞাসা (বাংলা):** জমির পরিমাণ কত?
- **Why:** FAR, setbacks - everything is calculated from this.
- **কেন:** এফএআর, সেটব্যাক — বাকি সব হিসাবের ভিত্তি এইটাই।
- **Maps to:** `/site/plot/areaSqm`
- **Units:** canonical `m2` · display: sqm, katha, shotok, bigha
- **If unanswered:** cannot be assumed — the interview keeps it open (other work proceeds with its own flags; nothing stalls)

### 7. `plot-frontage` — number

- **Ask (EN):** How long is the road-side edge of the plot (the side facing the access road)?
- **জিজ্ঞাসা (বাংলা):** জমির রাস্তার দিকের দৈর্ঘ্য কত (যে পাশে রাস্তা)?
- **Why:** Decides which side faces the road and how setbacks apply.
- **কেন:** কোন পাশ রাস্তার মুখে থাকবে, আর সেটব্যাক কেমন হবে — সেটা ঠিক করতে দরকার।
- **Maps to:** `/site/plot/frontageM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** field left empty

### 8. `plot-depth` — number

- **Ask (EN):** And the depth, front to back?
- **জিজ্ঞাসা (বাংলা):** আর সামনের দিক থেকে পিছনের দিকের দৈর্ঘ্য কত?
- **Why:** Used to place the building on the site plan.
- **কেন:** সাইট প্ল্যানে ভবনের অবস্থান ঠিক করতে লাগে।
- **Maps to:** `/site/plot/depthM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** field left empty

### 9. `road-width` — number, essential

- **Ask (EN):** How wide is the road in front of the plot?
- **জিজ্ঞাসা (বাংলা):** জমির সামনের রাস্তাটি কত চওড়া?
- **Why:** RAJUK setbacks and height limits depend on the road width.
- **কেন:** রাজউকের সেটব্যাক ও উচ্চসীমা রাস্তার চওড়ার ওপরই নির্ভর করে।
- **Maps to:** `/site/plot/roadWidthM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** cannot be assumed — the interview keeps it open (other work proceeds with its own flags; nothing stalls)

### 10. `corner-plot` — yes_no

- **Ask (EN):** Is it a corner plot (roads on two sides)?
- **জিজ্ঞাসা (বাংলা):** প্লটটি কি কোনায় (দুই পাশে রাস্তা)?
- **Why:** Corner plots can use extra FAR and follow different setbacks - we should not miss that.
- **কেন:** কর্নার প্লটে বাড়তি এফএআর পাওয়া যায়, সেটব্যাকও আলাদা — এটা বাদ পড়া চলবে না।
- **Maps to:** `/site/plot/cornerPlot`
- **If unanswered:** fixed default → `false`

### 11. `existing-structure` — yes_no

- **Ask (EN):** Is there an old building on the plot?
- **জিজ্ঞাসা (বাংলা):** জমিতে পুরনো কোনো ভবন আছে কি?
- **Why:** An old building means demolition steps and extra cost.
- **কেন:** পুরনো ভবন থাকলে ভাঙার কাজ ও বাড়তি খরচ যুক্ত হবে।
- **Maps to:** `/site/plot/existingStructure`
- **If unanswered:** fixed default → `false`

### 12. `authority` — choice

- **Ask (EN):** Which authority approves building plans here?
- **জিজ্ঞাসা (বাংলা):** এখানে বিল্ডিং প্ল্যান কে অনুমোদন করে?
- **Why:** This picks the rule pack for setbacks and FAR.
- **কেন:** এটাই সেটব্যাক-এফএআরের রুল প্যাক ঠিক করবে।
- **Maps to:** `/site/jurisdiction/authority` · **Source:** registry
- **Options:**
  - `rajuk` — RAJUK · রাজউক (RAJUK)
  - `dncc` — DNCC (Dhaka North City) · ঢাকা উত্তর সিটি কর্পোরেশন (DNCC)
  - `dscc` — DSCC (Dhaka South City) · ঢাকা দক্ষিণ সিটি কর্পোরেশন (DSCC)
  - `ccc` — CCC (Chattogram City) · চট্টগ্রাম সিটি কর্পোরেশন (CCC)
  - `cda` — CDA (Chattogram Development) · সিডিএ (CDA)
  - `kda` — KDA (Khulna Development) · খুলনা উন্নয়ন কর্তৃপক্ষ (KDA)
  - `rda` — RDA (Rajshahi Development) · রাজশাহী উন্নয়ন কর্তৃপক্ষ (RDA)
  - `scc` — SCC (Sylhet City) · সিলেট সিটি কর্পোরেশন (SCC)
  - `paurashava` — Paurashava (municipality) · পৌরসভা
  - `other` — Other authority · অন্য কোনো কর্তৃপক্ষ
  - `not-sure` — Not sure - work it out for me · জানি না — অ্যাপ মিলিয়ে দেখবে
- **If unanswered:** Source Registry → `derived-from-location`
  - **Assumption (EN):** Authority derived from the location by the rule pack - confirm before submitting for approval.
  - **অনুমান (বাংলা):** অবস্থান দেখে কর্তৃপক্ষ অনুমান করা হয়েছে — অনুমোদনের আবেদনের আগে নিশ্চিত করে নিন।

### 13. `storeys-count` — integer, essential

- **Ask (EN):** How many floors in total, including the ground floor?
- **জিজ্ঞাসা (বাংলা):** মোট কত তলা হবে (নিচতলাসহ)?
- **Why:** Here G+2 means ground + 2 = 3 floors in total.
- **কেন:** এখানে G+2 মানে নিচতলা + ২ = মোট ৩ তলা।
- **Maps to:** `/building/storeys/count`
- **If unanswered:** cannot be assumed — the interview keeps it open (other work proceeds with its own flags; nothing stalls)

### 14. `has-basement` — yes_no

- **Ask (EN):** Do you want a basement?
- **জিজ্ঞাসা (বাংলা):** বেসমেন্ট রাখবেন কি?
- **Why:** A basement changes excavation, waterproofing and cost a lot.
- **কেন:** বেসমেন্ট খনন, ওয়াটারপ্রুফিং আর খরচ — সব অনেকখানি বদলে দেয়।
- **Maps to:** `/building/storeys/hasBasement`
- **If unanswered:** fixed default → `false`

### 15. `units-per-floor` — integer

- **Ask (EN):** How many flats or units per floor?
- **জিজ্ঞাসা (বাংলা):** প্রতি তলায় কতটি ফ্ল্যাট বা ইউনিট থাকবে?
- **Why:** Family houses are usually one unit per floor; more units change layouts and services.
- **কেন:** পারিবারিক বাড়িতে সাধারণত প্রতি তলায় এক ইউনিট; একাধিক হলে নকশা ও সেবা বদলায়।
- **Maps to:** `/building/unitsPerFloor`
- **If unanswered:** fixed default → `1`

### 16. `ground-floor-usage` — choice

- **Ask (EN):** How will the ground floor be used?
- **জিজ্ঞাসা (বাংলা):** নিচতলাটি কীভাবে ব্যবহার হবে?
- **Why:** Parking or mixed use changes the layout and fire rules.
- **কেন:** পার্কিং বা মিশ্র ব্যবহারে নকশা আর অগ্নিনিরাপত্তার নিয়ম বদলায়।
- **Maps to:** `/building/groundFloorUsage`
- **Options:**
  - `residential` — Living space · থাকার জন্য
  - `parking` — Parking · পার্কিং
  - `mixed` — Mixed (some living, some parking/shops) · মিশ্র (কিছু থাকা, কিছু পার্কিং/দোকান)
- **If unanswered:** fixed default → `residential`

### 17. `typical-unit-area` — number

- **Ask (EN):** Roughly how big should each flat be (e.g. 1200 sq ft)?
- **জিজ্ঞাসা (বাংলা):** প্রতি ফ্ল্যাটের আনুমানিক আয়তন কত (যেমন ১২০০ বর্গফুট)?
- **Why:** Helps the layout generation; can be adjusted later.
- **কেন:** নকশা বানানোর জন্য দরকার; পরে বদলানো যাবে।
- **Maps to:** `/building/typicalUnitAreaSqm`
- **Units:** canonical `m2` · display: sqm, sqft
- **If unanswered:** field left empty

### 18. `material-prices` — yes_no

- **Ask (EN):** Do you already have current material prices (cement, rod, sand, stone)?
- **জিজ্ঞাসা (বাংলা):** উপকরণের বর্তমান দাম কি আপনার কাছে আছে (সিমেন্ট, রড, বালি, পাথর)?
- **Why:** If not, we fetch the latest prices for your area and show the date of every price.
- **কেন:** না থাকলে আপনার এলাকার সর্বশেষ দাম এনে দেব — প্রতিটি দামের তারিখসহ।
- **Maps to:** `/pricing/source` · **Source:** registry
- **If unanswered:** Source Registry → `fetched`
  - **Assumption (EN):** Market prices are fetched for your area and dated - review them before ordering.
  - **অনুমান (বাংলা):** বাজারের দাম আপনার এলাকার জন্য আনা হবে, তারিখসহ — অর্ডার দেওয়ার আগে মিলিয়ে নিন।

### 19. `soil-has-report` — yes_no

- **Ask (EN):** Do you have a soil test report?
- **জিজ্ঞাসা (বাংলা):** মাটি পরীক্ষার রিপোর্ট আছে কি (সয়েল টেস্ট)?
- **Why:** Bearing capacity decides the foundation - without a report we assume the safe area default and flag it clearly.
- **কেন:** মাটির বহন ক্ষমতাই ফাউন্ডেশন ঠিক করে — রিপোর্ট না থাকলে এলাকার নিরাপদ ডিফল্ট ধরে নিয়ে সেটা স্পষ্টভাবে জানাব।
- **Maps to:** `/site/soil/status`
- **If unanswered:** conservative area default → `area_default`
  - **Assumption (EN):** No soil report - using the conservative area default (SBC 65 kPa). This is an assumption - verify on site.
  - **অনুমান (বাংলা):** মাটি পরীক্ষার রিপোর্ট নেই — এলাকার রক্ষণশীল ডিফল্ট ধরা হচ্ছে (SBC ৬৫ kPa)। এটি একটি অনুমান — সাইটে যাচাই করুন।

### 20. `soil-report-file` — file

- **Ask (EN):** Attach the report (photo/PDF) - or tell me the key numbers in the next questions.
- **জিজ্ঞাসা (বাংলা):** রিপোর্টটি সংযুক্ত করুন (ছবি/পিডিএফ) — অথবা পরের প্রশ্নগুলোতে মূল সংখ্যাগুলো বলুন।
- **Why:** The report stays with the project for the engineer pack.
- **কেন:** রিপোর্টটি প্রকল্পের সাথেই থাকবে — ইঞ্জিনিয়ার প্যাকে লাগবে।
- **Maps to:** `/site/soil/reportRef`
- **When:** `soil-has-report == yes`
- **If unanswered:** field left empty

### 21. `soil-sbc` — number

- **Ask (EN):** What does the report say for safe bearing capacity (SBC)?
- **জিজ্ঞাসা (বাংলা):** রিপোর্টে মাটি বহন ক্ষমতা (SBC) কত লেখা আছে?
- **Why:** Straight from the report - no guessing needed.
- **কেন:** রিপোর্ট থেকেই নিচ্ছি — অনুমান লাগবে না।
- **Maps to:** `/site/soil/sbcKpa`
- **Units:** canonical `kPa` · display: (canonical only)
- **When:** `soil-has-report == yes`
- **If unanswered:** field left empty

### 22. `soil-groundwater` — number

- **Ask (EN):** And the groundwater depth mentioned in the report?
- **জিজ্ঞাসা (বাংলা):** ভূগর্ভস্থ পানির স্তরের গভীরতা কত লেখা আছে রিপোর্টে?
- **Why:** Water close to the surface changes excavation and dewatering.
- **কেন:** পানি বেশি উপরে থাকলে খনন ও পানি সরানোর ব্যবস্থা বদলায়।
- **Maps to:** `/site/soil/groundwaterDepthM`
- **Units:** canonical `m` · display: m, ft
- **When:** `soil-has-report == yes`
- **If unanswered:** field left empty

## site-excavation — Site & Excavation / সাইট ও খনন

**Phase kind:** `site_excavation` · **Repeats:** once · **Units in play:** `m`

**Goal (EN):** Plan the digging: old structures, neighbours, machinery access, and where the soil goes.

**লক্ষ্য (বাংলা):** খননের পরিকল্পনা: পুরনো কাঠামো, পাশের বাড়ি, মেশিনের যাতায়াত আর মাটির ব্যবস্থাপনা।

### 1. `old-building-action` — choice

- **Ask (EN):** The old building - demolish it all, or keep part of it?
- **জিজ্ঞাসা (বাংলা):** পুরনো ভবনটি — সম্পূর্ণ ভাঙবেন, নাকি কিছুটা রেখে দেবেন?
- **Why:** Keeping part can reuse old foundations, but makes excavation more complex.
- **কেন:** আংশিক রাখলে পুরনো ফাউন্ডেশন কাজে লাগতে পারে, তবে খনন জটিল হয়।
- **Maps to:** `/phases/site-excavation/data/existingStructureAction`
- **Options:**
  - `demolish-full` — Demolish everything · সম্পূর্ণ ভাঙা হবে
  - `demolish-partial` — Keep some of it · কিছু অংশ রাখা হবে
  - `not-sure` — Not sure - advise me · নিশ্চিত নই — পরামর্শ দিন
- **When:** `existing-structure == yes`
- **If unanswered:** fixed default → `demolish-full`

### 2. `keep-boundary-wall` — yes_no

- **Ask (EN):** Is there an old boundary wall worth keeping?
- **জিজ্ঞাসা (বাংলা):** রাখার মতো পুরনো সীমানা প্রাচীর আছে কি?
- **Why:** Keeping it saves cost, but it must survive the excavation vibration.
- **কেন:** রাখলে খরচ বাঁচে, তবে খননের কম্পন সহ্য করতে হবে।
- **Maps to:** `/phases/site-excavation/data/keepBoundaryWall`
- **If unanswered:** fixed default → `false`

### 3. `adjacent-close` — yes_no

- **Ask (EN):** Are neighbouring buildings very close (within about 1 m)?
- **জিজ্ঞাসা (বাংলা):** পাশের বাড়িগুলো কি খুব কাছে (প্রায় ১ মিটারের মধ্যে)?
- **Why:** Close neighbours need shoring and crack checks - unless you say otherwise we stay on the safe side.
- **কেন:** বাড়ি কাছে থাকলে শোরিং ও ফাটল মনিটরিং লাগে — আপনি না বললে আমরা নিরাপদ দিকেই থাকব।
- **Maps to:** `/phases/site-excavation/data/adjacentStructuresClose`
- **If unanswered:** fixed default → `true`
  - **Assumption (EN):** Adjacent buildings assumed within ~1 m - conservative for shoring design.
  - **অনুমান (বাংলা):** পাশের বাড়ি ১ মিটারের মধ্যে ধরা হচ্ছে — শোরিং নকশায় নিরাপদ অনুমান।

### 4. `excavation-depth-req` — number

- **Ask (EN):** Do you already know a required excavation depth (e.g. for a basement or septic tank)?
- **জিজ্ঞাসা (বাংলা):** খননের গভীরতা আগেই জানা আছে কি (যেমন বেসমেন্ট বা সেপটিক ট্যাংকের জন্য)?
- **Why:** Otherwise the app derives the depth from the foundation design.
- **কেন:** না জানা থাকলে অ্যাপ ফাউন্ডেশনের নকশা থেকেই গভীরতা বের করবে।
- **Maps to:** `/phases/site-excavation/data/excavationDepthM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** derived from other fields

### 5. `machinery-access` — choice

- **Ask (EN):** Can a mixer truck or pile rig reach the site easily?
- **জিজ্ঞাসা (বাংলা):** মিক্সার ট্রাক বা পাইল মেশিন সহজে সাইটে আসতে পারবে?
- **Why:** Access decides whether concrete is machine-mixed on site or carried in.
- **কেন:** যাতায়াত ঠিক করে দেয় — কংক্রিট সাইটেই মেশিনে হবে, নাকি বাইরে থেকে বানিয়ে আনতে হবে।
- **Maps to:** `/phases/site-excavation/data/machineryAccess`
- **Options:**
  - `easy` — Easily · অনায়াসে পারবে
  - `partial` — Narrow but passable · মোটামুটি — সরু পথ, তবে পারবে
  - `difficult` — Difficult - hand carrying · কঠিন — হাতে করে আনতে হবে
- **If unanswered:** fixed default → `partial`

### 6. `spoil-disposal` — choice

- **Ask (EN):** Excavated soil - use it on site, or take it away?
- **জিজ্ঞাসা (বাংলা):** খননের মাটি সাইটেই কাজে লাগাবেন, নাকি সরিয়ে নেবেন?
- **Why:** This sets the soil-carriage cost and where the mound goes on site.
- **কেন:** এটা মাটি সরানোর খরচ আর সাইটে স্তূপের জায়গা — দুইটাই ঠিক করে।
- **Maps to:** `/phases/site-excavation/data/spoilDisposal`
- **Options:**
  - `keep-on-site` — Keep and use on site · সাইটেই কাজে লাগাব
  - `remove-off-site` — Take it away · সরিয়ে নিতে হবে
  - `not-decided` — Not decided yet · এখনও ঠিক করিনি
- **If unanswered:** fixed default → `remove-off-site`

### 7. `boundary-markers` — yes_no

- **Ask (EN):** Are there survey pillars or boundary markers to protect?
- **জিজ্ঞাসা (বাংলা):** রাখার মতো জরিপের পিলার বা সীমানা চিহ্ন আছে কি?
- **Why:** Disturbing them starts land disputes - we plan around them.
- **কেন:** এগুলো নষ্ট হলে জমি নিয়ে ঝামেলা বাধে — আমরা এড়িয়ে পরিকল্পনা করব।
- **Maps to:** `/phases/site-excavation/data/protectBoundaryMarkers`
- **If unanswered:** fixed default → `true`

## foundation — Foundation / ফাউন্ডেশন

**Phase kind:** `foundation` · **Repeats:** once · **Units in play:** `m`

**Goal (EN):** Settle the foundation: soil capacity, the system choice, and the details that keep it safe.

**লক্ষ্য (বাংলা):** ফাউন্ডেশন ঠিক করা: মাটির ক্ষমতা, ধরন বাছাই আর নিরাপত্তার খুঁটিনাটি।

### 1. `foundation-system` — choice

- **Ask (EN):** Any preference for the foundation type - or should the app decide from the soil?
- **জিজ্ঞাসা (বাংলা):** ফাউন্ডেশনের ধরন নিয়ে কোনো পছন্দ আছে — নাকি মাটি দেখে অ্যাপ ঠিক করবে?
- **Why:** The app picks from bearing capacity and load; you can always override later.
- **কেন:** মাটি ও লোড মিলিয়ে অ্যাপ ঠিক করবে; পরে চাইলে বদলাতে পারবেন।
- **Maps to:** `/phases/foundation/data/foundationSystem`
- **Options:**
  - `app-decides` — Let the app decide (recommended) · অ্যাপ ঠিক করবে (প্রস্তাবিত)
  - `pile` — Pile foundation · পাইল ফাউন্ডেশন
  - `raft` — Raft (mat) foundation · রাফট (ম্যাট) ফাউন্ডেশন
  - `footing` — Isolated or combined footing · আইসোলেটেড বা কম্বাইন্ড ফুটিং
- **If unanswered:** fixed default → `app-decides`

### 2. `pile-preference` — choice

- **Ask (EN):** Which pile type?
- **জিজ্ঞাসা (বাংলা):** পাইলের ধরন কোনটি?
- **Why:** Driven piles are cheaper but noisy; bored piles are better near close neighbours.
- **কেন:** ড্রাইভেন পাইল সস্তা কিন্তু শব্দ বেশি; কাছে বাড়ি থাকলে বোরড পাইল ভালো।
- **Maps to:** `/phases/foundation/data/pileTypePref`
- **Options:**
  - `no-preference` — No preference · পছন্দ নেই
  - `driven` — Driven pile · ড্রাইভেন পাইল (ঠুকে বসানো)
  - `bored` — Bored pile (cast in hole) · বোরড পাইল (কুয়া করে ঢালা)
- **When:** `foundation-system == pile`
- **If unanswered:** fixed default → `no-preference`

### 3. `rebar-grade` — choice

- **Ask (EN):** Which rebar grade should we use?
- **জিজ্ঞাসা (বাংলা):** রিবারের গ্রেড কোনটি নেব?
- **Why:** 60 grade (B500) is the everyday standard; higher grade only if it is easy to source.
- **কেন:** ৬০ গ্রেড (B500) সাধারণ মান; বেশি গ্রেড তখনই, যদি সহজে জোগাড় হয়।
- **Maps to:** `/phases/foundation/data/rebarGradePref`
- **Options:**
  - `app-decides` — Let the app decide · অ্যাপ ঠিক করবে
  - `grade60` — 60 grade (B500) · ৬০ গ্রেড (B500)
  - `grade72` — 72.5 grade (B600), if available · ৭২.৫ গ্রেড (B600) — এলাকায় পেলে
- **If unanswered:** fixed default → `app-decides`

### 4. `water-hit-digging` — yes_no

- **Ask (EN):** While digging (or in an old well), did you see water rising?
- **জিজ্ঞাসা (বাংলা):** খনন করতে গিয়ে (বা পুরনো কূপে) পানি উঠতে দেখেছেন কি?
- **Why:** Water near the surface changes the foundation approach and the dewatering needs.
- **কেন:** ভূপৃষ্ঠের কাছে পানি থাকলে ফাউন্ডেশনের পদ্ধতি আর পানি সরানোর ব্যবস্থা বদলায়।
- **Maps to:** `/phases/foundation/data/waterHitWhileDigging`
- **If unanswered:** field left empty

### 5. `anti-termite` — yes_no

- **Ask (EN):** Apply anti-termite treatment under the plinth?
- **জিজ্ঞাসা (বাংলা):** প্লিন্থের নিচে উইপোকা-প্রতিরোধক (অ্যান্টি-টার্মাইট) দেব?
- **Why:** Small cost now, big cost later - standard practice in Bangladesh.
- **কেন:** এখন খরচ সামান্য, পরে করলে অনেক বেশি — আমাদের এখানে এটাই প্রচলিত।
- **Maps to:** `/phases/foundation/data/antiTermite`
- **If unanswered:** fixed default → `true`

### 6. `depth-constraint` — number

- **Ask (EN):** Any limit on how deep we can dig (e.g. a neighbour's foundation depth, or the party wall condition)?
- **জিজ্ঞাসা (বাংলা):** গভীরে খোঁড়ার কোনো সীমাবদ্ধতা আছে কি (যেমন পাশের বাড়ির ফাউন্ডেশনের গভীরতা বা পার্টি ওয়ালের অবস্থা)?
- **Why:** Digging deep beside old footings can weaken them.
- **কেন:** পুরনো ফাউন্ডেশনের পাশে বেশি গভীরে খুঁড়লে সেগুলো দুর্বল হয়ে যেতে পারে।
- **Maps to:** `/phases/foundation/data/depthConstraintM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** field left empty

### 7. `plinth-height` — number

- **Ask (EN):** How high should the plinth be above road level?
- **জিজ্ঞাসা (বাংলা):** রাস্তার স্তর থেকে প্লিন্থ কত উঁচু হবে?
- **Why:** It keeps flood water out; 2 ft (0.61 m) is the common default.
- **কেন:** বন্যার পানি থেকে বাঁচায়; সাধারণত ২ ফুট (০.৬১ মিটার) ডিফল্ট ধরা হয়।
- **Maps to:** `/phases/foundation/data/plinthHeightM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** fixed default → `0.61`

## floor — Floor / তলা

**Phase kind:** `floor` · **Repeats:** per storey - asked once for each floor (`floor-0` ... `floor-<n-1>`; storeyIndex 0 = ground floor). Phase payloads write to `/phases/floor-<n>/data/...` · **Units in play:** `m`

**Goal (EN):** Shape this floor: heights, units, rooms, balcony, and the services it needs.

**লক্ষ্য (বাংলা):** এই তলার নকশা: উচ্চতা, ইউনিট, ঘর, বারান্দা আর প্রয়োজনীয় সেবা।

### 1. `ground-floor-height` — number

- **Ask (EN):** How tall should the ground floor be (floor to floor)?
- **জিজ্ঞাসা (বাংলা):** নিচতলার উচ্চতা কত হবে (মেঝে থেকে মেঝে)?
- **Why:** Parking or shops need more height; 3 m is the everyday default.
- **কেন:** পার্কিং বা দোকান হলে বেশি উচ্চতা লাগে; সাধারণত ৩ মিটার ধরা হয়।
- **Maps to:** `/building/storeys/groundFloorHeightM`
- **Units:** canonical `m` · display: m, ft
- **When:** `storeyIndex == 0`
- **If unanswered:** fixed default → `3.0`

### 2. `typical-floor-height` — number

- **Ask (EN):** How tall is this floor (floor to floor)?
- **জিজ্ঞাসা (বাংলা):** এই তলার উচ্চতা কত (মেঝে থেকে মেঝে)?
- **Why:** 3 m (about 10 ft) is the common choice - comfortable ceilings without wasted cost.
- **কেন:** ৩ মিটার (প্রায় ১০ ফুট) বেশি প্রচলিত — ছাদ আরামদায়ক থাকে, খরচও বাড়ে না।
- **Maps to:** `/building/storeys/typicalFloorHeightM`
- **Units:** canonical `m` · display: m, ft
- **When:** `storeyIndex > 0`
- **If unanswered:** fixed default → `3.0`

### 3. `floor-usage` — choice

- **Ask (EN):** What will this floor be used for?
- **জিজ্ঞাসা (বাংলা):** এই তলাটি কী কাজে ব্যবহার হবে?
- **Why:** Usage changes layouts, fire rules and loads.
- **কেন:** ব্যবহার অনুযায়ী নকশা, অগ্নিনিয়ম আর লোড বদলায়।
- **Maps to:** `/phases/floor-<n>/data/usage`
- **Options:**
  - `residential` — Living space · থাকার জন্য
  - `parking` — Parking · পার্কিং
  - `mixed` — Mixed · মিশ্র
- **If unanswered:** fixed default → `residential`

### 4. `units-override` — integer

- **Ask (EN):** How many units on this floor (if different from the building default)?
- **জিজ্ঞাসা (বাংলা):** এই তলায় কতটি ইউনিট (বিল্ডিংয়ের ডিফল্টের চেয়ে আলাদা হলে বলুন)?
- **Why:** Left alone, it follows the building setting.
- **কেন:** না বললে বিল্ডিংয়ের সেটিংই ধরে নেওয়া হবে।
- **Maps to:** `/phases/floor-<n>/data/unitsPerFloor`
- **If unanswered:** derived from other fields → `<building.unitsPerFloor>`

### 5. `bedrooms-per-unit` — integer

- **Ask (EN):** How many bedrooms per unit?
- **জিজ্ঞাসা (বাংলা):** প্রতি ইউনিটে কত বেডরুম?
- **Why:** This drives the room layout; 3 bedrooms is the common family flat here.
- **কেন:** এটা দিয়েই ঘরের বিন্যাস তৈরি হবে; আমাদের এখানে ৩ বেডরুমই বেশি প্রচলিত।
- **Maps to:** `/phases/floor-<n>/data/bedroomsPerUnit`
- **If unanswered:** fixed default → `3`

### 6. `attached-bath` — yes_no

- **Ask (EN):** Attached bathroom with every bedroom?
- **জিজ্ঞাসা (বাংলা):** প্রতিটি বেডরুমে অ্যাটাচড বাথরুম থাকবে?
- **Why:** It is the norm now; plumbing costs a little more.
- **কেন:** এখন এটাই চালু; প্লাম্বিং খরচ একটু বাড়ে।
- **Maps to:** `/phases/floor-<n>/data/attachedBathPerBedroom`
- **If unanswered:** fixed default → `true`

### 7. `balcony` — choice

- **Ask (EN):** Balcony preference?
- **জিজ্ঞাসা (বাংলা):** বারান্দা কেমন চান?
- **Why:** Front-only keeps cost down; a back balcony helps the kitchen and drying clothes.
- **কেন:** শুধু সামনে থাকলে খরচ কম; পিছনেরটা রান্নাঘর আর কাপড় শুকাতে সুবিধা।
- **Maps to:** `/phases/floor-<n>/data/balcony`
- **Options:**
  - `front-only` — Front only · শুধু সামনে
  - `front-and-back` — Front and back · সামনে ও পিছনে
  - `none` — No balcony · বারান্দা লাগবে না
- **If unanswered:** fixed default → `front-only`

### 8. `kitchen-pref` — choice

- **Ask (EN):** Any preference for the kitchen side?
- **জিজ্ঞাসা (বাংলা):** রান্নাঘর কোন দিকে চান?
- **Why:** You keep your preference as long as gas and ventilation work out.
- **কেন:** গ্যাস আর বাতাসের ব্যবস্থা ঠিক থাকলে আপনার পছন্দই থাকবে।
- **Maps to:** `/phases/floor-<n>/data/kitchenPref`
- **Options:**
  - `no-preference` — No preference · পছন্দ নেই
  - `east` — East · পূর্ব
  - `west` — West · পশ্চিম
  - `north` — North · উত্তর
  - `south` — South · দক্ষিণ
- **If unanswered:** fixed default → `no-preference`

### 9. `mep-points-note` — text

- **Ask (EN):** Anything special for electrical or plumbing on this floor (extra AC points, geyser, water points)?
- **জিজ্ঞাসা (বাংলা):** এই তলায় বৈদ্যুতিক বা প্লাম্বিংয়ে বিশেষ কিছু লাগবে (বাড়তি এসি পয়েন্ট, গিজার, পানির পয়েন্ট)?
- **Why:** Points go into the design now - not added after casting.
- **কেন:** কাস্টিংয়ের পরে নয় — নকশাতেই পয়েন্টগুলো ধরা থাকবে।
- **Maps to:** `/phases/floor-<n>/data/mepNotes`
- **If unanswered:** field left empty

## roof-boundary — Roof & Boundary / ছাদ ও সীমানা প্রাচীর

**Phase kind:** `roof_boundary` · **Repeats:** once · **Units in play:** `m`

**Goal (EN):** Finish the top and the edge: roof use, tank, solar, parapet, boundary wall and gate.

**লক্ষ্য (বাংলা):** ছাদ আর চারপাশ গুছিয়ে ফেলা: ছাদের ব্যবহার, ট্যাংক, সোলার, প্যারাপেট, সীমানা প্রাচীর আর ফটক।

### 1. `roof-type` — choice

- **Ask (EN):** What kind of roof do you want?
- **জিজ্ঞাসা (বাংলা):** ছাদ কেমন হবে?
- **Why:** A usable roof needs finishes, railings and a stronger slab.
- **কেন:** ব্যবহারযোগ্য ছাদে ফিনিশ, রেলিং আর মজবুত স্ল্যাব লাগে।
- **Maps to:** `/phases/roof-boundary/data/roofType`
- **Options:**
  - `flat-accessible` — Flat, usable (family use) · সমান — পরিবার ব্যবহার করবে
  - `flat-utility` — Flat, utility only · সমান — শুধু কারিগরি কাজে
  - `sloped` — Sloped (tin, etc.) · ঢালু (টিন ইত্যাদি)
- **If unanswered:** fixed default → `flat-accessible`

### 2. `overhead-tank` — yes_no

- **Ask (EN):** Water tank on the roof?
- **জিজ্ঞাসা (বাংলা):** ছাদে পানির ট্যাংক থাকবে?
- **Why:** The slab must be designed for the tank's weight.
- **কেন:** ট্যাংকের ভার ধরে স্ল্যাবের নকশা করতে হয়।
- **Maps to:** `/phases/roof-boundary/data/overheadTankOnRoof`
- **If unanswered:** fixed default → `true`

### 3. `solar-provision` — yes_no

- **Ask (EN):** Planning solar panels for later?
- **জিজ্ঞাসা (বাংলা):** পরে সোলার প্যানেল বসানোর পরিকল্পনা আছে?
- **Why:** Conduit and base provisions now cost a fraction of retrofitting later.
- **কেন:** এখনই তার আর বেসের ব্যবস্থা রাখলে পরে খরচ অনেক কম।
- **Maps to:** `/phases/roof-boundary/data/solarProvisions`
- **If unanswered:** fixed default → `false`

### 4. `parapet-height` — number

- **Ask (EN):** How high should the roof parapet be?
- **জিজ্ঞাসা (বাংলা):** ছাদের চারপাশের প্যারাপেট কত উঁচু?
- **Why:** 3 ft 6 in (1.07 m) is the common, code-friendly choice.
- **কেন:** ৩ ফুট ৬ ইঞ্চি (১.০৭ মিটার) সাধারণ ও নিয়মসম্মত।
- **Maps to:** `/phases/roof-boundary/data/parapetHeightM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** fixed default → `1.07`

### 5. `boundary-wall-height` — number

- **Ask (EN):** How high should the boundary wall be?
- **জিজ্ঞাসা (বাংলা):** সীমানা প্রাচীর কত উঁচু হবে?
- **Why:** 6 ft is typical; higher walls need a thicker, braced design.
- **কেন:** সাধারণত ৬ ফুট; বেশি উঁচু হলে বাড়তি ডিজাইন লাগে।
- **Maps to:** `/phases/roof-boundary/data/boundaryWallHeightM`
- **Units:** canonical `m` · display: m, ft
- **If unanswered:** fixed default → `1.83`

### 6. `boundary-gate` — choice

- **Ask (EN):** Main gate - one wide gate, or a gate plus a small door?
- **জিজ্ঞাসা (বাংলা):** প্রধান ফটক — একটি চওড়া গেট, নাকি গেটের সাথে ছোট দরজা?
- **Why:** The small door is handy every day; the wide gate is for vehicles and materials.
- **কেন:** ছোট দরজা প্রতিদিনের চলাচলে সুবিধা; চওড়া গেট গাড়ি আর মালামালের জন্য।
- **Maps to:** `/phases/roof-boundary/data/boundaryGate`
- **Options:**
  - `gate-and-door` — Gate + small door · গেট + ছোট দরজা
  - `gate-only` — One wide gate only · শুধু চওড়া গেট
  - `not-sure` — Decide later · পরে ঠিক করব
- **If unanswered:** fixed default → `gate-and-door`

### 7. `roof-access` — choice

- **Ask (EN):** Should the stairs reach the roof?
- **জিজ্ঞাসা (বাংলা):** সিঁড়ি কি ছাদ পর্যন্ত যাবে?
- **Why:** With only a hatch, tank and solar maintenance gets awkward.
- **কেন:** শুধু হ্যাচ থাকলে ট্যাংক বা সোলারের কাজে ওঠানামা কষ্টকর হয়।
- **Maps to:** `/phases/roof-boundary/data/roofAccess`
- **Options:**
  - `stairs-reach` — Yes, stairs reach the roof · হ্যাঁ — সিঁড়ি ছাদ পর্যন্ত
  - `hatch-only` — No, hatch only · না — শুধু হ্যাচ থাকবে
- **If unanswered:** fixed default → `stairs-reach`

## common-services — Common Services / সাধারণ সেবা

**Phase kind:** `common_services` · **Repeats:** once · **Units in play:** —

**Goal (EN):** The shared systems: stairs, lift, water, waste, gas and electricity.

**লক্ষ্য (বাংলা):** সবার জন্য সেবা: সিঁড়ি, লিফট, পানি, বর্জ্য, গ্যাস আর বিদ্যুৎ।

### 1. `lift-plan` — choice

- **Ask (EN):** Lift - build it now, keep the shaft ready, or no lift?
- **জিজ্ঞাসা (বাংলা):** লিফট — এখনই বসাবেন, শুধু জায়গা (শ্যাফট) রাখবেন, নাকি লিফট লাগবে না?
- **Why:** Retrofitting a shaft later is very hard; provision now is cheap.
- **কেন:** পরে শ্যাফট বসানো খুব কষ্টের — এখনই জায়গা রাখলে খরচ সামান্য।
- **Maps to:** `/phases/common-services/data/lift`
- **Options:**
  - `provision-only` — Keep the shaft ready · শুধু জায়গা (শ্যাফট) রাখব
  - `now` — Install it now · এখনই বসাব
  - `no` — No lift · লিফট লাগবে না
- **If unanswered:** fixed default → `provision-only`

### 2. `stair-type` — choice

- **Ask (EN):** Which stair type?
- **জিজ্ঞাসা (বাংলা):** সিঁড়ির ধরন কোনটি?
- **Why:** Dog-legged (mid-landing, two runs) is the standard here and saves space.
- **কেন:** ডগ-লেগড (মাঝে ল্যান্ডিং, দুই পাল্লা) এখানে সবচেয়ে প্রচলিত, আর জায়গা বাঁচায়।
- **Maps to:** `/phases/common-services/data/stairType`
- **Options:**
  - `dog-legged` — Dog-legged (two runs) · ডগ-লেগড (দুই পাল্লা)
  - `single-flight` — Straight single flight · সোজা এক পাল্লা
  - `no-preference` — No preference · পছন্দ নেই
- **If unanswered:** fixed default → `dog-legged`

### 3. `stair-position` — choice

- **Ask (EN):** Where should the stairs sit?
- **জিজ্ঞাসা (বাংলা):** সিঁড়ি কোন দিকে থাকবে?
- **Why:** Side stairs keep the front rooms open and let light in.
- **কেন:** পাশে থাকলে সামনের ঘর খোলামেলা থাকে, আলো-বাতাস বেশি ঢোকে।
- **Maps to:** `/phases/common-services/data/stairPosition`
- **Options:**
  - `front` — Front · সামনে
  - `side` — Side · পাশে
  - `back` — Back · পিছনে
  - `corner` — Corner · কোনায়
  - `no-preference` — No preference · পছন্দ নেই
- **If unanswered:** fixed default → `side`

### 4. `water-source` — choice

- **Ask (EN):** Where does water come from - WASA/line, an existing tube well, or a new tube well?
- **জিজ্ঞাসা (বাংলা):** পানি কোথা থেকে আসবে — ওয়াসা/লাইন, পুরনো টিউবওয়েল, নাকি নতুন টিউবওয়েল?
- **Why:** The source decides tank sizes and the pump choice.
- **কেন:** সোর্স ঠিক হলে ট্যাংকের আকার আর পাম্প বাছা হবে।
- **Maps to:** `/phases/common-services/data/waterSource`
- **Options:**
  - `wasa` — WASA / pipeline supply · ওয়াসা / পাইপ লাইন
  - `tubewell-existing` — Existing tube well · পুরনো টিউবওয়েল আছে
  - `tubewell-new` — New tube well needed · নতুন টিউবওয়েল বসাতে হবে
  - `not-sure` — Not sure · জানি না
- **If unanswered:** fixed default → `tubewell-new`
  - **Assumption (EN):** Assumed the building needs its own supply (tube well). If pipeline water is available, tanks can be smaller.
  - **অনুমান (বাংলা):** নিজস্ব ব্যবস্থা (টিউবওয়েল) ধরে নেওয়া হচ্ছে — লাইনের পানি থাকলে ট্যাংক ছোট হলেও চলবে।

### 5. `underground-tank` — yes_no

- **Ask (EN):** Underground water tank, alongside the overhead tank?
- **জিজ্ঞাসা (বাংলা):** ওভারহেড ট্যাংকের সাথে আন্ডারগ্রাউন্ড পানির ট্যাংকও রাখবেন?
- **Why:** Two-stage storage keeps steady pressure when supply is intermittent.
- **কেন:** দুই ধাপে জমা রাখলে লাইন বন্ধ থাকলেও পানির চাপ ঠিক থাকে।
- **Maps to:** `/phases/common-services/data/undergroundTank`
- **If unanswered:** fixed default → `true`

### 6. `sewage` — choice

- **Ask (EN):** Waste - septic tank + soak well, or the city sewer line?
- **জিজ্ঞাসা (বাংলা):** পয়ঃনিষ্কাশন — সেপটিক ট্যাংক + সোক ওয়েল, নাকি শহরের সিউয়ার লাইন?
- **Why:** Where there is no sewer main, septic + soak well is the practical answer.
- **কেন:** সিউয়ার লাইন না থাকলে সেপটিক + সোক ওয়েলই বাস্তব সমাধান।
- **Maps to:** `/phases/common-services/data/sewage`
- **Options:**
  - `septic-soak` — Septic tank + soak well · সেপটিক ট্যাংক + সোক ওয়েল
  - `city-sewer` — City sewer line · শহরের সিউয়ার লাইন
  - `not-sure` — Not sure · জানি না
- **If unanswered:** fixed default → `septic-soak`

### 7. `gas-source` — choice

- **Ask (EN):** Gas - Titas line, cylinder (LPG) only, or provisions for both?
- **জিজ্ঞাসা (বাংলা):** গ্যাস — তিতাস লাইন, শুধু সিলিন্ডার (এলপিজি), নাকি দুইয়েরই ব্যবস্থা?
- **Why:** Assuming LPG means the building works even where the gas line does not reach.
- **কেন:** এলপিজি ধরে নিলে গ্যাস লাইন না থাকলেও বাড়ি চলে।
- **Maps to:** `/phases/common-services/data/gas`
- **Options:**
  - `titas` — Titas gas line · তিতাস গ্যাস লাইন
  - `lpg-only` — LPG cylinders only · শুধু এলপিজি সিলিন্ডার
  - `both-provision` — Provisions for both · দুইয়েরই ব্যবস্থা
- **If unanswered:** fixed default → `lpg-only`

### 8. `electrical-supply` — choice

- **Ask (EN):** Electrical supply - single phase, three phase, or should the app decide?
- **জিজ্ঞাসা (বাংলা):** বিদ্যুৎ সংযোগ — সিঙ্গেল ফেজ, থ্রি ফেজ, নাকি অ্যাপ ঠিক করবে?
- **Why:** Lifts and heavy AC loads need three phase; the app decides from the design.
- **কেন:** লিফট বা ভারী এসি লোডে থ্রি ফেজ লাগে; অ্যাপ নকশা দেখে ঠিক করবে।
- **Maps to:** `/phases/common-services/data/electricalSupply`
- **Options:**
  - `app-decides` — Let the app decide (recommended) · অ্যাপ ঠিক করবে (প্রস্তাবিত)
  - `single-phase` — Single phase · সিঙ্গেল ফেজ
  - `three-phase` — Three phase · থ্রি ফেজ
- **If unanswered:** fixed default → `app-decides`
